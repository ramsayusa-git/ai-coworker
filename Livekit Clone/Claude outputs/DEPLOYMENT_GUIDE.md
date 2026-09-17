# Aetos Lattice — Production Deployment Guide

**Date:** September 17, 2026  
**Status:** Pre-Production  
**Target:** Q4 2026 Release

---

## 1. Secrets Management

### 1.1 Environment Variables Setup

All sensitive configuration is managed via environment variables, NOT hardcoded in code.

#### Development Environment

Create `.env` file (never commit):

```bash
cp .env.example .env
# Edit .env with your dev credentials
```

Content:
```env
DATABASE_URL=sqlite:///lattice.db
SECRET_KEY=dev-secret-key-change-in-production
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
DEBUG=True
```

#### Production Environment

Use one of these approaches:

**Option A: AWS Secrets Manager (Recommended)**
```bash
# Create secret
aws secretsmanager create-secret \
  --name aetos-lattice/production \
  --secret-string '{"database_url":"postgresql://...","secret_key":"<generated>","cors_origins":"https://dashboard.aetos-lattice.com"}'

# In deployment script, fetch secret:
# aws secretsmanager get-secret-value --secret-id aetos-lattice/production | jq -r '.SecretString'
```

**Option B: Environment Variables (Server/Container)**
```bash
# In production server/container environment:
export DATABASE_URL="postgresql://user:pass@db.prod:5432/lattice"
export SECRET_KEY="<generated-key>"
export CORS_ORIGINS="https://dashboard.aetos-lattice.com,https://api.aetos-lattice.com"
export DEBUG=False
```

**Option C: .env File (Less Secure)**
```bash
# Deploy .env file via secure channels only (not git, use secrets tool)
# Restrict file permissions: chmod 600 .env
```

### 1.2 Generate Production SECRET_KEY

```bash
# Generate cryptographically secure random key
python3 -c "import secrets; print(secrets.token_urlsafe(32))"

# Output example:
# xE-N8qB2xL_9zK3pQ_wR5sT7uV9xY1zM2aB3cD4eF5gH6

# Copy this value to production SECRET_KEY
```

**Never reuse development SECRET_KEY in production.**

### 1.3 Verify Secrets Loaded

```bash
# Test that configuration loads correctly
python3 -c "from app.config import settings; print(f'DB: {settings.database_url[:20]}... SECRET: {settings.secret_key[:10]}...')"
```

---

## 2. CORS Configuration

### 2.1 Development (Default)

```env
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

Allows:
- Frontend dev server: `http://localhost:5173`
- Backend swagger: `http://localhost:3000`

### 2.2 Production (Whitelist Specific Origins)

```env
CORS_ORIGINS=https://dashboard.aetos-lattice.com,https://api.aetos-lattice.com,https://console.aetos-lattice.com
```

**DO NOT use wildcard `*` in production.**

### 2.3 Testing CORS

```bash
# Test preflight request
curl -i -X OPTIONS https://api.aetos-lattice.com/api/v1/rooms \
  -H "Origin: https://dashboard.aetos-lattice.com" \
  -H "Access-Control-Request-Method: GET"

# Should return 200 with:
# Access-Control-Allow-Origin: https://dashboard.aetos-lattice.com
# Access-Control-Allow-Methods: GET, POST, PATCH, DELETE
```

---

## 3. Database Migration (SQLite → PostgreSQL)

### 3.1 Install PostgreSQL Driver

```bash
pip install psycopg2-binary
# or: pip install psycopg[binary]
```

### 3.2 Create PostgreSQL Database

```sql
-- On PostgreSQL server
CREATE DATABASE lattice_db;
CREATE USER lattice_user WITH PASSWORD 'secure_password_here';
GRANT ALL PRIVILEGES ON DATABASE lattice_db TO lattice_user;
```

### 3.3 Update DATABASE_URL

