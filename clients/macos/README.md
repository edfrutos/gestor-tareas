# Gestor de Tareas — Cliente macOS (Apple Silicon)

App nativa **SwiftUI** que consume el API del backend (`../../docs/API.md`). El servidor web +
Docker sigue siendo la fuente de verdad; esta app es un cliente REST/WebSocket.

Plan y hoja de ruta: **`../../docs/PLAN_APP_MACOS.md`**.

## Requisitos

- macOS 14 (Sonoma) o superior · Apple Silicon
- Xcode 15+
- [XcodeGen](https://github.com/yonaskolb/XcodeGen): `brew install xcodegen`

## Puesta en marcha

```bash
cd clients/macos
make open        # genera GestorTareas.xcodeproj y lo abre en Xcode
# o:
make build       # compila (Debug)
make test        # tests unitarios (Debug)
```

El `.xcodeproj` **no se versiona**: se regenera con `make generate` a partir de `project.yml`.
Desde el Hito 3, `project.yml` declara una dependencia SPM (`socket.io-client-swift`): la primera
vez que abras el proyecto, Xcode necesita red para resolverla.

Al arrancar, la app pide la **URL del servidor** (menú *Gestor de Tareas → Ajustes…*):

| Entorno | URL |
| --- | --- |
| Caddy (HTTPS local) | `https://localhost:8443` |
| Node local sin Docker | `http://localhost:3000` |
| Docker directo | `http://localhost:3001` |

`Info.plist` incluye `NSAllowsLocalNetworking` para permitir `http://localhost` en desarrollo
sin debilitar TLS de hosts reales.

## Estructura

```
project.yml                 Definición del proyecto (XcodeGen)
Config/                     xcconfig: Base + Debug + Release-MAS + Release-DevID
Signing/                    Entitlements por canal (MAS y Developer ID)
scripts/                    notarize.sh + ExportOptions
GestorTareasApp/
├── App/                    @main, RootView, AppSettings, DeepLinkRouter
├── Core/
│   ├── Networking/         APIClient (async/await, JSON + multipart) + APIError (decoder tolerante)
│   ├── Auth/               KeychainService + SessionStore
│   └── Realtime/           SocketClient (Socket.io: issue:created/updated/deleted)
├── Models/                 Issue, MapDetail/MapZone, SessionUser, Paginated, enums…
├── Features/               Login, Main, IssueList, IssueDetail, IssueEditor, PlanView, Stats, Preferences
└── Resources/              Info.plist (incl. esquema gestortareas://), Assets.xcassets, es.lproj
Tests/                      DecodingTests (login, issues, multipart, plano/zonas, deep-link, socket)
```

## Los dos canales de publicación

| | Scheme | Config | Salida |
| --- | --- | --- | --- |
| **Mac App Store** | `GestorTareas (Mac App Store)` | `Release-MAS` | `.xcarchive` → App Store Connect |
| **Developer ID** | `GestorTareas (Developer ID)` | `Release-DevID` | `.xcarchive` → `make notarize` → DMG notarizado |

Antes de archivar hay que rellenar:

- `Config/Base.xcconfig` → `DEVELOPMENT_TEAM`
- `Config/Release-MAS.xcconfig` → `PROVISIONING_PROFILE_SPECIFIER`
- `scripts/ExportOptions-DevID.plist` → `teamID`
- Alta única del perfil de notarización (ver cabecera de `scripts/notarize.sh`)

## Estado

**Hitos 0-2 verificados en Mac** (andamiaje, lectura completa, escritura: crear/editar tareas,
comentarios, filtros avanzados). **Hito 3** (plano con zoom/pan, capas, zonas, tiempo real y
deep-link) escrito pero aún sin compilar en Xcode. Siguientes hitos en
`../../docs/PLAN_APP_MACOS.md §4`.

> Gran parte de este cliente se ha escrito sin acceso a Xcode: revisa la primera compilación de
> cada hito en tu Mac y corrige cualquier ajuste de API de SwiftUI que tu versión de Xcode requiera.
