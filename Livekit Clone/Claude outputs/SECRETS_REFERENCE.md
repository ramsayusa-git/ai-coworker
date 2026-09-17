# Secrets Management — Quick Reference

## 1. Development Setup

```bash
cp .env.example .env
# Edit .env with your values
```

**Default .env for dev:**
```env
DATABASE_URL=sqlite:///lattice.db
SECRET_KEY=dev-secret-key-change-in-production
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
DEBUG=True
```

## 2. Production SECRET_KEY

```bash
# Generate new random key (run once per production environment)
python3 -c "import secrets; print(secrets.token_urlsafe(32))"

# Output: (copy this value)
# wR5sT7uV9xY1zM2aB3cD4eF5gH6jK8lN0oP2qR4sT6u
```

Add to `.env.production`:
```env
SECRET_KEY=wR5sT7uV9xY1zM2aB3cD4eF5gH6jK8lN0oP2qR4sT6u
```

## 3. Verify Configuration

```bash
# Test that settings load from .env
python3 -c "from app.config import settings; print(f'DB: {settings.database_url}'); print(f'CORS: {settings.cors_origins}')"
```

## 4. CORS Whitelist Examples

**Development:**
```env
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

**Staging:**
```env
CORS_ORIGINS=https://staging-dashboard.aetos-lattice.com,https://staging-api.aetos-lattice.com
```

**Production:**
```env
CORS_ORIGINS=https://dashboard.aetos-lattice.com,https://api.aetos-lattice.com,https://console.aetos-lattice.com
```

## 5. Environment Variable Reference

| Variable | Required | Example | Notes |
|----------|----------|---------|-------|
| `DATABASE_URL` | Yes | `postgresql://user:pwd@host/lattice` | Use PostgreSQL for production |
| `SECRET_KEY` | Yes | `<generated>` | Never use dev key in production |
| `CORS_ORIGINS` | Yes | `https://domain.com` | Comma-separated, whitelist only |
| `DEBUG` | No | `False` | Must be `False` in production |
| `ALGORITHM` | No | `HS256` | Don't change without reason |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | `60` | JWT access token TTL |
| `REFRESH_TOKEN_EXPIRE_DAYS` | No | `7` | JWT refresh token TTL |

## 6. Never Commit

These files must NEVER be in git:
- `.env` (development)
- `.env.production` (production)
- `.env.*.local` (local overrides)
- `*.pem`, `*.key` (certificates)

Check `.gitignore` includes:
```
.env
.env.production
.env.*.local
*.pem
*.key
```

## 7. Rotating Secrets

When rotating SECRET_KEY (should happen every 6 months minimum):

1. Generate new key: `python3 -c "import secrets; print(secrets.token_urlsafe(32))"`
2. Update production `.env` with new key
3. Restart backend service
4. All existing JWT tokens become invalid (users re-login)

---

**⚠️ CRITICAL:**
- Never share `.env` files
- Never commit secrets to git
- Always use environment variables in production
- Always generate unique keys per environment
- Rotate keys regularly
