# Plan — Aplicación macOS (Apple Silicon)

> **Objetivo del proyecto:** un cliente nativo de escritorio para macOS que consume el API
> existente (`docs/API.md`) sobre HTTPS. El servidor web + Docker **se mantiene** como fuente
> de verdad y modo multiusuario ("coexisten").
>
> **Canales de publicación (ambos desde el inicio):**
> 1. **Mac App Store (MAS)** — certificado *Apple Distribution*, App Sandbox obligatorio, revisión de Apple.
> 2. **Developer ID** — DMG notarizado para descarga directa, fuera de la tienda.
>
> **Forma:** app nativa **SwiftUI** (sin Node ni SQLite embebidos). Es un cliente REST/WebSocket.

---

## 1. Decisiones de arquitectura

| Tema | Decisión | Motivo |
| --- | --- | --- |
| UI | **SwiftUI** (macOS 14 Sonoma como mínimo; revisar a 13 si hace falta alcance) | Nativo, compatible con App Store, sin fricción de sandbox |
| Arquitectura | **MV + servicios** (`@Observable` en Swift 5.9 / Observation framework). Sin backend embebido | La lógica de negocio vive en el servidor |
| Red | `URLSession` + `async/await`, capa `APIClient` tipada con `Codable` | Estándar, testeable |
| Tiempo real | `socket.io-client-swift` (SPM) | El backend usa Socket.io v4 |
| Auth | JWT en **Keychain** (`kSecClassGenericPassword`, `kSecAttrAccessibleAfterFirstUnlock`) | Requisito de seguridad y de review |
| Imágenes de plano | Descarga vía `URLSession` + caché en disco (`URLCache` o `NSCache` + carpeta *Caches*) | Planos son imágenes grandes; Leaflet no aplica en nativo |
| Render del plano + chinchetas | `MKMapView` con `MKTileOverlay` propio **o** una vista custom con `ScrollView`+`Magnification`+overlay de anotaciones sobre la imagen | El plano es una imagen, no un mapa geográfico. Empezar con vista custom (zoom/pan + capa de pins en coordenadas `lat/lng` = píxeles) |
| Markdown (visor de documentos) | `AttributedString(markdown:)` nativo | Sin dependencias |
| Gráficas (stats) | **Swift Charts** | Nativo, sin dependencias |
| Distribución de dependencias | **Swift Package Manager** únicamente | Sin CocoaPods/Carthage |
| Generación del proyecto Xcode | **XcodeGen** (`project.yml` versionado) | El `.xcodeproj` no se versiona; menos conflictos |

### Módulos de la app

```
GestorTareasApp/
├── App/                 # @main, escena, routing, estado global de sesión
├── Core/
│   ├── Networking/      # APIClient, Endpoint, APIError (decoder tolerante §5 de API.md)
│   ├── Auth/            # SessionStore, KeychainService, flujo login/logout/expiración
│   ├── Realtime/        # SocketClient (issue:created/updated/deleted, settings:updated)
│   └── Persistence/     # caché de imágenes, últimos filtros (UserDefaults)
├── Models/              # Issue, Map, MapZone, Comment, UserRef, Notification, Settings (Codable)
├── Features/
│   ├── Login/
│   ├── IssueList/       # lista + filtros (status, priority, categoría, asignación, fechas, q)
│   ├── IssueDetail/     # detalle, comentarios (árbol), historial, ubicación en plano
│   ├── IssueEditor/     # crear/editar, subida multipart (photo + file), prueba de resolución
│   ├── PlanView/        # visor de plano con chinchetas + capas + zonas
│   ├── Stats/           # Swift Charts
│   ├── Notifications/   # centro de notificaciones
│   └── Admin/           # usuarios, settings (solo role == admin)
└── Resources/           # Assets, Localizable (es base), Info.plist, *.entitlements
```

---

## 2. Estructura en el repo (monorepo)

La app vive en este mismo repositorio para compartir el contrato de API y la documentación:

```
/                         # backend Node (sin cambios de layout)
├── src/ …
├── docs/API.md           # contrato consumido por la app
├── docs/PLAN_APP_MACOS.md # este documento
└── clients/
    └── macos/
        ├── project.yml            # XcodeGen
        ├── Makefile               # atajos: generate, build, test, archive-mas, archive-devid, notarize
        ├── GestorTareasApp/       # código Swift (ver §1)
        ├── Config/
        │   ├── Debug.xcconfig
        │   ├── Release-MAS.xcconfig
        │   └── Release-DevID.xcconfig
        ├── Signing/
        │   ├── GestorTareas-MAS.entitlements
        │   └── GestorTareas-DevID.entitlements
        └── scripts/
            ├── build_mas.sh
            ├── build_devid.sh
            └── notarize.sh
```

