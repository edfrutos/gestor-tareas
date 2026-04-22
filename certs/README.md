# SSL/TLS Certificates

## Nota Importante

Los certificados SSL/TLS se generan **localmente** con `mkcert` y **NO se versionan en Git**.

## Regenerar Certificados

Si necesitas regenerar los certificados (ej. si expiran o se pierden):

```bash
# Requiere mkcert instalado
# macOS: brew install mkcert
# Linux: sudo apt install mkcert (u otro package manager)
# Windows: choco install mkcert

cd certs/
mkcert -key-file key.pem -cert-file cert.pem localhost 127.0.0.1
```

## Ubicación de Backup

Los certificados se guardan también en:
```
/Volumes/ESSAGER/__01.-Proyectos/backups/001.-gestor-tareas-archivos\ sensibles/certs/
```

## Validez

Certificados generados con mkcert son:
- ✅ Válidos para **localhost** y **127.0.0.1**
- ✅ Confiados por navegadores (CA local instalada)
- ✅ Válidos por **3+ años**
- ✅ Auto-renovables

## En Producción

Para producción, usar certificados de una **CA pública** (Let's Encrypt, etc.):

```bash
# Let's Encrypt con certbot
certbot certonly --standalone -d tu-dominio.com
# Copiar cert a: /app/certs/cert.pem
# Copiar key a: /app/certs/key.pem
```
