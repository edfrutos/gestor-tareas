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
}
