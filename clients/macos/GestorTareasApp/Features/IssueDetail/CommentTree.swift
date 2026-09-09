import SwiftUI

/// Render recursivo del árbol de comentarios (solo lectura en el Hito 1).
struct CommentTree: View {
    let comments: [Comment]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(comments) { comment in
                CommentNode(comment: comment)
            }
        }
    }
}

private struct CommentNode: View {
    let comment: Comment

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Text(comment.displayName)
                    .font(.subheadline.weight(.semibold))
                Text(AppDate.mediumDateTime(comment.createdAt))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Text(comment.text)
                .font(.body)
                .textSelection(.enabled)

            if !comment.replies.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(comment.replies) { reply in
                        CommentNode(comment: reply)
                    }
                }
                .padding(.leading, 14)
                .overlay(alignment: .leading) {
                    Rectangle()
                        .fill(.quaternary)
                        .frame(width: 2)
                }
            }
        }
    }
}
