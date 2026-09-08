import XCTest
@testable import GestorTareas

final class DecodingTests: XCTestCase {

    private let decoder = JSONDecoder()

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
}