Alternativa descartada por ahora: repo separado. Se reconsiderará si el ciclo de release de la app diverge mucho del backend.

---

## 3. Firma, entitlements y los dos canales

### 3.1 Requisitos de cuenta Apple

- Apple Developer Program activo (99 €/año).
- Certificados en el llavero de la máquina de build:
  - **`Apple Distribution`** + *provisioning profile* de la App (MAS).
  - **`Developer ID Application`** (Developer ID / fuera de tienda).
  - **`Mac Installer Distribution`** (solo si se sube `.pkg` a MAS vía Transporter/altool).
- App ID registrado (p. ej. `com.edefrutos.gestortareas`) con capacidades: *App Sandbox*, *(opcional) Push*.
- Para notarización: contraseña específica de app o clave API de App Store Connect (`notarytool --key`).

### 3.2 Entitlements

**Común (ambos canales):** al ser solo cliente HTTPS, el set es mínimo.

| Entitlement | MAS | Developer ID | Motivo |
| --- | --- | --- | --- |
| `com.apple.security.app-sandbox` | ✅ obligatorio | ✅ recomendado | Requisito MAS; buena práctica en DevID |
| `com.apple.security.network.client` | ✅ | ✅ | Llamadas al servidor |
| `com.apple.security.files.user-selected.read-write` | ✅ | ✅ | Elegir foto/documento a adjuntar y exportar CSV/PDF |
| `com.apple.security.network.server` | ❌ | ❌ | **No** se necesita: no hay servidor local embebido |
| Hardened Runtime | (implícito en MAS) | ✅ obligatorio para notarizar | — |

Si más adelante se adjuntan capturas desde cámara/pantalla, añadir los `usage strings` en `Info.plist` (`NSCameraUsageDescription`, etc.).

### 3.3 Pipeline

```
XcodeGen (project.yml) ─┬─> scheme "Release-MAS"  ─> archive ─> export (App Store Connect)
                        │                                       └─> Transporter / notarytool (key ASC) ─> revisión Apple
                        └─> scheme "Release-DevID" ─> archive ─> export (Developer ID) ─> create-dmg
                                                                 └─> xcrun notarytool submit --wait ─> xcrun stapler staple ─> DMG publicable
```

Diferencias clave entre los dos archivos `.xcconfig`:

| | Release-MAS | Release-DevID |
| --- | --- | --- |
| `CODE_SIGN_IDENTITY` | `Apple Distribution` | `Developer ID Application` |
| `PROVISIONING_PROFILE_SPECIFIER` | perfil MAS | (ninguno / automático) |
| `ENABLE_HARDENED_RUNTIME` | — | `YES` |
| Entitlements | `GestorTareas-MAS.entitlements` | `GestorTareas-DevID.entitlements` |
| Empaquetado | `.pkg` a App Store Connect | `.dmg` notarizado |
| `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` | compartidos (una sola verdad) | idem |

### 3.4 CI (fase posterior)

GitHub Actions `macos-14` runner: `xcodegen generate` → `xcodebuild test` en cada PR. Los jobs de `archive`/`notarize` requieren secrets (certificados base64, clave ASC) y se activan solo en tags `app-v*`.

---

## 4. Hitos

> Cada hito es una rama `feat/macos-*` y termina con la app compilando + tests verdes.

### Hito 0 — Andamiaje (sin firma) ✅
- [x] `clients/macos/` con `project.yml` (XcodeGen), `Makefile`, `.xcconfig` x4 (Base + 3), entitlements x2, `scripts/notarize.sh`.
- [x] App SwiftUI que arranca, lee `baseURL` de un ajuste (`AppSettings` + `PreferencesView`), y muestra pantalla de login.
- [x] `APIClient` (async/await) + `APIError` (decoder tolerante A/B/Zod de `docs/API.md §5`).
- [x] `KeychainService` + `SessionStore` (persistir/recuperar/borrar token; logout automático en 401).
- [x] `IssueListView` de solo lectura (`GET /v1/issues`) como prueba de extremo a extremo.
- [x] Target de tests + `DecodingTests` (login, issues, tolerancia a nulos, 3 formatos de error).
- [x] **Verificado en Mac** (macOS 14, Apple Silicon, Xcode-beta): `make test` → `** TEST SUCCEEDED **`.

