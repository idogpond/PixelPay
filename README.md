# PixelPay

Game top-up payment platform built with NestJS, Next.js 14, and PostgreSQL.

## Stack

| Layer | Technology |
|-------|-----------|
| API | NestJS 10, Fastify, Prisma 5, BullMQ |
| Frontend | Next.js 14 (App Router), Tailwind CSS, Zustand |
| Database | PostgreSQL 16 |
| Cache / Queue | Redis 7 |
| Reverse Proxy | Nginx (production) |

---

## Prerequisites

- Node.js >= 20
- Docker & Docker Compose
- npm

---

## Quick Start (Docker — recommended)

### 1. Clone and install root dependencies

```bash
git clone <repo-url> pixelpay
cd pixelpay
npm install
```

### 2. Create environment file

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

```env
JWT_SECRET=<random 64-char string>
JWT_REFRESH_SECRET=<random 64-char string>
ENCRYPTION_KEY=<exactly 32 hex chars>
```

### 3. Start the full stack

```bash
docker compose up --build
```

This starts:
- **PostgreSQL** on port `5432`
- **Redis** on port `6379`
- **API** on `http://localhost:3000`
- **Frontend** on `http://localhost:3001`

### 4. Run database migrations

In a separate terminal (first time only):

```bash
docker compose exec api npx prisma migrate deploy
```

### 5. Open the app

- Frontend: http://localhost:3001
- API docs (Swagger): http://localhost:3000/api/v1/docs
- Health check: http://localhost:3000/api/v1/health

---

## Local Development (without Docker)

### 1. Start infrastructure only

```bash
docker compose up postgres redis -d
```

### 2. Install dependencies

```bash
npm install
cd apps/api && npm install
cd ../web && npm install
```

### 3. Set up environment

```bash
cp .env.example .env
# Update DATABASE_URL and REDIS_URL to point to localhost
```

`.env` defaults for local infrastructure:

```env
DATABASE_URL=postgresql://pixelpay:pixelpay@localhost:5432/pixelpay
REDIS_URL=redis://:pixelpay@localhost:6379
```

### 4. Run migrations and generate Prisma client

```bash
cd apps/api
npx prisma migrate deploy
npx prisma generate
```

### 5. Start both apps

```bash
# From monorepo root — starts API + frontend in watch mode
npm run dev
```

Or separately:

```bash
# API (port 3000)
cd apps/api && npm run start:dev

# Frontend (port 3001)
cd apps/web && npm run dev
```

---

## Project Structure

```
pixelpay/
├── apps/
│   ├── api/                  # NestJS backend
│   │   ├── src/
│   │   │   ├── auth/         # JWT auth, refresh tokens
│   │   │   ├── users/        # User management
│   │   │   ├── wallet/       # Balance, transactions
│   │   │   ├── payments/     # PromptPay, webhooks
│   │   │   ├── games/        # Game catalog
│   │   │   ├── orders/       # Order creation, WebSocket tracking
│   │   │   ├── topup/        # BullMQ processor, provider failover
│   │   │   ├── coupons/      # Discount codes
│   │   │   ├── cashback/     # Cashback rules engine
│   │   │   ├── affiliates/   # Affiliate commissions
│   │   │   ├── notifications/# Email / SMS notifications
│   │   │   ├── audit/        # Audit log interceptor
│   │   │   ├── admin/        # Admin endpoints
│   │   │   ├── analytics/    # Revenue, order stats
│   │   │   ├── resellers/    # Reseller applications
│   │   │   └── health/       # Health check endpoints
│   │   ├── prisma/           # Prisma schema & migrations
│   │   └── test/             # Unit & e2e tests, k6 load test
│   └── web/                  # Next.js 14 frontend
│       ├── app/
│       │   ├── (auth)/       # Login, register pages
│       │   ├── (dashboard)/  # Game catalog, order flow
│       │   └── admin/        # Admin dashboard
│       ├── components/       # GameCard, OrderTracker, QrPaymentModal
│       ├── stores/           # Zustand auth store
│       └── lib/              # API client (in-memory token)
├── infrastructure/
│   ├── docker/               # Production Dockerfiles
│   ├── nginx/                # Nginx config (TLS, rate limiting)
│   └── scripts/              # db-backup.sh
├── .github/workflows/        # CI (tests) + CD (GHCR push, SSH deploy)
├── docker-compose.yml        # Development stack
└── docker-compose.prod.yml   # Production stack
```

