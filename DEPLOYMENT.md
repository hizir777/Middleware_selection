# 🚀 Deployment Rehberi — Middleware Selection

> **Bu belge:** Uygulamayı geliştirme, staging ve production ortamında dağıtmayı açıklar.

---

## 📋 Ön Gereksinimler

- Docker & Docker Compose (v20.10+)
- Redis (v7.0+)
- Node.js (v18+) — Manual kurulum için
- Git
- Minimum 2GB RAM, 1 vCPU

---

## 🏗️ Ortam Konfigürasyonu

### 1. Development (Geliştirme)

```bash
# Repoyu klonla
git clone https://github.com/hizir777/Middleware_selection.git
cd Middleware_selection

# Bağımlılıkları yükle
npm install

# .env dosyasını oluştur
cp .env.example .env
```

#### .env.example (Development)
```ini
NODE_ENV=development
PORT=3000

# JWT
JWT_SECRET=dev-secret-key-change-in-production
JWT_EXPIRE=1h

# Redis
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=

# Database
DB_PATH=./middleware.db

# Telegram (opsiyonel)
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# Logging
LOG_LEVEL=debug
LOG_TO_FILE=false
```

#### Çalıştır
```bash
# Watch mode (auto-reload)
npm run dev

# Veya normal start
npm start
```

**Kontrol:**
```bash
curl http://localhost:3000/api/health
# Beklenen: {"success":true,"data":{"app":"ok","redis":"ok"}}
```

---

### 2. Staging (Test Ortamı)

```bash
# CloudFlare, Render, Railway veya Heroku kullan

# Node.js runtime:
BUILDPACK: heroku/nodejs

# Environment variables set et:
NODE_ENV=staging
JWT_SECRET=$(openssl rand -base64 32)
```

#### docker-compose-staging.yml
```yaml
version: "3.9"

services:
  redis:
    image: redis:7-alpine
    container_name: mw_redis_staging
    ports:
      - "6379:6379"
    volumes:
      - redis_data_staging:/data
    environment:
      - REQUIREPASS=staging-redis-password
    restart: unless-stopped

  app:
    build: .
    container_name: mw_app_staging
    ports:
      - "3001:3000"
    env_file:
      - .env.staging
    environment:
      - REDIS_URL=redis://:staging-redis-password@redis:6379
    depends_on:
      - redis
    restart: unless-stopped

volumes:
  redis_data_staging:
```

**Çalıştır:**
```bash
docker-compose -f docker-compose-staging.yml up --build
```

---

### 3. Production (Üretim)

#### 💡 Seçenek A: Docker (Önerilen)

##### docker-compose-production.yml
```yaml
version: "3.9"

services:
  redis:
    image: redis:7-alpine
    container_name: mw_redis_prod
    ports:
      - "127.0.0.1:6379:6379"  # Sadece localhost'tan erişim
    volumes:
      - redis_data_prod:/data
    environment:
      - REQUIREPASS=${REDIS_PASSWORD}  # Strong password!
    restart: always
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  app:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        NODE_ENV: production
    container_name: mw_app_prod
    ports:
      - "127.0.0.1:3000:3000"  # Behind reverse proxy
    env_file:
      - .env.production
    environment:
      - REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379
      - NODE_ENV=production
    depends_on:
      redis:
        condition: service_healthy
    restart: always
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "10"
    # Resource limits
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M

volumes:
  redis_data_prod:
    driver: local
```

##### .env.production (Örnek)
```ini
NODE_ENV=production
PORT=3000

# Strong random secret (32+ karakter)
JWT_SECRET=<very-long-random-secret-from-vault>
JWT_EXPIRE=1h

REDIS_PASSWORD=<strong-redis-password>
REDIS_URL=redis://:password@redis:6379

# Database
DB_PATH=/app/data/middleware.db

# Telegram alerts
TELEGRAM_BOT_TOKEN=<your-bot-token>
TELEGRAM_CHAT_ID=<admin-chat-id>

# Logging
LOG_LEVEL=info
LOG_TO_FILE=true
LOG_DIR=/app/logs

# Rate limiting (production)
RATE_LIMIT_CRITICAL=5/1m
RATE_LIMIT_GENERAL=1000/1m

# Security
HTTPS_ONLY=true
CORS_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
```

**Çalıştır:**
```bash
docker-compose -f docker-compose-production.yml up -d
docker-compose -f docker-compose-production.yml logs -f app
```

---

#### 💡 Seçenek B: Kubernetes (HELM)

##### helm/values.yaml
```yaml
replicaCount: 3

image:
  repository: your-registry/middleware-selection
  tag: "1.0.0"
  pullPolicy: IfNotPresent

service:
  type: LoadBalancer
  port: 3000

resources:
  limits:
    cpu: 1000m
    memory: 512Mi
  requests:
    cpu: 500m
    memory: 256Mi

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 10
  targetCPUUtilizationPercentage: 80

redis:
  enabled: true
  auth:
    enabled: true
    password: "{{ .Values.redisPassword }}"
```

**Dağıt:**
```bash
helm install middleware-selection ./helm \
  --set redisPassword="strong-random-password" \
  --namespace production
```

---

#### 💡 Seçenek C: Cloud Providers