### Hito 1 — Lectura ✅
- [x] Login real contra `/v1/auth/login`; manejo de `401` y de expiración (→ logout con aviso "sesión caducada", reactivo vía `handleUnauthorized`).
- [x] `IssueList` con paginación (scroll infinito) y filtros `q`, `status`, `category`, `order` y ámbito (`only_assigned_to_me` / `only_created_by_me`). **Pendiente (movido a Hito 2):** rango de fechas (`from` / `to`), `mapId` y `assigned_to` — necesitan selectores de mapa y de usuario.
- [x] `IssueDetail`: campos, `*_url` resueltas contra `baseURL` (`AppSettings.mediaURL`), historial (`/logs`), comentarios (árbol, solo lectura).
- [x] `Stats` con Swift Charts desde `/v1/issues/stats` + `/stats/details`.
- [x] Indicador de conexión con `GET /health` (sondeo cada 30 s en la toolbar).
- [x] **Verificado en Mac** (macOS 14, Apple Silicon, Xcode): `make test` verde + captura de la app en ejecución.

### Hito 2 — Escritura ✅
- [x] Crear tarea: `IssueEditorView` + `IssueDraft` → subida `multipart` (`photo`, `file`) con `fileImporter` (sandbox, lectura de bytes con ámbito de seguridad). Coordenadas `lat/lng` por campo numérico (selector visual → Hito 3).
- [x] Editar tarea: estado, prioridad, `due_date`, categoría, `map_id`, asignación (`/v1/users/for-assign`), prueba de resolución (`resolution_photo` / `resolution_doc`). Solo se envían los campos que cambian.
- [x] Completar filtros de `IssueList` pendientes del Hito 1: rango de fechas (`from` / `to`), filtro por mapa (`mapId` vía `/v1/maps`) y por persona asignada (`assigned_to`) — en el popover "Más filtros".
- [x] Publicar comentarios y respuestas (`parent_id`): compositor en `IssueDetailView` + acción "Responder" por nodo del árbol.
- [x] Manejo de `403` (no propietario/asignado) y de rechazo de subida — el backend de tareas devuelve `400 { code: "upload_error" }` para el fichero grande, no `413`; `APIError.isUploadRejected` cubre ambos.
- [x] **Verificado en Mac** (macOS 14, Apple Silicon, Xcode): `make test` → `** TEST SUCCEEDED **`.

> Infra nueva: `MultipartForm`, `APIClient.Request.multipart`, `GestorAPI` (`createIssue`, `updateIssue`,
> `addComment`, `usersForAssign`, `maps`), modelo `MapRef`, `APIError.code`. Tests de decodificación/
> multipart añadidos en `DecodingTests`.
>
> **Contrato verificado contra el backend real** (servidor Node aislado — `NODE_ENV=test`, DB y
> `uploads` en un directorio temporal, sin tocar los datos del proyecto — con `curl` reproduciendo
> byte a byte el `multipart/form-data` que construye `IssueDraft`): crear con `lat/lng` en coma
> decimal + `photo`/`file`, `PATCH` solo-los-campos-que-cambian, prueba de resolución
> (`resolution_photo`/`resolution_doc`), comentario y respuesta (`parent_id` numérico), los dos
> `403` (ajeno a la tarea, y asignado intentando reasignar), rechazo de subida por tamaño y por
> extensión (confirmado: **`400 { code: "upload_error" }`, nunca `413`**, tal como asume
> `APIError.isUploadRejected`), y los filtros nuevos (`from`/`to`/`mapId`/`assigned_to`) acotando
> resultados de verdad. Lo que queda pendiente, y requiere el Mac, es la interacción real con la UI
> compilada (`fileImporter`, bindings del formulario, `AsyncImage`) — este sandbox no tiene Xcode.

### Hito 3 — Plano + tiempo real ✅
- [x] `PlanView`: descarga de la imagen del plano (tamaño real en píxeles vía `ImageIO`, no el de
  `AsyncImage`), zoom (pellizco/botones) + pan (`ScrollView`), chinchetas por `lat/lng` coloreadas
  por estado (relleno) y prioridad (borde). Botón "Ver en el plano" en `IssueDetailView` abre el
  plano de esa tarea en una hoja, con esa chincheta resaltada.
- [x] Capas técnicas (`layers` de `GET /v1/maps/:id`) superpuestas a opacidad fija 0.7 (como la
  SPA), activables desde un menú; zonas (`GET /v1/maps/:mapId/zones`) dibujadas como polígono
  relleno + borde a partir de su `geojson` (solo anillo exterior, sin agujeros).
- [x] `SocketClient` (SPM `socket.io-client-swift`, sin auth en el handshake — ver `API.md §4`):
  aplica `issue:created/updated/deleted` en vivo sobre la lista, el detalle y el plano;
  `settings:updated` se recibe pero no hace nada todavía (no hay panel admin hasta el Hito 4).
