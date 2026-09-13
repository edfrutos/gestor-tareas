import SwiftUI

/// Campo de contraseña con botón de "ojo" para mostrar/ocultar el texto en
/// claro — igual que el 👁️ de la web (`toggle-pass-btn` en
/// `src/public/index.html`). Alterna internamente entre `SecureField` y
/// `TextField` (SwiftUI no deja "revelar" un `SecureField` de otra forma).
///
/// Acepta `.textFieldStyle(...)` / `.onSubmit(...)` aplicados desde fuera con
/// normalidad: ambos se propagan por entorno a los campos internos.
struct PasswordField: View {
    let title: String
    @Binding var text: String
    var textContentType: NSTextContentType?

    @State private var isRevealed = false
    @FocusState private var isFocused: Bool

    var body: some View {
        HStack(spacing: 4) {
            Group {
                if isRevealed {
                    TextField(title, text: $text)
                } else {
                    SecureField(title, text: $text)
                }
            }
            .textContentType(textContentType)
            .focused($isFocused)

            Button {
                isFocused = true
                isRevealed.toggle()
            } label: {
                Image(systemName: isRevealed ? "eye.slash" : "eye")
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
            .help(isRevealed ? "Ocultar contraseña" : "Mostrar contraseña")
        }
    }
}
