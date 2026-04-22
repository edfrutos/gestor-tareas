# GitHub Secrets Configuration for Docker Hub

## ✅ Status

GitHub Actions workflow is configured and ready at `.github/workflows/docker-build-push.yml`

**All you need to do:** Add Docker Hub credentials to GitHub Secrets.

---

## 📋 Setup Steps

### 1. Get Docker Hub PAT

Visit: https://hub.docker.com/settings/security

- Click **"New Access Token"**
- Description: `github-actions`
- Permissions: `Read, Write, Delete`
- Click **"Generate"**
- **Copy the token** (displays only once)

### 2. Add GitHub Secrets

Go to: https://github.com/edfrutos/gestor-tareas/settings/secrets/actions

Create two secrets:

| Name | Value |
|------|-------|
| `DOCKERHUB_USERNAME` | `edfrutos` |
| `DOCKERHUB_TOKEN` | `dckr_pat_XXXXX...` (from step 1) |

### 3. Trigger the Workflow

Push any change to `main`:
```bash
git push origin main
```

Or create a release tag:
```bash
git tag v1.0.0
git push origin v1.0.0
```

---

## 🚀 What Happens Next

The GitHub Actions workflow will:

1. ✅ Build Docker image (multi-platform: amd64, arm64)
2. ✅ Run tests (npm test)
3. ✅ Scan vulnerabilities (Docker Scout)
4. ✅ Push to Docker Hub: `edfrutos/gestor-tareas:latest`

Images available at: https://hub.docker.com/r/edfrutos/gestor-tareas

---

## 📊 Monitor Builds

View workflow runs: https://github.com/edfrutos/gestor-tareas/actions
