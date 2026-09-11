import XCTest
@testable import GestorTareas

final class DecodingTests: XCTestCase {

    private let decoder = JSONDecoder()

    // MARK: Auth / issues

    func testLoginResponse() throws {
        let json = Data("""
        {
          "token": "abc.def.ghi",
          "user": { "id": 1, "username": "admin", "email": "a@b.com", "role": "admin" }
        }
        """.utf8)

        let response = try decoder.decode(LoginResponse.self, from: json)
        XCTAssertEqual(response.token, "abc.def.ghi")
        XCTAssertEqual(response.user.id, 1)
        XCTAssertTrue(response.user.isAdmin)
    }

    func testPaginatedIssues() throws {
        let json = Data("""
        {
          "items": [
            {
              "id": 42, "title": "Farola rota", "category": "alumbrado",
              "description": "No enciende", "lat": 120.5, "lng": 340.0,
              "photo_url": "/uploads/x.jpg", "thumb_url": "/uploads/x_thumb.jpg",
              "text_url": null, "resolution_photo_url": null,
              "resolution_thumb_url": null, "resolution_text_url": null,
              "status": "in_progress", "priority": "high", "due_date": "2026-10-01",
              "created_at": "2026-09-08T10:00:00.000Z", "created_by": 3,
              "created_by_username": "tecnico1", "map_id": 1,
              "assigned_to": 5, "assigned_to_username": "tecnico2"
            }
          ],
          "page": 1, "pageSize": 100, "total": 1
        }
        """.utf8)

        let page = try decoder.decode(Paginated<Issue>.self, from: json)
        XCTAssertEqual(page.total, 1)
        let issue = try XCTUnwrap(page.items.first)
        XCTAssertEqual(issue.id, 42)
        XCTAssertEqual(issue.status, .inProgress)
        XCTAssertEqual(issue.priority, .high)
        XCTAssertEqual(issue.assignedToUsername, "tecnico2")
    }

    func testIssueToleratesMissingPriorityAndNulls() throws {
        let json = Data("""
        {
          "id": 7, "title": "Banco roto", "category": "mobiliario",
          "description": "Madera astillada", "status": "open", "created_at": ""
        }
        """.utf8)

        let issue = try decoder.decode(Issue.self, from: json)
        XCTAssertEqual(issue.priority, .medium)   // fallback
        XCTAssertNil(issue.lat)
        XCTAssertNil(issue.assignedTo)
    }

    // MARK: Detalle — logs y comentarios

    func testLogsArray() throws {
        let json = Data("""
        [
          { "id": 3, "issue_id": 7, "user_id": 2, "action": "update_status",
            "old_value": "open", "new_value": "in_progress",
            "created_at": "2026-09-08T11:00:00.000Z" },
          { "id": 1, "issue_id": 7, "user_id": null, "action": "create",
            "old_value": null, "new_value": null,
            "created_at": "2026-09-08T10:00:00.000Z" }
        ]
        """.utf8)

        let logs = try decoder.decode([IssueLog].self, from: json)
        XCTAssertEqual(logs.count, 2)
        XCTAssertEqual(logs[0].actionLabel, "Cambio de estado")
        XCTAssertNil(logs[1].userID)
    }

    func testCommentTree() throws {
        let json = Data("""
        [
          {
            "id": 1, "issue_id": 7, "user_id": 2, "username": "ana",
            "parent_id": null, "text": "Revisado", "created_at": "2026-09-08T10:00:00.000Z",
            "replies": [
              {
                "id": 2, "issue_id": 7, "user_id": 3, "username": "beto",
                "parent_id": 1, "text": "Gracias", "created_at": "2026-09-08T10:05:00.000Z",
                "replies": []
              }
            ]
          }
        ]
        """.utf8)

        let roots = try decoder.decode([Comment].self, from: json)
        XCTAssertEqual(roots.count, 1)
        XCTAssertEqual(roots[0].replies.count, 1)
        XCTAssertEqual(roots[0].replies[0].displayName, "beto")
    }

    // MARK: Estadísticas