---

## Available Scripts

From the monorepo root:

| Command | Description |
|---------|-------------|
| `npm run dev` | Start API + frontend in watch mode |
| `npm run build` | Build all apps |
| `npm run test` | Run all test suites |
| `npm run lint` | Lint all apps |

From `apps/api`:

| Command | Description |
|---------|-------------|
| `npx prisma migrate dev` | Create and apply a new migration |
| `npx prisma migrate deploy` | Apply pending migrations |
| `npx prisma studio` | Open Prisma database browser |
| `npm run test` | Run unit tests |
| `npm run test:e2e` | Run e2e tests (requires live DB + Redis) |

---

## API Overview

Base URL: `http://localhost:3000/api/v1`

| Group | Endpoints |
|-------|-----------|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` |
| Users | `GET /users/me`, `PATCH /users/me` |
| Wallet | `GET /wallet`, `POST /wallet/deposit`, `GET /wallet/transactions` |
| Games | `GET /games`, `GET /games/:id` |
| Orders | `POST /orders`, `GET /orders`, `GET /orders/:id` |
| Payments | `POST /payments/promptpay`, `POST /payments/webhook` |
| Coupons | `POST /coupons/validate` |
| Resellers | `POST /reseller/apply`, `GET /reseller/products` |
| Admin | `GET /admin/stats`, `GET /admin/users`, `GET /admin/orders`, `GET /admin/resellers` |
| Analytics | `GET /admin/analytics/revenue`, `GET /admin/analytics/orders`, `GET /admin/analytics/users` |
| Health | `GET /health`, `GET /health/db`, `GET /health/queues` |

---

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `REDIS_URL` | Redis connection string | Yes |
| `JWT_SECRET` | JWT signing secret (64+ chars) | Yes |
| `JWT_REFRESH_SECRET` | Refresh token secret (64+ chars) | Yes |
| `ENCRYPTION_KEY` | AES-256 key for provider credentials (32 hex chars) | Yes |
| `PAYMENT_GATEWAY_URL` | Payment gateway base URL | Yes |
| `PAYMENT_GATEWAY_API_KEY` | Payment gateway API key | Yes |
| `PAYMENT_GATEWAY_SECRET` | Payment gateway secret | Yes |
| `PAYMENT_WEBHOOK_SECRET` | Webhook signature secret | Yes |
| `SMTP_HOST` | SMTP server for email notifications | Optional |
| `TWILIO_ACCOUNT_SID` | Twilio SID for SMS | Optional |
| `NEXT_PUBLIC_API_URL` | API URL for the frontend | Yes |
| `NEXT_PUBLIC_WS_URL` | WebSocket URL for order tracking | Yes |

---

## Production Deployment

### Docker (self-hosted VPS)

```bash
# On the server
cp .env.example .env
# Fill in production values

docker compose -f docker-compose.prod.yml up --build -d

# Apply migrations
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
```

Requires:
- TLS certificates in `/etc/letsencrypt` (Let's Encrypt / Certbot)
- `FRONTEND_URL` env var for WebSocket CORS

### CI/CD (GitHub Actions)

Push to `main` triggers:
1. CI — runs tests against Postgres 16 + Redis 7
2. CD — builds Docker images, pushes to GHCR, deploys to VPS via SSH

Required GitHub secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `GHCR_TOKEN`

---

## Load Testing

Requires [k6](https://k6.io/docs/get-started/installation/).

```bash
k6 run apps/api/test/load/topup-flow.js

# Against a specific environment
API_URL=https://api.yourdomain.com/api/v1 k6 run apps/api/test/load/topup-flow.js
```

Ramps to 20 virtual users over 30 s, holds for 1 min, ramps down.
Thresholds: p95 < 2 s, error rate < 1%.

---

## Database Backups

```bash
# Manual backup to S3
bash infrastructure/scripts/db-backup.sh

# Required env vars
S3_BUCKET=pixelpay
S3_ENDPOINT=https://s3.amazonaws.com
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
PGPASSWORD=...
POSTGRES_DB=pixelpay
POSTGRES_USER=pixelpay
```