- [x] Deep-link `gestortareas://issue/<id>` y `gestortareas://open?issue=<id>` (mismo parámetro que
  el QR de la web) vía `CFBundleURLTypes` + `DeepLinkRouter`, funciona con la app cerrada o ya
  abierta, con o sin sesión iniciada.
- [x] **Verificado en Mac** (Apple Silicon, Xcode): `make test` → `** TEST SUCCEEDED **`
  (resuelve el paquete SPM `socket.io-client-swift` 16.1.0 sin problemas).

> **Sistema de coordenadas — la pieza que hay que acertar.** El plano NO usa los píxeles nativos de
> la imagen: la SPA (`src/public/ui/modules/map.js`, Leaflet `CRS.Simple`) normaliza el eje largo a
> 1000 unidades y el corto a `1000·corto/largo`, origen abajo-izquierda, eje Y hacia arriba. `lat` es
> Y, `lng` es X. `PlanCoordinateSpace` (con tests) reproduce esa misma fórmula; si algún día cambia
> en el backend/SPA, hay que tocar ambos lados a la vez.
>
> **Universal Links fuera de alcance.** El QR de la web genera una URL `https://…?issue=<id>`
> normal; interceptarla de verdad (sin el esquema `gestortareas://`) requeriría alojar un
> `apple-app-site-association` en el dominio del servidor (Associated Domains), que es trabajo de
> backend/infra, no de este cliente.
>
> **Verificado por curl contra el backend real** en este mismo sandbox (servidor Node aislado,
> `NODE_ENV=test`, DB temporal): `GET /v1/maps/:id` con `layers`, `GET/POST /v1/maps/:mapId/zones`
> con el `geojson` exacto que espera `MapZone.polygonRings`, y los tres eventos de Socket.io
> (`issue:created/updated/deleted`, protocolo EIO4) emitidos con el payload que decodifica
> `SocketClient`.
>
> **Verificado en Mac** (Apple Silicon, Xcode): `make test` → `** TEST SUCCEEDED **`, incluyendo la
> resolución del paquete SPM `socket.io-client-swift` (sin conflictos con `Starscream 4.0.6`, su
> dependencia fijada).

### Hito 4 — Admin + notificaciones ✅
- [x] Centro de notificaciones (`/v1/notifications`, polling 30 s hasta que exista evento realtime):
  `NotificationsView` + `NotificationsViewModel`, con `id` sintético (el backend no da uno propio
  para esta lista combinada comment/reply/log) e icono/color por tipo; tocar una fila abre la tarea.
- [x] Panel admin (`AdminView`, solo `session.isAdmin`, con un segmentado Usuarios/Configuración):
  - Usuarios (`AdminUsersView` + `AdminUsersViewModel`, paginado igual que `IssueListView`):
    alta (`AdminUserEditorView`, modo crear/editar igual que `IssueEditorView`), baja con
    confirmación (el backend rechaza que un admin se borre a sí mismo; el botón ya sale
    deshabilitado en esa fila), edición de `role`/`email`/`password` enviando solo lo que cambia.
  - Settings (`AdminSettingsView` + `AdminSettingsViewModel`): las 7 claves de
    `config.service.js::getAllSettings` (tipos ya mixtos — booleano/número/cadena — que decodifica
    `AppRuntimeSettings`), `PATCH` solo con el diff (`SettingsPatch`). Cierra lo que el Hito 3 dejó
    pendiente: `settings:updated` (Socket.io) ahora recarga el panel si otro admin cambia algo.
- [x] Recuperación de contraseña: pantallas nativas (`ForgotPasswordView` → `POST forgot-password`;
  `ResetPasswordView` → `POST reset-password`), enlazadas desde `LoginView`. El email de
  recuperación (`mail.service.js`) apunta a una URL de la SPA web
  (`<PUBLIC_URL>/#reset-password?token=…`) que este cliente no intercepta (mismo motivo que los
  Universal Links del Hito 3); en vez de eso, `ResetPasswordView` deja pegar el enlace completo o
  solo el token y `ResetTokenParsing` (con tests) extrae el valor en cualquiera de los dos casos.
- [x] **Verificado en Mac** (Apple Silicon, Xcode): `make test` → `** TEST SUCCEEDED **` tras
  corregir `NSTextContentType.emailAddress` (no `.email`, que solo existe en UIKit) en los dos
  campos de email nuevos (`AdminUserEditorView`, `AdminSettingsView`).

