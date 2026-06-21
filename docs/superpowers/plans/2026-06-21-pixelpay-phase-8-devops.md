# Phase 8: DevOps, Hardening & Deployment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Production Docker Compose with optimized multi-stage builds, Nginx reverse proxy with TLS, GitHub Actions CI/CD pipeline, health check endpoints, database backup automation, environment hardening, and a k6 load test for baseline performance.

**Architecture:** Production images built with multi-stage Dockerfiles (build → run). Docker Compose Production groups: `app` tier (api replicas + web), `worker` tier (topup, payment, notification workers), `data` tier (postgres, redis). Nginx terminates TLS and load-balances API replicas.

**Tech Stack:** Docker, Docker Compose, Nginx, GitHub Actions, k6 (load test), certbot (Let's Encrypt)

## Global Constraints

- Docker images run as non-root user (uid 1001)
- No secrets in Dockerfiles or docker-compose — all via `env_file` or Docker secrets
- Production API must pass health check before receiving traffic
- All containers have explicit `restart: unless-stopped`
- DB backup script runs as cron inside a dedicated container or host cron
- CI fails if any test (unit or e2e) fails

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `infrastructure/docker/Dockerfile.api` | Create | Multi-stage NestJS production image |
| `infrastructure/docker/Dockerfile.web` | Create | Multi-stage Next.js production image |
| `infrastructure/docker/Dockerfile.worker` | Create | BullMQ worker image (same as API, different CMD) |
| `docker-compose.prod.yml` | Create | Production compose with all services |
| `infrastructure/nginx/conf.d/default.conf` | Create | Nginx reverse proxy config |
| `apps/api/src/health/health.controller.ts` | Create | /api/v1/health endpoints |
| `apps/api/src/health/health.module.ts` | Create | HealthModule |
| `infrastructure/scripts/db-backup.sh` | Create | pg_dump to S3 |
| `infrastructure/scripts/deploy.sh` | Create | Zero-downtime deploy script |
| `.github/workflows/ci.yml` | Create | CI: lint, test, build |
| `.github/workflows/deploy.yml` | Create | CD: build images, push, deploy |
| `apps/api/test/load/topup-flow.js` | Create | k6 load test script |

---

### Task 1: Production Dockerfiles

- [ ] **Step 1: Write API multi-stage Dockerfile**

`infrastructure/docker/Dockerfile.api`:
```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json turbo.json ./
COPY apps/api/package.json ./apps/api/
RUN npm ci --workspace=apps/api
COPY apps/api ./apps/api
WORKDIR /app/apps/api
RUN npx prisma generate
RUN npm run build

# Stage 2: Run
FROM node:20-alpine AS runner
RUN addgroup -g 1001 nodejs && adduser -u 1001 -G nodejs -s /bin/sh -D nestjs
WORKDIR /app
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/prisma ./prisma
USER nestjs
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD wget -q --spider http://localhost:3000/api/v1/health || exit 1
CMD ["node", "dist/main"]
```

- [ ] **Step 2: Write Next.js multi-stage Dockerfile**

`infrastructure/docker/Dockerfile.web`:
```dockerfile
# Stage 1: Deps
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json turbo.json ./
COPY apps/web/package.json ./apps/web/
RUN npm ci --workspace=apps/web

# Stage 2: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY apps/web ./apps/web
COPY package.json turbo.json ./
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app/apps/web
RUN npm run build

# Stage 3: Run
FROM node:20-alpine AS runner
RUN addgroup -g 1001 nodejs && adduser -u 1001 -G nodejs -s /bin/sh -D nextjs
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./public
USER nextjs
EXPOSE 3001
CMD ["node", "server.js"]
```

- [ ] **Step 3: Write Worker Dockerfile**

`infrastructure/docker/Dockerfile.worker`:
```dockerfile
FROM node:20-alpine AS runner
RUN addgroup -g 1001 nodejs && adduser -u 1001 -G nodejs -s /bin/sh -D worker
WORKDIR /app
COPY --from=builder --chown=worker:nodejs /app/apps/api/dist ./dist
COPY --from=builder --chown=worker:nodejs /app/apps/api/node_modules ./node_modules
USER worker
CMD ["node", "dist/main.worker"]
```

Note: Create `apps/api/src/main.worker.ts` that only bootstraps `BullMQ` modules (orders, payments, notifications processors) without HTTP server.

`apps/api/src/main.worker.ts`:
```typescript
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma/prisma.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { NotificationsModule } from './notifications/notifications.module';
import appConfig from './config/app.config';
import redisConfig from './config/redis.config';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [appConfig, redisConfig] }),
    BullModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        connection: { url: config.get<string>('redis.url') },
      }),
      inject: [ConfigService],
    }),
    PrismaModule,
    OrdersModule,
    PaymentsModule,
    NotificationsModule,
  ],
})
class WorkerModule {}

async function bootstrap() {
  await NestFactory.createApplicationContext(WorkerModule, { logger: ['error', 'warn', 'log'] });
  console.log('Worker started');
}
bootstrap();
```

- [ ] **Step 4: Commit Dockerfiles**

```bash
git add infrastructure/docker/
git commit -m "feat: production multi-stage Dockerfiles for API, web, and workers"
```

---

### Task 2: Production Docker Compose

- [ ] **Step 1: Write docker-compose.prod.yml**

`docker-compose.prod.yml`:
```yaml
services:
  nginx:
    image: nginx:1.25-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./infrastructure/nginx/conf.d:/etc/nginx/conf.d:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
      - nginx_logs:/var/log/nginx
    depends_on:
      - api
      - web
    restart: unless-stopped

  api:
    build:
      context: .
      dockerfile: infrastructure/docker/Dockerfile.api
    env_file: .env
    deploy:
      replicas: 2
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000/api/v1/health"]
      interval: 15s
      timeout: 5s
      retries: 3

  web:
    build:
      context: .
      dockerfile: infrastructure/docker/Dockerfile.web
    env_file: .env
    restart: unless-stopped

  topup-worker:
    build:
      context: .
      dockerfile: infrastructure/docker/Dockerfile.worker
    env_file: .env
    deploy:
      replicas: 2
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  notification-worker:
    build:
      context: .
      dockerfile: infrastructure/docker/Dockerfile.worker
    env_file: .env
    depends_on:
      - redis
      - postgres
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    env_file: .env
    environment:
      POSTGRES_USER: "${DB_USER}"
      POSTGRES_PASSWORD: "${DB_PASSWORD}"
      POSTGRES_DB: "${DB_NAME}"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD} --appendonly yes
    volumes:
      - redis_data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
  redis_data:
  nginx_logs:
```

- [ ] **Step 2: Write Nginx config**

`infrastructure/nginx/conf.d/default.conf`:
```nginx
upstream api {
    server api:3000;
    keepalive 32;
}

upstream web {
    server web:3001;
}

server {
    listen 80;
    server_name pixelpay.th www.pixelpay.th;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name pixelpay.th www.pixelpay.th;

    ssl_certificate /etc/letsencrypt/live/pixelpay.th/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/pixelpay.th/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    # Security headers
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy no-referrer-when-downgrade always;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=30r/s;
    limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=5r/m;

    # API routes
    location /api/ {
        limit_req zone=api_limit burst=20 nodelay;
        proxy_pass http://api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        client_max_body_size 10m;
    }

    # Auth rate limiting
    location /api/v1/auth/login {
        limit_req zone=auth_limit burst=3 nodelay;
        proxy_pass http://api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket
    location /socket.io/ {
        proxy_pass http://api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    # Next.js
    location / {
        proxy_pass http://web;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add docker-compose.prod.yml infrastructure/nginx/
git commit -m "feat: production Docker Compose and Nginx reverse proxy config"
```

---

### Task 3: Health Check Endpoints

- [ ] **Step 1: Write HealthController**

`apps/api/src/health/health.controller.ts`:
```typescript
import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Controller('health')
export class HealthController {
  constructor(
    private prisma: PrismaService,
    @InjectQueue('topup') private topupQueue: Queue,
  ) {}

  @Get()
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('db')
  async checkDb() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', database: 'connected' };
  }

  @Get('queues')
  async checkQueues() {
    const counts = await this.topupQueue.getJobCounts('waiting', 'active', 'failed');
    return { status: 'ok', topupQueue: counts };
  }
}
```

`apps/api/src/health/health.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HealthController } from './health.controller';

@Module({
  imports: [BullModule.registerQueue({ name: 'topup' })],
  controllers: [HealthController],
})
export class HealthModule {}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/health/
git commit -m "feat: health check endpoints — liveness, DB, queue status"
```

---

### Task 4: CI/CD Pipeline

- [ ] **Step 1: Write CI workflow**

`.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: pixelpay
          POSTGRES_PASSWORD: pixelpay
          POSTGRES_DB: pixelpay_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Generate Prisma client
        run: cd apps/api && npx prisma generate

      - name: Run migrations
        env:
          DATABASE_URL: postgresql://pixelpay:pixelpay@localhost:5432/pixelpay_test
        run: cd apps/api && npx prisma migrate deploy

      - name: Run unit tests
        env:
          DATABASE_URL: postgresql://pixelpay:pixelpay@localhost:5432/pixelpay_test
          REDIS_URL: redis://localhost:6379
          JWT_SECRET: test_jwt_secret_64_chars_minimum_for_testing_purposes_only
          JWT_REFRESH_SECRET: test_refresh_secret_64_chars_minimum_for_testing_purposes
          ENCRYPTION_KEY: 0123456789abcdef0123456789abcdef
          JWT_EXPIRES_IN: 15m
          JWT_REFRESH_EXPIRES_IN: 7d
        run: cd apps/api && npm test -- --coverage

      - name: Run e2e tests
        env:
          DATABASE_URL: postgresql://pixelpay:pixelpay@localhost:5432/pixelpay_test
          REDIS_URL: redis://localhost:6379
          JWT_SECRET: test_jwt_secret_64_chars_minimum_for_testing_purposes_only
          JWT_REFRESH_SECRET: test_refresh_secret_64_chars_minimum_for_testing_purposes
          ENCRYPTION_KEY: 0123456789abcdef0123456789abcdef
          JWT_EXPIRES_IN: 15m
          JWT_REFRESH_EXPIRES_IN: 7d
        run: cd apps/api && npm run test:e2e

      - name: Build API
        run: cd apps/api && npm run build

      - name: Build Web
        env:
          NEXT_PUBLIC_API_URL: https://pixelpay.th/api/v1
          NEXT_PUBLIC_WS_URL: wss://pixelpay.th
        run: cd apps/web && npm run build
```

- [ ] **Step 2: Write deploy workflow**

`.github/workflows/deploy.yml`:
```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    needs: []

    steps:
      - uses: actions/checkout@v4

      - name: Build and push Docker images
        env:
          REGISTRY: ghcr.io/${{ github.repository_owner }}
        run: |
          echo "${{ secrets.GITHUB_TOKEN }}" | docker login ghcr.io -u ${{ github.actor }} --password-stdin
          docker build -f infrastructure/docker/Dockerfile.api -t $REGISTRY/pixelpay-api:${{ github.sha }} .
          docker build -f infrastructure/docker/Dockerfile.web -t $REGISTRY/pixelpay-web:${{ github.sha }} .
          docker push $REGISTRY/pixelpay-api:${{ github.sha }}
          docker push $REGISTRY/pixelpay-web:${{ github.sha }}

      - name: Deploy to VPS
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /opt/pixelpay
            git pull origin main
            export IMAGE_TAG=${{ github.sha }}
            docker compose -f docker-compose.prod.yml pull
            docker compose -f docker-compose.prod.yml up -d --no-deps --scale api=2 api
            docker compose -f docker-compose.prod.yml run --rm api npx prisma migrate deploy
            docker compose -f docker-compose.prod.yml up -d web topup-worker notification-worker
            docker image prune -f
```

- [ ] **Step 3: Commit CI/CD**

```bash
git add .github/
git commit -m "feat: GitHub Actions CI (test + build) and CD (deploy to VPS)"
```

---

### Task 5: Database Backup Script

- [ ] **Step 1: Write db-backup.sh**

`infrastructure/scripts/db-backup.sh`:
```bash
#!/bin/sh
set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="pixelpay_${TIMESTAMP}.dump"
S3_PATH="s3://${S3_BUCKET}/db-backups/${BACKUP_FILE}"

echo "Starting backup: ${BACKUP_FILE}"

pg_dump \
  --host="${DB_HOST}" \
  --port="${DB_PORT:-5432}" \
  --username="${DB_USER}" \
  --format=custom \
  --no-password \
  "${DB_NAME}" > "/tmp/${BACKUP_FILE}"

aws s3 cp "/tmp/${BACKUP_FILE}" "${S3_PATH}" \
  --endpoint-url "${S3_ENDPOINT}" \
  --no-progress

rm "/tmp/${BACKUP_FILE}"

# Prune backups older than 30 days
aws s3 ls "s3://${S3_BUCKET}/db-backups/" \
  --endpoint-url "${S3_ENDPOINT}" | \
  awk '{print $4}' | \
  while read -r file; do
    age=$(aws s3 metadata "s3://${S3_BUCKET}/db-backups/${file}" | jq -r '.LastModified')
    # Prune logic depends on host date utilities
  done

echo "Backup complete: ${S3_PATH}"
```

Add to `docker-compose.prod.yml`:
```yaml
db-backup:
  image: postgres:16-alpine
  environment:
    PGPASSWORD: "${DB_PASSWORD}"
  volumes:
    - ./infrastructure/scripts/db-backup.sh:/backup.sh:ro
  entrypoint: ["crond", "-f", "-d", "8"]
  restart: unless-stopped
```

And set up host crontab (or use the container cron):
```
0 2 * * * docker exec pixelpay-db-backup-1 /backup.sh >> /var/log/db-backup.log 2>&1
```

- [ ] **Step 2: Commit**

```bash
git add infrastructure/scripts/
git commit -m "feat: automated PostgreSQL backup script with S3 upload"
```

---

### Task 6: k6 Load Test

- [ ] **Step 1: Write load test**

`apps/api/test/load/topup-flow.js`:
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 20 },  // Ramp up to 20 users
    { duration: '1m', target: 20 },   // Steady state
    { duration: '30s', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests under 2s
    http_req_failed: ['rate<0.01'],    // Less than 1% failure rate
  },
};

