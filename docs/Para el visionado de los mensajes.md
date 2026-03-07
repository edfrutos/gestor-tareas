# Para el visionado de los mensajes (correos de recuperación de contraseña y avisos de tareas) en el entorno de desarrollo actual, utilizamos Mailpit

## Mailpit captura todos los correos salientes de la aplicación para que puedas previsualizarlos de forma segura sin que salgan a internet. Los datos de acceso son

* URL de previsualización: <http://localhost:8825> (<http://localhost:8825>)
* Servicio: Mailpit (sustituto moderno de Mailhog).
* Puerto interno (SMTP): 1025 (configurado automáticamente en el .env para la app).
* Puerto externo (Web UI): 8825 (el que debes abrir en tu navegador).

  Cómo funciona el flujo de recuperación:

   1. Solicitas la recuperación desde el login de la aplicación (<https://localhost:8443>).
   2. La aplicación genera un token y envía un email a través del puerto 1025.
   3. Abres <http://localhost:8825> (<http://localhost:8825>) en tu navegador.
   4. Verás el correo con un botón/enlace que apunta a <https://localhost:8443/#reset-password?token=>....
   5. Al hacer clic, el enlace te llevará de vuelta a la aplicación para establecer la nueva contraseña.

  Nota técnica: Si el enlace dentro del correo no funciona o apunta a una dirección incorrecta, asegúrate de que la variable PUBLIC_URL en tu archivo .env sea exactamente
  <https://localhost:8443>, ya que el sistema la utiliza para construir los enlaces dinámicamente.