> Los modelos de datos (`AppNotification`, `AdminUser`, `AppRuntimeSettings`, `SettingsPatch`,
> `ResetTokenParsing`) tienen tests de decodificación en `DecodingTests` a partir de las respuestas
> reales de `src/routes/notifications.routes.js`, `src/routes/users.routes.js` y
> `src/services/config.service.js`; a diferencia de los Hitos 2 y 3, el contrato no se reprodujo por
> `curl` contra un backend real en este Hito (ya estaba fijado en `docs/API.md` y en el propio
> código del backend), lo que dejó pasar el único fallo real: un nombre de caso de enum específico
> de macOS que ningún test de decodificación podía atrapar.

### Hito 5 — Distribución 🚧
- [x] `.xcconfig` MAS y DevID (ya venían del Hito 0: identidades de firma, entitlements,
  `ENABLE_HARDENED_RUNTIME`). Añadido `scripts/ExportOptions-MAS.plist` + `scripts/export_mas.sh`
  + `make export-mas` (faltaba el equivalente de exportación de `notarize.sh` para el canal MAS).
  `DEVELOPMENT_TEAM` (`Config/Base.xcconfig`) y los nombres exactos de provisioning profile
  (`Config/Release-MAS.xcconfig`, `scripts/ExportOptions-MAS.plist`, `scripts/ExportOptions-DevID.plist`)
  tienen los valores reales de la cuenta Apple Developer, y el archive MAS pasa **Validate App** en
  Xcode Organizer sin errores. Bloqueo encontrado por el camino: la Mac de pruebas corre macOS 27
  beta y solo permite instalar Xcode 27 beta (Apple rechaza subidas hechas con beta); se resolvió
  usando el **Release Candidate** de Xcode 27, que sí acepta. **Pendiente:** archive DevID (aún no
  probado en Xcode real).
- [x] Script `notarize.sh` (notarytool + stapler) y DMG (`hdiutil`, ya venía del Hito 0) +
  `export_mas.sh` (nuevo, ver arriba) para el canal MAS.
- [ ] Primera *build* de MAS a App Store Connect (TestFlight) — el app record ya existe en App
  Store Connect y el archive ha pasado Validate App; falta el `Distribute App` real (subida). Primer
  DMG notarizado del canal DevID: pendiente.
- [x] Iconos (`AppIcon` 16→1024): `Assets.xcassets/AppIcon.appiconset` generado a partir del logo
  aportado por el usuario (`gestor-tareas.png`, recortado y reescalado a los 10 tamaños que exige
  macOS). Estilo "tarjeta con sombra" válido para macOS pero poco legible en 16/32px — revisar si
  merece una versión simplificada para esas medidas.
  `Localizable` (es): `es.lproj/Localizable.strings` tiene ~30 claves del Hito 0/1, pero **ningún**
  `Text(...)` de los Hitos 1-4 las usa de verdad — todo el texto de la UI está en literales
  españoles directos. Migrar a claves de localización es un refactor grande, pendiente de decidir
  si merece la pena para un único idioma. Textos de ficha de App Store y capturas: pendientes.
- [x] CI: `.github/workflows/macos-client-ci.yml` — `xcodegen generate` + `make test` en
  `macos-14`, solo cuando cambia algo en `clients/macos/**`. No necesita secrets: `Debug.xcconfig`
  firma en modo `Automatic`/ad-hoc (`CODE_SIGN_IDENTITY = -`), sin Team ID.

### Trabajo de backend en paralelo (ver `docs/API.md §6`)
- [ ] Refresh token / sesión configurable.
- [ ] Auth en el handshake de Socket.io + salas por usuario.
- [ ] Formato de error unificado.
- [ ] `GET /v1/version` para control de compatibilidad de cliente.

---

## 5. Riesgos y notas

- **Review 4.2 (MAS):** el riesgo de "mínima funcionalidad" es bajo porque es una app nativa real (no un `WKWebView` envolviendo la web). Mantenerla así.
- **Sandbox + adjuntos:** usar siempre `NSOpenPanel`/`fileImporter`; nunca rutas absolutas. Guardar en *Application Support*/*Caches* del contenedor.
- **HTTP en desarrollo:** si el servidor local va sin TLS, añadir excepción ATS **solo** en `Debug.xcconfig`/`Info.plist` de debug, nunca en release.
- **Versionado:** `MARKETING_VERSION` de la app es independiente del `package.json` del backend. Documentar la matriz app↔API en este archivo cuando exista `/v1/version`.
- **Un solo idioma hoy (es).** Estructurar con `Localizable.strings` desde el Hito 0 para no reconvertir literales más tarde.