```env
# Before:
DATABASE_URL=sqlite:///lattice.db

# After:
DATABASE_URL=postgresql://lattice_user:secure_password_here@db.prod.example.com:5432/lattice_db
```

### 3.4 Initialize Schema

```bash
# FastAPI will auto-create tables on startup via Base.metadata.create_all()
# For initial data seeding:
python3 seed_data.py
```

### 3.5 Verify Connection

```bash
# Test connection
python3 -c "from app.database import engine; print(engine.execute('SELECT 1'))"
```

---

## 4. Security Headers

### 4.1 HSTS (HTTP Strict-Transport-Security)

Automatically added by `SecurityHeadersMiddleware`:
```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

- Forces HTTPS for 1 year (31536000 seconds)
- Applies to all subdomains
- Requires HTTPS certificate (self-signed OK for dev, CA-signed required for production)

### 4.2 Other Security Headers

Also automatically added:
- `X-Content-Type-Options: nosniff` — Prevent MIME sniffing
- `X-Frame-Options: DENY` — Prevent clickjacking
- `X-XSS-Protection: 1; mode=block` — Enable browser XSS filter
- `Referrer-Policy: strict-origin-when-cross-origin` — Referrer policy
- `Content-Security-Policy` — Prevent injection attacks

---

## 5. HTTPS/TLS Setup

### 5.1 Development (Self-Signed)

```bash
# Generate self-signed cert (already done)
openssl req -x509 -newkey rsa:4096 -nodes \
  -out cert.pem -keyout key.pem -days 365 \
  -subj "/CN=localhost"

# Start HTTPS server:
python3 run_https.py
# Listens on https://0.0.0.0:8443

# Test (ignore cert warning):
curl -k https://localhost:8443/health
```

### 5.2 Production (CA-Signed Certificate)

Use one of:

**Option A: Let's Encrypt (Free, Automatic)**
```bash
# Install certbot
sudo apt-get install certbot python3-certbot-nginx

# Get certificate
sudo certbot certonly --standalone -d api.aetos-lattice.com -d dashboard.aetos-lattice.com

# Certs stored in: /etc/letsencrypt/live/api.aetos-lattice.com/
# fullchain.pem (cert + CA chain)
# privkey.pem (private key)
```

**Option B: AWS Certificate Manager**
```bash
# Create certificate in ACM, attach to ALB/CloudFront
# AWS handles auto-renewal
```

**Option C: Commercial CA**
```bash
# Purchase certificate, follow provider's installation steps
```

### 5.3 Configure Production Reverse Proxy

Use Nginx (recommended) instead of exposing Uvicorn directly:

```nginx
# /etc/nginx/sites-enabled/lattice-api

upstream lattice_backend {
    server 127.0.0.1:8000;
    server 127.0.0.1:8001;
    server 127.0.0.1:8002;
    server 127.0.0.1:8003;
}

