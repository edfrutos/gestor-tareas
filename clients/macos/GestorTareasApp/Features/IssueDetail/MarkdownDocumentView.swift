import SwiftUI

/// Vista de solo lectura para adjuntos `.md`/`.markdown`.
///
/// Quick Look (usado para el resto de adjuntos, ver `IssueDetailView`) no
/// interpreta Markdown en macOS por defecto — muestra el texto crudo con los
/// símbolos `#`/`**`/etc. literales, igual que un `.txt`. Esta vista hace un
/// parseo de bloques propio (encabezados, listas, bloques de código,
/// párrafos) y usa `AttributedString(markdown:)` de Foundation solo para el
/// formato en línea (negrita/cursiva/enlaces/código) dentro de cada bloque —
/// evita depender de `PresentationIntent` (más frágil de acertar sin poder
/// compilar) y de un `WKWebView` (desaconsejado para la revisión 4.2 de MAS,
/// ver `docs/PLAN_APP_MACOS.md §5`).
struct MarkdownDocumentView: View {
    let title: String
    let rawText: String

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                        blockView(block)
                    }
                }
                .padding(20)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .frame(minWidth: 480, idealWidth: 620, minHeight: 400, idealHeight: 560)
    }

    private var header: some View {
        HStack {
            Text(title).font(.headline).lineLimit(1)
            Spacer()
            Button("Cerrar") { dismiss() }
                .keyboardShortcut(.cancelAction)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: Parseo por bloques

    private enum Block {
        case heading(level: Int, text: AttributedString)
        case listItem(text: AttributedString)
        case codeBlock(String)
        case paragraph(AttributedString)
    }

    private var blocks: [Block] {
        var result: [Block] = []
        var paragraphLines: [String] = []
        var codeLines: [String]?

        func inline(_ text: String) -> AttributedString {
            (try? AttributedString(markdown: text)) ?? AttributedString(text)
        }
        func flushParagraph() {
            guard !paragraphLines.isEmpty else { return }
            result.append(.paragraph(inline(paragraphLines.joined(separator: " "))))
            paragraphLines = []
        }

        for line in rawText.components(separatedBy: "\n") {
            if line.hasPrefix("```") {
                if let code = codeLines {
                    result.append(.codeBlock(code.joined(separator: "\n")))
                    codeLines = nil
                } else {
                    flushParagraph()
                    codeLines = []
                }
                continue
            }
            if codeLines != nil {
                codeLines?.append(line)
                continue
            }

            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.isEmpty {
                flushParagraph()
                continue
            }
            if let (level, text) = headingLevel(trimmed) {
                flushParagraph()
                result.append(.heading(level: level, text: inline(text)))
                continue
            }
            if trimmed.hasPrefix("- ") || trimmed.hasPrefix("* ") {
                flushParagraph()
                result.append(.listItem(text: inline(String(trimmed.dropFirst(2)))))
                continue
            }
            paragraphLines.append(line)
        }
        flushParagraph()
        if let code = codeLines, !code.isEmpty {
            result.append(.codeBlock(code.joined(separator: "\n")))
        }
        return result.isEmpty ? [.paragraph(inline(rawText))] : result
    }

    /// `"## Título"` → `(2, "Título")`. `nil` si no es un encabezado válido
    /// (1-6 `#` seguidos de un espacio).
    private func headingLevel(_ trimmed: String) -> (Int, String)? {
        guard trimmed.hasPrefix("#") else { return nil }
        var level = 0
        var rest = Substring(trimmed)
        while rest.hasPrefix("#") {
            level += 1
            rest = rest.dropFirst()
        }
        guard (1...6).contains(level), rest.hasPrefix(" ") else { return nil }
        return (level, String(rest.dropFirst()).trimmingCharacters(in: .whitespaces))
    }

    @ViewBuilder
    private func blockView(_ block: Block) -> some View {
        switch block {
        case let .heading(level, text):
            Text(text)
                .font(headingFont(level))
                .fontWeight(.bold)
                .padding(.top, level <= 2 ? 8 : 4)
        case let .listItem(text):
            HStack(alignment: .top, spacing: 6) {
                Text("•")
                Text(text)
            }
        case let .codeBlock(code):
            Text(code)
                .font(.system(.body, design: .monospaced))
                .textSelection(.enabled)
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.chip, in: RoundedRectangle(cornerRadius: 6))
        case let .paragraph(text):
            Text(text).textSelection(.enabled)
        }
    }

    private func headingFont(_ level: Int) -> Font {
        switch level {
        case 1: return .title
        case 2: return .title2
        case 3: return .title3
        default: return .headline
        }
    }
}
