import SwiftUI

/// Render recursivo del árbol de comentarios con opción de responder (Hito 2).
struct CommentTree: View {
    let comments: [Comment]
    /// `id` del comentario al que se está respondiendo, o `nil`.
    let replyingTo: Int?
    let isPosting: Bool
    var onStartReply: (Comment) -> Void
    var onCancelReply: () -> Void
    var onSubmitReply: (_ parentID: Int, _ text: String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(comments) { comment in
                CommentNode(comment: comment,
                            replyingTo: replyingTo,
                            isPosting: isPosting,
                            onStartReply: onStartReply,
                            onCancelReply: onCancelReply,
                            onSubmitReply: onSubmitReply)
            }
        }
    }
}

private struct CommentNode: View {
    let comment: Comment
    let replyingTo: Int?
    let isPosting: Bool
    var onStartReply: (Comment) -> Void
    var onCancelReply: () -> Void
    var onSubmitReply: (_ parentID: Int, _ text: String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Text(comment.displayName)
                    .font(.subheadline.weight(.semibold))
                Text(AppDate.mediumDateTime(comment.createdAt))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Button("Responder") { onStartReply(comment) }
                    .buttonStyle(.borderless)
                    .font(.caption)
            }
            Text(comment.text)
                .font(.body)
                .textSelection(.enabled)

            if replyingTo == comment.id {
                CommentComposer(placeholder: "Responder a \(comment.displayName)…",
                                submitLabel: "Enviar respuesta",
                                isBusy: isPosting,
                                showsCancel: true,
                                onCancel: onCancelReply) { text in
                    onSubmitReply(comment.id, text)
                }
                .padding(.top, 4)
            }

            if !comment.replies.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(comment.replies) { reply in
                        CommentNode(comment: reply,
                                    replyingTo: replyingTo,
                                    isPosting: isPosting,
                                    onStartReply: onStartReply,
                                    onCancelReply: onCancelReply,
                                    onSubmitReply: onSubmitReply)
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

/// Campo de redacción de comentario / respuesta.
struct CommentComposer: View {
    let placeholder: String
    let submitLabel: String
    let isBusy: Bool
    var showsCancel: Bool = false
    var onCancel: () -> Void = {}
    var onSubmit: (String) -> Void

    @State private var text = ""

    private var trimmed: String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            TextField(placeholder, text: $text, axis: .vertical)
                .textFieldStyle(.roundedBorder)
                .lineLimit(1...5)

            HStack {
                if showsCancel {
                    Button("Cancelar", role: .cancel) {
                        text = ""
                        onCancel()
                    }
                    .buttonStyle(.borderless)
                }
                Spacer()
                Button {
                    onSubmit(trimmed)
                    text = ""
                } label: {
                    if isBusy {
                        ProgressView().controlSize(.small)
                    } else {
                        Text(submitLabel)
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(trimmed.isEmpty || isBusy)
            }
        }
    }
}