server {
    listen 443 ssl http2;
    server_name api.aetos-lattice.com;

    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/api.aetos-lattice.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.aetos-lattice.com/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # HSTS (already handled by middleware, but good for defense-in-depth)
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Gzip compression
    gzip on;
    gzip_types application/json text/plain application/javascript;

    # Proxy settings
    location / {
        proxy_pass http://lattice_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }

    # WebSocket support
    location /ws/ {
        proxy_pass http://lattice_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name api.aetos-lattice.com;
    return 301 https://$server_name$request_uri;
}
```

---

## 6. Running Production Backend

### 6.1 Using Gunicorn + Uvicorn Workers

```bash
# Install gunicorn
pip install gunicorn

# Start with 4 workers (adjust based on CPU cores)
gunicorn -w 4 \
  -k uvicorn.workers.UvicornWorker \
  --bind 127.0.0.1:8000 \
  --access-logfile - \
  --error-logfile - \
  --log-level info \
  app.main:app
```

### 6.2 Using Systemd Service

Create `/etc/systemd/system/lattice-backend.service`:

```ini
[Unit]
Description=Aetos Lattice Backend
After=network.target postgresql.service

[Service]
Type=notify
User=lattice
WorkingDirectory=/opt/lattice-backend
EnvironmentFile=/opt/lattice-backend/.env.production
ExecStart=/opt/lattice-backend/venv/bin/gunicorn -w 4 \
  -k uvicorn.workers.UvicornWorker \
  --bind 127.0.0.1:8000 \
  app.main:app
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable lattice-backend
sudo systemctl start lattice-backend
sudo systemctl status lattice-backend
```

---

## 7. Monitoring & Logging

### 7.1 Application Logging

Logs go to stdout/stderr (captured by systemd journal or Docker):

```bash
# View logs
sudo journalctl -u lattice-backend -f

# Or with persistent file:
# Add to .env: LOG_FILE=/var/log/lattice/app.log
```

### 7.2 Monitoring Health

```bash
# Health check endpoint (no auth required)
curl https://api.aetos-lattice.com/health

# Response:
# {"status": "healthy", "version": "1.0.0"}
```

### 7.3 Error Tracking (Optional)

Integrate Sentry for production error tracking:

```bash
pip install sentry-sdk

# In app/main.py:
import sentry_sdk
sentry_sdk.init(
    dsn="https://<key>@sentry.io/<project>",
    environment="production",
    traces_sample_rate=0.1
)
```

---

## 8. Pre-Deployment Checklist

- [ ] `DATABASE_URL` points to PostgreSQL (not SQLite)
- [ ] `SECRET_KEY` is production random string (not dev placeholder)
- [ ] `CORS_ORIGINS` is whitelist (not wildcard `*`)
- [ ] `DEBUG=False`
- [ ] SSL certificates installed (Let's Encrypt or CA)
- [ ] Nginx reverse proxy configured
- [ ] Gunicorn + uvicorn running with 4+ workers
- [ ] Database migrations applied (`alembic upgrade head`)
- [ ] Systemd service enabled
- [ ] `.env` file not in git (check `.gitignore`)
- [ ] Health check responds: `curl https://api.aetos-lattice.com/health`
- [ ] Rate limiting working: `curl https://api.aetos-lattice.com/api/v1/rooms?tenant_id=...` (should 429 after 100 requests/min)
- [ ] HSTS header present: `curl -I https://api.aetos-lattice.com/health | grep Strict-Transport-Security`

---

## 9. Troubleshooting

### Issue: "SECRET_KEY is dev placeholder"

```bash
# Generate new key
python3 -c "import secrets; print(secrets.token_urlsafe(32))"

# Update .env
echo "SECRET_KEY=<new-key>" >> .env.production
```

### Issue: "CORS error in browser"

```bash
# Check current CORS_ORIGINS
grep CORS_ORIGINS .env

# Test preflight
curl -i -X OPTIONS https://api.aetos-lattice.com/api/v1/rooms \
  -H "Origin: https://your-domain.com"

# If missing, update .env:
echo "CORS_ORIGINS=https://your-domain.com" >> .env.production
```

### Issue: "PostgreSQL connection refused"

```bash
# Check connection string
psql "postgresql://lattice_user:pwd@host:5432/lattice_db"

# Verify host/port/credentials in DATABASE_URL
grep DATABASE_URL .env.production
```

---

## 10. Rollback Procedure

If production deployment fails:

```bash
# 1. Stop current service
sudo systemctl stop lattice-backend

# 2. Restore previous database backup
pg_restore -d lattice_db lattice_db_backup_20260917.sql

# 3. Revert code to previous version (git)
git checkout v1.0.0

# 4. Restart with previous version
sudo systemctl start lattice-backend

# 5. Verify health
curl https://api.aetos-lattice.com/health
```

---

**Next Step:** Proceed to Alembic database migrations setup (Cycle 5).