    func testIssueStats() throws {
        let filled = try decoder.decode(IssueStats.self,
                                        from: Data(#"{"open":2,"in_progress":1,"resolved":5,"total":8}"#.utf8))
        XCTAssertEqual(filled.inProgress, 1)
        XCTAssertEqual(filled.total, 8)

        let empty = try decoder.decode(IssueStats.self, from: Data("{}".utf8))
        XCTAssertEqual(empty.total, 0)
    }

    func testStatsDetails() throws {
        let json = Data("""
        {
          "byStatus": { "open": 2, "resolved": 5 },
          "byCategory": { "alumbrado": 4, "limpieza": 3 },
          "byUser": [ { "username": "ana", "count": 6 }, { "username": "beto", "count": 1 } ]
        }
        """.utf8)

        let details = try decoder.decode(StatsDetails.self, from: json)
        XCTAssertEqual(details.byStatus["open"], 2)
        XCTAssertEqual(details.byCategory["alumbrado"], 4)
        XCTAssertEqual(details.byUser.first?.username, "ana")
    }

    // MARK: APIError — los tres formatos de `docs/API.md §5`

    func testAPIErrorObjectForm() {
        let data = Data(#"{"error":{"code":"unauthorized","message":"Falta token","requestId":"req-1"}}"#.utf8)
        let error = APIError.from(status: 401, data: data)
        XCTAssertEqual(error.kind, .unauthorized)
        XCTAssertEqual(error.message, "Falta token")
        XCTAssertEqual(error.requestID, "req-1")
    }

    func testAPIErrorStringForm() {
        let data = Data(#"{"error":"Usuario o contraseña incorrectos"}"#.utf8)
        let error = APIError.from(status: 401, data: data)
        XCTAssertEqual(error.message, "Usuario o contraseña incorrectos")
    }

    func testAPIErrorZodArrayForm() {
        let data = Data(#"{"error":[{"path":["title"],"message":"Title is required"}]}"#.utf8)
        let error = APIError.from(status: 400, data: data)
        XCTAssertEqual(error.kind, .server(status: 400))
        XCTAssertEqual(error.message, "title: Title is required")
        XCTAssertEqual(error.validationMessages, ["title: Title is required"])
    }

    func testAPIErrorFallbackWhenBodyEmpty() {
        let error = APIError.from(status: 403, data: Data())
        XCTAssertEqual(error.kind, .forbidden)
        XCTAssertFalse(error.message.isEmpty)
    }

    // MARK: IssueFilter → query items

    func testIssueFilterQueryItems() {
        var filter = IssueFilter()
        filter.query = "  farola  "
        filter.status = .open
        filter.category = "alumbrado"
        filter.order = .priority
        filter.scope = .assignedToMe

        let items = filter.queryItems(page: 2)
        let dict = Dictionary(uniqueKeysWithValues: items.map { ($0.name, $0.value ?? "") })
        XCTAssertEqual(dict["page"], "2")
        XCTAssertEqual(dict["q"], "farola")
        XCTAssertEqual(dict["status"], "open")
        XCTAssertEqual(dict["category"], "alumbrado")
        XCTAssertEqual(dict["order"], "priority")
        XCTAssertEqual(dict["only_assigned_to_me"], "true")
    }

    // MARK: Hito 2 — filtros avanzados

    func testIssueFilterAdvancedQueryItems() {
        var filter = IssueFilter()
        filter.mapID = 3
        filter.assignedTo = 7
        filter.fromDate = AppDate.parseDay("2026-01-01")
        filter.toDate = AppDate.parseDay("2026-03-31")

        let dict = Dictionary(uniqueKeysWithValues:
            filter.queryItems(page: 1).map { ($0.name, $0.value ?? "") })
        XCTAssertEqual(dict["mapId"], "3")
        XCTAssertEqual(dict["assigned_to"], "7")
        XCTAssertEqual(dict["from"], "2026-01-01")
        XCTAssertEqual(dict["to"], "2026-03-31")
        XCTAssertTrue(filter.hasAdvancedFilters)

        filter.clearAdvancedFilters()
        XCTAssertFalse(filter.hasAdvancedFilters)
    }

    // MARK: Hito 2 — datos de referencia (for-assign, maps)

    func testUsersForAssignDecoding() throws {
        let json = Data(#"{"items":[{"id":2,"username":"ana"},{"id":5,"username":"beto"}]}"#.utf8)
        let page = try decoder.decode(Paginated<UserRef>.self, from: json)
        XCTAssertEqual(page.items.count, 2)
        XCTAssertEqual(page.items.first?.username, "ana")
        XCTAssertNil(page.total)
    }

    func testMapRefDecoding() throws {
        let json = Data("""
        [
          { "id": 1, "name": "Planta baja", "parent_id": null },
          { "id": 2, "parent_id": 1 }
        ]
        """.utf8)
        let maps = try decoder.decode([MapRef].self, from: json)
        XCTAssertEqual(maps.count, 2)
        XCTAssertNil(maps[0].parentID)
        XCTAssertEqual(maps[1].parentID, 1)
        XCTAssertEqual(maps[1].name, "Plano 2")   // fallback cuando falta "name"
    }

    // MARK: Hito 2 — comentario recién creado (201 de POST /comments)

    func testCreatedCommentDecoding() throws {
        let json = Data("""
        {
          "id": 9, "issue_id": 7, "user_id": 2, "parent_id": 1,
          "username": "ana", "text": "De acuerdo",
          "created_at": "2026-09-10T09:00:00.000Z", "replies": []
        }
        """.utf8)
        let comment = try decoder.decode(Comment.self, from: json)
        XCTAssertEqual(comment.id, 9)
        XCTAssertEqual(comment.parentID, 1)
        XCTAssertEqual(comment.displayName, "ana")
        XCTAssertTrue(comment.replies.isEmpty)
    }

    // MARK: Hito 2 — APIError.code + rechazo de subida

    func testAPIErrorCapturesCodeAndFlagsUploadRejection() {
        let data = Data(#"{"error":{"code":"upload_error","message":"File too large"}}"#.utf8)
        let error = APIError.from(status: 400, data: data)
        XCTAssertEqual(error.code, "upload_error")
        XCTAssertTrue(error.isUploadRejected)

        let plain = APIError.from(status: 413, data: Data())
        XCTAssertTrue(plain.isUploadRejected)

        let forbidden = APIError.from(status: 403, data: Data())
        XCTAssertFalse(forbidden.isUploadRejected)
    }

    // MARK: Hito 2 — multipart/form-data

    func testMultipartFormBuildsFieldsAndFile() {
        var form = MultipartForm()
        form.addField("title", "Farola rota")
        form.addField("assigned_to", "")
        form.addFile(.photo, filename: "foto.jpg", mimeType: "image/jpeg",
                     data: Data("BYTES".utf8))
        let (body, contentType) = form.finalize()
        let text = String(decoding: body, as: UTF8.self)

        XCTAssertTrue(contentType.hasPrefix("multipart/form-data; boundary="))
        XCTAssertTrue(text.contains(#"name="title""#))
        XCTAssertTrue(text.contains("Farola rota"))
        XCTAssertTrue(text.contains(#"name="assigned_to""#))   // campo vacío también viaja
        XCTAssertTrue(text.contains(#"name="photo"; filename="foto.jpg""#))
        XCTAssertTrue(text.contains("Content-Type: image/jpeg"))
        XCTAssertTrue(text.hasSuffix("--\r\n"))
    }

    // MARK: Hito 2 — IssueDraft → multipart

    func testIssueDraftCreateFormHasRequiredFields() {
        var draft = IssueDraft()
        draft.title = "  Farola rota  "
        draft.category = "alumbrado"
        draft.details = "No enciende"
        draft.x = "120,5"          // coma decimal admitida
        draft.y = "340"
        draft.mapID = 2
        draft.priority = .high

        XCTAssertTrue(draft.creationProblems.isEmpty)

        var form = draft.makeCreateForm()
        let text = String(decoding: form.finalize().body, as: UTF8.self)
        XCTAssertTrue(text.contains(#"name="title""#))
        XCTAssertTrue(text.contains("Farola rota"))
        XCTAssertTrue(text.contains(#"name="lat""#))
        XCTAssertTrue(text.contains("120.5"))          // normalizada a punto
        XCTAssertTrue(text.contains(#"name="map_id""#))
        XCTAssertTrue(text.contains(#"name="priority""#))
        XCTAssertTrue(text.contains(#"name="due_date""#))   // vacío = sin fecha
    }

    func testIssueDraftCreateFormReportsMissingRequired() {
        let draft = IssueDraft()   // todo vacío, x/y = "0"
        let problems = draft.creationProblems
        XCTAssertTrue(problems.contains { $0.contains("título") })
        XCTAssertTrue(problems.contains { $0.contains("categoría") })
        XCTAssertTrue(problems.contains { $0.contains("descripción") })
    }

    func testIssueDraftUpdateFormOnlySendsChanges() throws {
        let issue = try decoder.decode(Issue.self, from: Data("""
        {
          "id": 7, "title": "Banco roto", "category": "mobiliario",
          "description": "Madera astillada", "status": "open", "priority": "medium",
          "due_date": "2026-10-01", "map_id": 1, "assigned_to": null,
          "created_at": "2026-09-08T10:00:00.000Z"
        }
        """.utf8))

        // Sin cambios → formulario vacío.
        var unchanged = IssueDraft.forEditing(issue)
        XCTAssertTrue(unchanged.makeUpdateForm(original: issue).isEmpty)
        _ = unchanged.makeUpdateForm(original: issue)

        // Cambiar estado y prioridad → solo esos campos.
        var edited = IssueDraft.forEditing(issue)
        edited.status = .resolved
        edited.priority = .high
        var form = edited.makeUpdateForm(original: issue)
        XCTAssertFalse(form.isEmpty)
        let text = String(decoding: form.finalize().body, as: UTF8.self)
        XCTAssertTrue(text.contains(#"name="status""#))
        XCTAssertTrue(text.contains("resolved"))
        XCTAssertTrue(text.contains(#"name="priority""#))
        XCTAssertFalse(text.contains(#"name="category""#))
        XCTAssertFalse(text.contains(#"name="due_date""#))
    }

    // MARK: Hito 3 — PlanCoordinateSpace (paridad con Leaflet CRS.Simple de la web)

    func testPlanCoordinateSpaceNormalizesLongAxisTo1000() {
        let landscape = PlanCoordinateSpace(imageWidth: 2000, imageHeight: 1000)
        XCTAssertEqual(landscape.virtualWidth, 1000)
        XCTAssertEqual(landscape.virtualHeight, 500)

        let portrait = PlanCoordinateSpace(imageWidth: 500, imageHeight: 1000)
        XCTAssertEqual(portrait.virtualWidth, 500)
        XCTAssertEqual(portrait.virtualHeight, 1000)

        let degenerate = PlanCoordinateSpace(imageWidth: 0, imageHeight: 0)
        XCTAssertEqual(degenerate.virtualWidth, 1000)
        XCTAssertEqual(degenerate.virtualHeight, 1000)
    }

    func testPlanCoordinateSpaceFractionMatchesLeafletOrientation() {
        // lat crece hacia arriba (Leaflet); fy=0 en SwiftUI es "arriba" de la
        // imagen, así que lat máximo debe dar fy≈0, no fy≈1.
        let space = PlanCoordinateSpace(imageWidth: 1000, imageHeight: 500)

        let center = space.fraction(lat: 250, lng: 500)
        XCTAssertEqual(center.x, 0.5, accuracy: 0.0001)
        XCTAssertEqual(center.y, 0.5, accuracy: 0.0001)

        let topLeft = space.fraction(lat: 500, lng: 0)
        XCTAssertEqual(topLeft.x, 0, accuracy: 0.0001)
        XCTAssertEqual(topLeft.y, 0, accuracy: 0.0001)

        let bottomRight = space.fraction(lat: 0, lng: 1000)
        XCTAssertEqual(bottomRight.x, 1, accuracy: 0.0001)
        XCTAssertEqual(bottomRight.y, 1, accuracy: 0.0001)

        // Ida y vuelta.
        let roundTrip = space.coordinate(atFraction: center)
        XCTAssertEqual(roundTrip.lat, 250, accuracy: 0.0001)
        XCTAssertEqual(roundTrip.lng, 500, accuracy: 0.0001)
    }

    // MARK: Hito 3 — Plano con capas y zonas

    func testMapDetailDecodingWithLayers() throws {
        let json = Data("""
        {
          "id": 1, "name": "Plano Principal", "file_url": "/ui/plano.jpg",
          "thumb_url": null, "parent_id": null,
          "layers": [ { "id": 2, "name": "Electricidad", "file_url": "/uploads/map_2.jpg" } ]
        }
        """.utf8)
        let detail = try decoder.decode(MapDetail.self, from: json)
        XCTAssertEqual(detail.layers.count, 1)
        XCTAssertEqual(detail.layers[0].name, "Electricidad")

        let withoutLayers = try decoder.decode(MapDetail.self,
            from: Data(#"{"id":3,"name":"Nave 2","file_url":"/uploads/x.jpg","parent_id":null}"#.utf8))
        XCTAssertTrue(withoutLayers.layers.isEmpty)
    }

    func testMapZoneDecodingAndPolygonRings() throws {
        // Geojson real, verificado contra POST /v1/maps/:id/zones.
        let json = Data("""
        {
          "id": 1, "map_id": 3, "name": "Almacén", "type": "rectangle",
          "geojson": "{\\"type\\":\\"Feature\\",\\"properties\\":{},\\"geometry\\":{\\"type\\":\\"Polygon\\",\\"coordinates\\":[[[100,100],[400,100],[400,300],[100,300],[100,100]]]}}",
          "color": "#7c5cff", "created_by": 2, "created_at": "2026-09-11T08:38:50.967Z"
        }
        """.utf8)
        let zone = try decoder.decode(MapZone.self, from: json)
        XCTAssertEqual(zone.mapID, 3)

        let space = PlanCoordinateSpace(imageWidth: 1000, imageHeight: 1000)
        let rings = zone.polygonRings(in: space)
        XCTAssertEqual(rings.count, 1)
        XCTAssertEqual(rings[0].count, 5)
        XCTAssertEqual(rings[0][0].x, 0.1, accuracy: 0.0001)   // lng=100 → 100/1000
        XCTAssertEqual(rings[0][0].y, 0.9, accuracy: 0.0001)   // lat=100 → 1-100/1000
    }

    func testMapZoneIgnoresNonPolygonGeometry() throws {
        let zone = MapZone(id: 1, mapID: 1, name: "Punto", type: "marker",
                           geojson: #"{"type":"Feature","geometry":{"type":"Point","coordinates":[1,2]}}"#,
                           color: "#000000", createdBy: 1, createdAt: "")
        XCTAssertTrue(zone.polygonRings(in: PlanCoordinateSpace(imageWidth: 1000, imageHeight: 1000)).isEmpty)
    }

    // MARK: Hito 3 — deep link

    func testDeepLinkRouterParsesPathForm() {
        XCTAssertEqual(DeepLinkRouter.issueID(from: URL(string: "gestortareas://issue/42")!), 42)
    }

    func testDeepLinkRouterParsesQueryForm() {
        XCTAssertEqual(DeepLinkRouter.issueID(from: URL(string: "gestortareas://open?issue=7")!), 7)
    }

    func testDeepLinkRouterRejectsOtherSchemes() {
        XCTAssertNil(DeepLinkRouter.issueID(from: URL(string: "https://example.com/issue/42")!))
        XCTAssertNil(DeepLinkRouter.issueID(from: URL(string: "gestortareas://issue/")!))
        XCTAssertNil(DeepLinkRouter.issueID(from: URL(string: "gestortareas://issue/abc")!))
    }

    // MARK: Hito 3 — payloads de Socket.io (issue:created/updated/deleted)

    func testSocketClientDecodesIssuePayload() throws {
        let payload: [String: Any] = [
            "id": 3, "title": "Evento realtime", "category": "otros",
            "description": "Prueba socket", "status": "open", "created_at": "2026-09-11T08:00:00.000Z",
        ]
        let issue: Issue? = SocketClient.decode(payload)
        XCTAssertEqual(issue?.id, 3)
        XCTAssertEqual(issue?.title, "Evento realtime")
    }

    func testSocketClientDeletedIDAcceptsIntOrString() {
        XCTAssertEqual(SocketClient.deletedID(from: ["id": 3]), 3)
        XCTAssertEqual(SocketClient.deletedID(from: ["id": "3"]), 3)
        XCTAssertNil(SocketClient.deletedID(from: ["id": "not-a-number"]))
        XCTAssertNil(SocketClient.deletedID(from: NSNull()))
    }

    // MARK: Hito 4 — notificaciones

    func testNotificationListDecodesCommentReplyAndLogVariants() throws {
        // Forma real de src/routes/notifications.routes.js: comment/reply y log
        // mezclados, sin "id" propio.
        let json = Data("""
        {
          "items": [
            { "type": "comment", "issue_id": 7, "issue_title": "Farola rota",
              "commenter_username": "ana", "text_preview": "Ya lo he revisado",
              "created_at": "2026-09-11T10:00:00.000Z" },
            { "type": "reply", "issue_id": 7, "issue_title": "Farola rota",
              "commenter_username": "beto", "text_preview": "Gracias",
              "created_at": "2026-09-11T10:05:00.000Z" },
            { "type": "log", "action": "update_status", "old_value": "open",
              "new_value": "in_progress", "issue_id": 7, "issue_title": "Farola rota",
              "created_at": "2026-09-11T09:00:00.000Z" }
          ]
        }
        """.utf8)

        let list = try decoder.decode(NotificationList.self, from: json)
        XCTAssertEqual(list.items.count, 3)
        XCTAssertEqual(list.items[0].type, .comment)
        XCTAssertEqual(list.items[1].type, .reply)
        XCTAssertEqual(list.items[2].type, .log)
        XCTAssertEqual(list.items[2].actionLabel, "Cambio de estado")
        // ids sintéticos distintos entre sí (no colisionan aunque compartan issue_id).
        let ids = Set(list.items.map(\.id))
        XCTAssertEqual(ids.count, 3)
    }

    // MARK: Hito 4 — admin: usuarios

    func testAdminUserDecoding() throws {
        let json = Data("""
        [
          { "id": 1, "username": "admin", "email": "a@b.com", "role": "admin", "created_at": "2026-01-01T00:00:00.000Z" },
          { "id": 2, "username": "tecnico1", "email": null, "role": "user", "created_at": "2026-02-01T00:00:00.000Z" }
        ]
        """.utf8)
        let users = try decoder.decode([AdminUser].self, from: json)
        XCTAssertTrue(users[0].isAdmin)
        XCTAssertFalse(users[1].isAdmin)
        XCTAssertNil(users[1].email)
    }

    // MARK: Hito 4 — admin: settings en caliente

    func testAppRuntimeSettingsDecodingWithMixedTypesAndNulls() throws {
        // Igual que devuelve GET /v1/settings: booleanos, números y cadenas ya
        // tipados por config.service.js::parseValue, o null si no hay valor.
        let json = Data("""
        {
          "MAX_UPLOAD_BYTES": 8388608, "RATE_LIMIT_ENABLED": true,
          "RATE_LIMIT_WINDOW_MS": 60000, "RATE_LIMIT_MAX": 100,
          "ADMIN_EMAIL": "admin@example.com", "PUBLIC_URL": null, "MAILPIT_URL": null
        }
        """.utf8)
        let settings = try decoder.decode(AppRuntimeSettings.self, from: json)
        XCTAssertEqual(settings.maxUploadBytes, 8_388_608)
        XCTAssertEqual(settings.rateLimitEnabled, true)
        XCTAssertEqual(settings.adminEmail, "admin@example.com")
        XCTAssertNil(settings.publicURL)
        XCTAssertNil(settings.mailpitURL)
    }

    func testSettingsPatchOnlyEncodesChangedKeys() throws {
        var patch = SettingsPatch()
        patch.rateLimitEnabled = false
        patch.adminEmail = "new@example.com"

        let data = try JSONEncoder().encode(patch)
        let obj = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(obj.count, 2)
        XCTAssertEqual(obj["ADMIN_EMAIL"] as? String, "new@example.com")
        XCTAssertEqual(obj["RATE_LIMIT_ENABLED"] as? Bool, false)
        XCTAssertNil(obj["MAX_UPLOAD_BYTES"])
    }

    // MARK: Hito 4 — recuperación de contraseña

    func testResetTokenParsingExtractsFromEmailedLink() {
        // Enlace real de notifyPasswordReset: "<PUBLIC_URL>/#reset-password?token=<hex>".
        let link = "https://example.com/#reset-password?token=abc123def456&other=1"
        XCTAssertEqual(ResetTokenParsing.token(from: link), "abc123def456")
    }

    func testResetTokenParsingAcceptsBareHexToken() {
        let hex = String(repeating: "a1", count: 32)   // 64 hex, como crypto.randomBytes(32)
        XCTAssertEqual(ResetTokenParsing.token(from: "  \(hex)  "), hex)
    }

    func testResetTokenParsingRejectsGarbage() {
        XCTAssertNil(ResetTokenParsing.token(from: ""))
        XCTAssertNil(ResetTokenParsing.token(from: "no es un token"))
    }
}