##### AWS ECS
```bash
# ECR'ye push et
aws ecr get-login-password | docker login --username AWS --password-stdin <account>.dkr.ecr.region.amazonaws.com

docker tag middleware-selection:latest <account>.dkr.ecr.region.amazonaws.com/middleware-selection:latest
docker push <account>.dkr.ecr.region.amazonaws.com/middleware-selection:latest

# CloudFormation / Terraform ile deploy et
terraform apply -f aws/main.tf
```

##### Heroku
```bash
# Login et
heroku login

# Remote ekle
heroku git:remote -a middleware-selection

# Deploy et
git push heroku main

# Logs kontrol et
heroku logs --tail
```

##### Railway / Render
**UI üzerinden:** Git repo bağla → Otomatik deploy

---

## 🔒 TLS/SSL Sertifikası

### Let's Encrypt ile (Ücretsiz)

```bash
# Certbot yükle
sudo apt-get install certbot python3-certbot-nginx

# Sertifika iste
sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com

# Docker'a ekle
volumes:
  - /etc/letsencrypt/live/yourdomain.com:/app/certs:ro
```

### Nginx Reverse Proxy

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Modern SSL config
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}

# HTTP → HTTPS redirect
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

---

## 📊 Monitoring & Logging

### Prometheus Metrics

```javascript
// src/middlewares/metrics.js
const promClient = require('prom-client');

const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
});

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration.labels(req.method, req.route?.path || 'unknown', res.statusCode).observe(duration);
  });
  next();
});

app.get('/metrics', (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(promClient.register.metrics());
});
```

### ELK Stack (Elasticsearch, Logstash, Kibana)

```yaml
# docker-compose.yml ek services
elasticsearch:
  image: docker.elastic.co/elasticsearch/elasticsearch:7.14.0
  environment:
    - discovery.type=single-node
    - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
  ports:
    - "9200:9200"

kibana:
  image: docker.elastic.co/kibana/kibana:7.14.0
  ports:
    - "5601:5601"
```

**Winston + Elasticsearch:**
```bash
npm install winston-elasticsearch
```

---

## 🔄 CI/CD Pipeline

Bkz. `.github/workflows/ci.yml`

```bash
# Otomatik test, build, push, deploy
git push origin main → GitHub Actions → Build → Test → Deploy
```

---

## 📈 Scaling Stratejisi

### Horizontal Scaling (Birden fazla instance)

```yaml
# docker-compose-production.yml
app:
  deploy:
    replicas: 3  # 3 instance çalıştır

# Load balancer (Nginx/HAProxy) ön tarafta
upstream app_servers {
    server app1:3000;
    server app2:3000;
    server app3:3000;
}
```

### Vertical Scaling (Daha güçlü server)

```bash
# AWS EC2 instance type yükselt
# t2.micro → t2.small (512MB → 2GB RAM)
```

### Database Scaling

```javascript
// Redis cluster
const Redis = require('ioredis');
const cluster = new Redis.Cluster([
  { host: 'redis-1', port: 6379 },
  { host: 'redis-2', port: 6379 },
  { host: 'redis-3', port: 6379 },
]);
```

---

## 🚨 Health Checks & Alerting

### Health Endpoint

```bash
GET /api/health
→ App status
→ Redis connection
→ Database status
```

### Automated Alerts

**Uptime Kuma ile monitor et:**
```bash
# Add endpoint: https://yourdomain.com/api/health
# Alert: Discord, Telegram, Email
```

**PagerDuty Entegrasyonu:**
```bash
# CPU > 80% → PagerDuty alert → On-call engineer
```

---

## 🔄 Rollback Stratejisi

### Blue-Green Deployment

```bash
# Blue (Current)
docker-compose -f docker-compose.blue.yml up -d

# Green (New)
docker-compose -f docker-compose.green.yml up -d

# Test green...
curl http://localhost:3001/api/health

# Switch traffic
# nginx: upstream app_servers → green

# Keep blue as rollback
docker-compose -f docker-compose.blue.yml up -d
```

---

## 📝 Backup & Disaster Recovery

### Database Backup

```bash
#!/bin/bash
# backup-db.sh
BACKUP_DIR="/backups/middleware-selection"
DB_FILE="/app/data/middleware.db"

mkdir -p $BACKUP_DIR
cp $DB_FILE $BACKUP_DIR/middleware-$(date +%Y%m%d-%H%M%S).db

# Eski backuplar sil (30+ gün)
find $BACKUP_DIR -mtime +30 -delete
```

**Cron job:**
```bash
0 2 * * * /path/to/backup-db.sh
```

### Redis Persistence

```ini
# redis.conf
save 900 1       # 900 saniyede 1 değişiklik
save 300 10      # 300 saniyede 10 değişiklik
save 60 10000    # 60 saniyede 10000 değişiklik

appendonly yes   # AOF persistence
```

---

## ✅ Pre-Production Checklist

- [ ] Tüm secrets `.env`'de, kod'da değil
- [ ] HTTPS/TLS enabled
- [ ] Redis password set + strong password
- [ ] Database backups otomatik
- [ ] Rate limits adjusted for production
- [ ] Error messages sanitized
- [ ] Monitoring alerts configured
- [ ] Disaster recovery plan tested
- [ ] Load testing passed (1000+ concurrent)
- [ ] Security audit passed

---

**Son güncellenme:** 2026-04-05