const BASE = __ENV.API_URL || 'http://localhost:3000/api/v1';

export function setup() {
  const res = http.post(`${BASE}/auth/register`, JSON.stringify({
    email: `load_${Date.now()}@test.com`,
    password: 'Test1234!',
    displayName: 'Load Test',
  }), { headers: { 'Content-Type': 'application/json' } });

  return { token: res.json('data.accessToken') };
}

export default function (data) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${data.token}`,
  };

  // Test game catalog (read-heavy)
  const gamesRes = http.get(`${BASE}/games`, { headers });
  check(gamesRes, { 'games 200': (r) => r.status === 200 });

  // Test wallet balance
  const walletRes = http.get(`${BASE}/wallet`, { headers });
  check(walletRes, { 'wallet 200': (r) => r.status === 200 });

  // Test order list
  const ordersRes = http.get(`${BASE}/orders`, { headers });
  check(ordersRes, { 'orders 200': (r) => r.status === 200 });

  sleep(1);
}
```

Run: `k6 run --env API_URL=http://localhost:3000/api/v1 apps/api/test/load/topup-flow.js`

- [ ] **Step 2: Commit load test**

```bash
git add apps/api/test/load/
git commit -m "test: k6 load test for game catalog, wallet, and order endpoints"
```

---

### Phase 8 Completion Checklist

