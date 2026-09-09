import SwiftUI

struct IssueRowView: View {
    let issue: Issue

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                Text(issue.title)
                    .font(.headline)
                    .lineLimit(1)
                Spacer(minLength: 8)
                TagPill(text: issue.status.label, color: issue.status.color)
                TagPill(text: issue.priority.label, color: issue.priority.color)
            }

            HStack(spacing: 12) {
                Label(issue.category, systemImage: "folder")
                if let due = issue.dueDate, !due.isEmpty {
                    Label(due, systemImage: "calendar")
                }
                if let assignee = issue.assignedToUsername {
                    Label(assignee, systemImage: "person")
                }
                if issue.photoURL != nil {
                    Image(systemName: "photo")
                }
                if issue.textURL != nil {
                    Image(systemName: "doc")
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
    }
}