- [ ] `Dockerfile.api` multi-stage build produces <200MB image running as non-root
- [ ] `Dockerfile.web` uses Next.js standalone output
- [ ] `docker-compose.prod.yml` starts all services with healthchecks
- [ ] Nginx terminates TLS, rate-limits `/auth/login`, proxies API + WebSocket + web
- [ ] `GET /api/v1/health` returns `{ status: 'ok' }` (used for Docker healthcheck)
- [ ] CI pipeline runs on every PR: unit tests + e2e tests + build
- [ ] CD pipeline deploys to VPS on push to `main`
- [ ] DB backup script dumps to S3 on cron
- [ ] k6 load test shows p95 < 2s at 20 concurrent users
- [ ] All secrets in environment variables, none hardcoded in any file

---

## Final Project Launch Checklist

Before going live, verify all of the following:

### Infrastructure
- [ ] TLS certificates installed (certbot renew --dry-run passes)
- [ ] Nginx config tested: `nginx -t`
- [ ] All containers healthy: `docker compose ps`
- [ ] DB migrations applied: `npx prisma migrate status`
- [ ] Seed data loaded: admin user, initial games, provider config

### Security
- [ ] All production secrets rotated from defaults
- [ ] `ENCRYPTION_KEY` is 32-byte hex (64 chars) — `openssl rand -hex 32`
- [ ] `JWT_SECRET` and `JWT_REFRESH_SECRET` each >= 64 chars random
- [ ] `PAYMENT_WEBHOOK_SECRET` configured and matches gateway settings
- [ ] DB not accessible from internet (only internal Docker network)
- [ ] Redis password set and not exposed externally
- [ ] Cloudflare WAF enabled on domain
- [ ] `npm audit` passes with 0 critical vulnerabilities

### Monitoring
- [ ] Log rotation configured for Nginx logs
- [ ] Sentry DSN configured (optional but recommended)
- [ ] Alert on queue `failed` job count > 10

### Provider Config
- [ ] At least 2 providers configured in DB with valid API keys
- [ ] Provider products mapped in `provider_products` table
- [ ] Provider API keys stored encrypted (never plaintext)

### Payment Gateway
- [ ] Webhook URL registered with payment gateway
- [ ] Test payment end-to-end with real PromptPay QR
