# PixelPay — Master Technical Blueprint

> **CTO Reference Document** — Architecture, ERD, API Contracts, Security, Roadmap, and Scaling Strategy.
> For implementation tasks, see the phase plans in this directory.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [System Architecture Diagram](#system-architecture-diagram)
3. [Request Flow Diagrams](#request-flow-diagrams)
4. [Entity Relationship Diagram (ERD)](#entity-relationship-diagram)
5. [Database Schema (All Tables)](#database-schema)
6. [Folder Structure](#folder-structure)
7. [API Endpoint Contracts](#api-endpoint-contracts)
8. [Infrastructure Architecture](#infrastructure-architecture)
9. [Security Checklist](#security-checklist)
10. [Development Roadmap & Sprint Plan](#development-roadmap--sprint-plan)
11. [MVP-to-Production Scaling Strategy](#mvp-to-production-scaling-strategy)
12. [Deployment Guide](#deployment-guide)

---

## System Overview

**PixelPay** is a B2C/B2B Online Game Topup Platform that:
- Lets users buy in-game currency/items via a unified catalog backed by multiple reseller provider APIs
- Processes payments via Wallet (prepaid balance) or PromptPay QR
- Handles multi-provider failover and automatic retries for topup delivery
- Provides an affiliate program, coupons, and cashback to drive growth
- Exposes a reseller API and admin dashboard for B2B partners and operators

**Tech Stack:**
- Frontend: Next.js 14 (App Router, TypeScript)
- Backend: NestJS (TypeScript, Fastify adapter)
- ORM: Prisma
- Database: PostgreSQL 16
- Cache / Queue broker: Redis 7
- Queue workers: BullMQ
- Containerization: Docker + Docker Compose
- Reverse proxy: Nginx
- Email: Nodemailer + SMTP (or SendGrid)
- SMS: Twilio / AWS SNS
- Payment: PromptPay via GB Pay / 2C2P / Omise

---

## System Architecture Diagram

```mermaid
graph TB
    subgraph CLIENT["Client Layer"]
        WEB["Next.js Web (SSR/CSR)"]
        MOB["Mobile Browser"]
    end

    subgraph GATEWAY["API Gateway"]
        NGINX["Nginx\n(TLS termination, rate-limit, routing)"]
    end

    subgraph APP["Application Layer"]
        API["NestJS REST API\n:3000"]
        WS["WebSocket Gateway\n(order status push)"]
    end

    subgraph WORKERS["Queue Workers (BullMQ)"]
        TOPUP_W["Topup Worker"]
        PAYMENT_W["Payment Poller Worker"]
        NOTIF_W["Notification Worker"]
        ANALYTICS_W["Analytics Worker"]
    end

    subgraph CACHE["Cache & Broker"]
        REDIS["Redis 7\n(cache + BullMQ broker)"]
    end

    subgraph DATA["Data Layer"]
        PG[("PostgreSQL 16\n(primary data)")]
    end

    subgraph EXTERNAL["External Services"]
        PROV1["Reseller API 1\n(e.g. Unipin)"]
        PROV2["Reseller API 2\n(e.g. Smile.one)"]
        PROV3["Reseller API 3\n(fallback)"]
        PGWAY["Payment Gateway\n(GB Pay / 2C2P)"]
        EMAIL["SMTP / SendGrid"]
        SMS["Twilio / SNS"]
    end

    subgraph STORAGE["Object Storage"]
        S3["S3 / MinIO\n(avatars, receipts)"]
    end

    WEB --> NGINX
    MOB --> NGINX
    NGINX --> API
    NGINX --> WS
    API --> REDIS
    API --> PG
    API --> PGWAY
    API --> S3
    API --> REDIS
    REDIS --> TOPUP_W
    REDIS --> PAYMENT_W
    REDIS --> NOTIF_W
    REDIS --> ANALYTICS_W
    TOPUP_W --> PROV1
    TOPUP_W --> PROV2
    TOPUP_W --> PROV3
    TOPUP_W --> PG
    PAYMENT_W --> PGWAY
    PAYMENT_W --> PG
    NOTIF_W --> EMAIL
    NOTIF_W --> SMS
    ANALYTICS_W --> PG
    WS --> REDIS
```

---

## Request Flow Diagrams

### Order Creation & Topup Processing Flow

```mermaid
sequenceDiagram
    actor U as User
    participant FE as Next.js
    participant API as NestJS API
    participant DB as PostgreSQL
    participant Q as BullMQ Queue
    participant W as Topup Worker
    participant P1 as Provider 1
    participant P2 as Provider 2 (failover)
    participant WS as WebSocket
    participant N as Notification Worker

    U->>FE: Select product, enter game UID
    FE->>API: POST /orders
    API->>DB: Deduct wallet balance (locked)
    API->>DB: INSERT order (status=PENDING)
    API->>Q: Enqueue topup job {orderId}
    API->>FE: 201 {orderId, status=PENDING}
    FE->>WS: Subscribe to order:{orderId}

    Q->>W: Dequeue job
    W->>DB: UPDATE order status=PROCESSING
    W->>WS: Emit order.processing
    W->>P1: POST topup request
    alt Provider 1 Success
        P1->>W: 200 {providerRef}
        W->>DB: UPDATE order status=COMPLETED
        W->>DB: Confirm wallet deduction
        W->>DB: Award cashback
        W->>DB: Award affiliate commission
        W->>WS: Emit order.completed
        W->>N: Enqueue success notification
    else Provider 1 Failed (retry 1)
        P1->>W: Error / timeout
        W->>P2: POST topup request (failover)
        alt Provider 2 Success
            P2->>W: 200 {providerRef}
            W->>DB: UPDATE order status=COMPLETED
            W->>WS: Emit order.completed
            W->>N: Enqueue success notification
        else All providers failed
            W->>DB: UPDATE order status=FAILED
            W->>DB: Restore wallet balance (unlock)
            W->>WS: Emit order.failed
            W->>N: Enqueue failure notification
        end
    end
    N->>U: Email + SMS + In-app push
```

### PromptPay Payment Flow

```mermaid
sequenceDiagram
    actor U as User
    participant FE as Next.js
    participant API as NestJS API
    participant GW as Payment Gateway
    participant DB as PostgreSQL
    participant W as Payment Poller
    participant WS as WebSocket

    U->>FE: Choose PromptPay deposit
    FE->>API: POST /payments/promptpay {amount}
    API->>GW: Create QR charge
    GW->>API: {qrCodeUrl, chargeId, expiresAt}
    API->>DB: INSERT payment (status=PENDING)
    API->>FE: {qrCodeUrl, paymentId}
    FE->>U: Show QR code countdown
    FE->>WS: Subscribe to payment:{paymentId}

    GW-->>API: Webhook POST /payments/webhook
    API->>DB: UPDATE payment status=COMPLETED
    API->>DB: Credit wallet
    API->>WS: Emit payment.completed

    Note over W: Parallel polling fallback
    W->>GW: GET charge status (every 10s)
    alt Paid
        GW->>W: status=paid
        W->>DB: UPDATE payment (idempotent)
    else Expired
        GW->>W: status=expired
        W->>DB: UPDATE payment status=EXPIRED
    end
```

---

## Entity Relationship Diagram

```mermaid
erDiagram
    USERS {
        uuid id PK
        string email UK
        string phone UK
        string password_hash
        string display_name
        string avatar_url
        enum role
        boolean is_verified
        boolean is_active
        string referral_code UK
        uuid referred_by FK
        timestamptz created_at
        timestamptz updated_at
    }

    WALLETS {
        uuid id PK
        uuid user_id FK UK
        decimal balance
        decimal locked_balance
        string currency
        timestamptz updated_at
    }

    WALLET_TRANSACTIONS {
        uuid id PK
        uuid wallet_id FK
        enum type
        decimal amount
        decimal balance_before
        decimal balance_after
        uuid reference_id
        string reference_type
        jsonb metadata
        timestamptz created_at
    }

    GAMES {
        uuid id PK
        string name
        string slug UK
        string logo_url
        string category
        boolean is_active
        int sort_order
        jsonb metadata
        timestamptz created_at
    }

    GAME_PRODUCTS {
        uuid id PK
        uuid game_id FK
        string name
        string sku UK
        decimal price_cost
        decimal price_sell
        string currency
        enum product_type
        boolean requires_server
        boolean requires_username
        boolean is_active
        jsonb metadata
        timestamptz created_at
    }

    PROVIDERS {
        uuid id PK
        string name
        string slug UK
        string api_url
        text api_key_enc
        text api_secret_enc
        int priority
        boolean is_active
        int rate_limit_per_min
        timestamptz created_at
    }

    PROVIDER_PRODUCTS {
        uuid id PK
        uuid provider_id FK
        uuid game_product_id FK
        string provider_sku
        decimal provider_price
        boolean is_available
        timestamptz last_checked
    }

    ORDERS {
        uuid id PK
        string order_number UK
        uuid user_id FK
        uuid game_product_id FK
        uuid provider_id FK
        uuid coupon_id FK
        int quantity
        decimal unit_price
        decimal total_price
        decimal discount_amount
        decimal cashback_amount
        string game_uid
        string game_server
        string game_username
        enum status
        string provider_order_id
        string provider_reference
        int retry_count
        jsonb metadata
        timestamptz created_at
        timestamptz updated_at
        timestamptz completed_at
    }

    PAYMENTS {
        uuid id PK
        uuid order_id FK
        uuid user_id FK
        enum payment_method
        decimal amount
        string currency
        enum status
        string gateway_reference
        text qr_code_url
        timestamptz expires_at
        timestamptz paid_at
        timestamptz created_at
    }

    COUPONS {
        uuid id PK
        string code UK
        enum discount_type
        decimal value
        decimal min_order_amount
        decimal max_discount
        int usage_limit
        int used_count
        int user_limit
        uuid game_id FK
        boolean is_active
        timestamptz expires_at
        timestamptz created_at
    }

    COUPON_USAGES {
        uuid id PK
        uuid coupon_id FK
        uuid user_id FK
        uuid order_id FK UK
        decimal discount_amount
        timestamptz created_at
    }

    CASHBACK_RULES {
        uuid id PK
        string name
        enum cashback_type
        decimal value
        decimal min_order_amount
        uuid game_id FK
        boolean is_active
        timestamptz expires_at
        timestamptz created_at
    }

    AFFILIATES {
        uuid id PK
        uuid user_id FK UK
        string referral_code UK
        decimal commission_rate
        int total_referrals
        decimal total_earnings
        decimal pending_earnings
        enum status
        timestamptz created_at
    }

    AFFILIATE_COMMISSIONS {
        uuid id PK
        uuid affiliate_id FK
        uuid referred_user_id FK
        uuid order_id FK
        decimal commission_amount
        enum status
        timestamptz paid_at
        timestamptz created_at
    }

    NOTIFICATIONS {
        uuid id PK
        uuid user_id FK
        string type
        string title
        text body
        enum channel
        boolean is_read
        jsonb metadata
        timestamptz sent_at
        timestamptz created_at
    }

    AUDIT_LOGS {
        uuid id PK
        uuid user_id FK
        string action
        string entity_type
        uuid entity_id
        jsonb old_values
        jsonb new_values
        inet ip_address
        text user_agent
        timestamptz created_at
    }

    RESELLERS {
        uuid id PK
        uuid user_id FK UK
        string company_name
        decimal discount_rate
        decimal credit_limit
        decimal credit_used
        enum status
        uuid approved_by FK
        timestamptz approved_at
        timestamptz created_at
    }

    USERS ||--|| WALLETS : owns
    USERS ||--o{ WALLET_TRANSACTIONS : "via wallet"
    USERS ||--o{ ORDERS : places
    USERS ||--o{ PAYMENTS : makes
    USERS ||--o{ NOTIFICATIONS : receives
    USERS ||--o{ AUDIT_LOGS : generates
    USERS ||--o| AFFILIATES : "may be"
    USERS ||--o| RESELLERS : "may be"
    WALLETS ||--o{ WALLET_TRANSACTIONS : has
    GAMES ||--o{ GAME_PRODUCTS : has
    GAME_PRODUCTS ||--o{ PROVIDER_PRODUCTS : mapped_to
    PROVIDERS ||--o{ PROVIDER_PRODUCTS : provides
    ORDERS }o--|| GAME_PRODUCTS : for
    ORDERS }o--o| PROVIDERS : via
    ORDERS }o--o| COUPONS : uses
    ORDERS ||--o{ PAYMENTS : paid_via
    COUPONS ||--o{ COUPON_USAGES : tracks
    COUPON_USAGES }o--|| USERS : by
    COUPON_USAGES }o--|| ORDERS : on
    AFFILIATES ||--o{ AFFILIATE_COMMISSIONS : earns
    AFFILIATE_COMMISSIONS }o--|| ORDERS : from
    CASHBACK_RULES }o--o| GAMES : scoped_to
```

---

## Database Schema

All migrations managed by Prisma. Below is the complete `schema.prisma` reference.

### Enums

```prisma
enum UserRole {
  USER
  ADMIN
  RESELLER
}

enum OrderStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
  REFUNDED
  CANCELLED
}

enum PaymentMethod {
  WALLET
  PROMPTPAY
}

enum PaymentStatus {
  PENDING
  COMPLETED
  FAILED
  EXPIRED
  REFUNDED
}

enum WalletTransactionType {
  DEPOSIT
  WITHDRAWAL
  TOPUP_DEBIT
  TOPUP_REFUND
  CASHBACK_CREDIT
  AFFILIATE_CREDIT
  LOCK
  UNLOCK
}

enum DiscountType {
  PERCENTAGE
  FIXED
}

enum CashbackType {
  PERCENTAGE
  FIXED
}

enum ProductType {
  DIRECT    // Directly tops up the game account
  VOUCHER   // Returns a code/voucher
}

enum AffiliateStatus {
  ACTIVE
  SUSPENDED
}

enum CommissionStatus {
  PENDING
  PAID
}

enum ResellerStatus {
  PENDING
  ACTIVE
  SUSPENDED
}

enum NotificationChannel {
  EMAIL
  SMS
  PUSH
  IN_APP
}
```

### Core Tables

```sql
-- users
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           VARCHAR(255) UNIQUE NOT NULL,
  phone           VARCHAR(20) UNIQUE,
  password_hash   TEXT NOT NULL,
  display_name    VARCHAR(100) NOT NULL,
  avatar_url      TEXT,
  role            user_role NOT NULL DEFAULT 'USER',
  is_verified     BOOLEAN NOT NULL DEFAULT FALSE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  referral_code   VARCHAR(12) UNIQUE NOT NULL,
  referred_by     UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- wallets
CREATE TABLE wallets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance         DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  locked_balance  DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  currency        VARCHAR(3) NOT NULL DEFAULT 'THB',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT balance_non_negative CHECK (balance >= 0),
  CONSTRAINT locked_non_negative CHECK (locked_balance >= 0)
);

-- wallet_transactions
CREATE TABLE wallet_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id       UUID NOT NULL REFERENCES wallets(id),
  type            wallet_transaction_type NOT NULL,
  amount          DECIMAL(15,2) NOT NULL,
  balance_before  DECIMAL(15,2) NOT NULL,
  balance_after   DECIMAL(15,2) NOT NULL,
  reference_id    UUID,
  reference_type  VARCHAR(50),
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_wt_wallet_id ON wallet_transactions(wallet_id);
CREATE INDEX idx_wt_created_at ON wallet_transactions(created_at DESC);

-- games
CREATE TABLE games (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  slug        VARCHAR(100) UNIQUE NOT NULL,
  logo_url    TEXT,
  banner_url  TEXT,
  description TEXT,
  category    VARCHAR(50),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INT NOT NULL DEFAULT 0,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- game_products
CREATE TABLE game_products (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id           UUID NOT NULL REFERENCES games(id),
  name              VARCHAR(200) NOT NULL,
  sku               VARCHAR(100) UNIQUE NOT NULL,
  price_cost        DECIMAL(15,4) NOT NULL,
  price_sell        DECIMAL(15,2) NOT NULL,
  currency          VARCHAR(3) NOT NULL DEFAULT 'THB',
  product_type      product_type NOT NULL DEFAULT 'DIRECT',
  requires_server   BOOLEAN NOT NULL DEFAULT FALSE,
  requires_username BOOLEAN NOT NULL DEFAULT FALSE,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order        INT NOT NULL DEFAULT 0,
  metadata          JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_gp_game_id ON game_products(game_id);
CREATE INDEX idx_gp_is_active ON game_products(is_active);

-- providers
CREATE TABLE providers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                VARCHAR(100) NOT NULL,
  slug                VARCHAR(100) UNIQUE NOT NULL,
  api_url             TEXT NOT NULL,
  api_key_enc         TEXT NOT NULL,
  api_secret_enc      TEXT,
  priority            INT NOT NULL DEFAULT 1,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  rate_limit_per_min  INT NOT NULL DEFAULT 60,
  health_check_url    TEXT,
  metadata            JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- provider_products
CREATE TABLE provider_products (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id       UUID NOT NULL REFERENCES providers(id),
  game_product_id   UUID NOT NULL REFERENCES game_products(id),
  provider_sku      VARCHAR(200) NOT NULL,
  provider_price    DECIMAL(15,4),
  is_available      BOOLEAN NOT NULL DEFAULT TRUE,
  last_checked      TIMESTAMPTZ,
  UNIQUE(provider_id, game_product_id)
);

-- orders
CREATE TABLE orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number        VARCHAR(20) UNIQUE NOT NULL,
  user_id             UUID NOT NULL REFERENCES users(id),
  game_product_id     UUID NOT NULL REFERENCES game_products(id),
  provider_id         UUID REFERENCES providers(id),
  coupon_id           UUID REFERENCES coupons(id),
  quantity            INT NOT NULL DEFAULT 1,
  unit_price          DECIMAL(15,2) NOT NULL,
  total_price         DECIMAL(15,2) NOT NULL,
  discount_amount     DECIMAL(15,2) NOT NULL DEFAULT 0,
  cashback_amount     DECIMAL(15,2) NOT NULL DEFAULT 0,
  payment_method      payment_method NOT NULL,
  game_uid            VARCHAR(100) NOT NULL,
  game_server         VARCHAR(100),
  game_username       VARCHAR(100),
  status              order_status NOT NULL DEFAULT 'PENDING',
  provider_order_id   VARCHAR(200),
  provider_reference  TEXT,
  retry_count         INT NOT NULL DEFAULT 0,
  metadata            JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ
);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX idx_orders_order_number ON orders(order_number);

-- payments
CREATE TABLE payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID REFERENCES orders(id),
  user_id             UUID NOT NULL REFERENCES users(id),
  payment_method      payment_method NOT NULL,
  amount              DECIMAL(15,2) NOT NULL,
  currency            VARCHAR(3) NOT NULL DEFAULT 'THB',
  status              payment_status NOT NULL DEFAULT 'PENDING',
  gateway_reference   VARCHAR(200),
  qr_code_url         TEXT,
  expires_at          TIMESTAMPTZ,
  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);

-- coupons
CREATE TABLE coupons (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code              VARCHAR(50) UNIQUE NOT NULL,
  discount_type     discount_type NOT NULL,
  value             DECIMAL(15,2) NOT NULL,
  min_order_amount  DECIMAL(15,2) NOT NULL DEFAULT 0,
  max_discount      DECIMAL(15,2),
  usage_limit       INT,
  used_count        INT NOT NULL DEFAULT 0,
  user_limit        INT NOT NULL DEFAULT 1,
  game_id           UUID REFERENCES games(id),
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- coupon_usages
CREATE TABLE coupon_usages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id       UUID NOT NULL REFERENCES coupons(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  order_id        UUID UNIQUE NOT NULL REFERENCES orders(id),
  discount_amount DECIMAL(15,2) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- cashback_rules
CREATE TABLE cashback_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR(100) NOT NULL,
  cashback_type     cashback_type NOT NULL,
  value             DECIMAL(15,2) NOT NULL,
  min_order_amount  DECIMAL(15,2) NOT NULL DEFAULT 0,
  game_id           UUID REFERENCES games(id),
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- affiliates
CREATE TABLE affiliates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID UNIQUE NOT NULL REFERENCES users(id),
  referral_code     VARCHAR(20) UNIQUE NOT NULL,
  commission_rate   DECIMAL(5,2) NOT NULL DEFAULT 2.00,
  total_referrals   INT NOT NULL DEFAULT 0,
  total_earnings    DECIMAL(15,2) NOT NULL DEFAULT 0,
  pending_earnings  DECIMAL(15,2) NOT NULL DEFAULT 0,
  status            affiliate_status NOT NULL DEFAULT 'ACTIVE',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- affiliate_commissions
CREATE TABLE affiliate_commissions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id      UUID NOT NULL REFERENCES affiliates(id),
  referred_user_id  UUID NOT NULL REFERENCES users(id),
  order_id          UUID NOT NULL REFERENCES orders(id),
  commission_amount DECIMAL(15,2) NOT NULL,
  status            commission_status NOT NULL DEFAULT 'PENDING',
  paid_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- notifications
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  type        VARCHAR(100) NOT NULL,
  title       VARCHAR(200) NOT NULL,
  body        TEXT NOT NULL,
  channel     notification_channel NOT NULL,
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  metadata    JSONB DEFAULT '{}',
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notif_user_id ON notifications(user_id, is_read);

-- audit_logs
CREATE TABLE audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id),
  action        VARCHAR(100) NOT NULL,
  entity_type   VARCHAR(50),
  entity_id     UUID,
  old_values    JSONB,
  new_values    JSONB,
  ip_address    INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_created_at ON audit_logs(created_at DESC);

-- resellers
CREATE TABLE resellers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID UNIQUE NOT NULL REFERENCES users(id),
  company_name    VARCHAR(200) NOT NULL,
  discount_rate   DECIMAL(5,2) NOT NULL DEFAULT 5.00,
  credit_limit    DECIMAL(15,2) NOT NULL DEFAULT 0,
  credit_used     DECIMAL(15,2) NOT NULL DEFAULT 0,
  status          reseller_status NOT NULL DEFAULT 'PENDING',
  approved_by     UUID REFERENCES users(id),
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Folder Structure

```
pixelpay/                               # Monorepo root
├── apps/
│   ├── web/                            # Next.js 14 frontend
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   │   ├── login/page.tsx
│   │   │   │   ├── register/page.tsx
│   │   │   │   └── forgot-password/page.tsx
│   │   │   ├── (dashboard)/
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── page.tsx            # Home / game catalog
│   │   │   │   ├── wallet/page.tsx
│   │   │   │   ├── orders/page.tsx
│   │   │   │   ├── orders/[id]/page.tsx
│   │   │   │   ├── profile/page.tsx
│   │   │   │   └── affiliate/page.tsx
│   │   │   ├── admin/
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── page.tsx            # Admin overview
│   │   │   │   ├── users/page.tsx
│   │   │   │   ├── orders/page.tsx
│   │   │   │   ├── games/page.tsx
│   │   │   │   ├── providers/page.tsx
│   │   │   │   ├── coupons/page.tsx
│   │   │   │   ├── resellers/page.tsx
│   │   │   │   └── analytics/page.tsx
│   │   │   ├── games/
│   │   │   │   └── [slug]/page.tsx
│   │   │   ├── layout.tsx
│   │   │   └── globals.css
│   │   ├── components/
│   │   │   ├── ui/                     # shadcn/ui primitives
│   │   │   ├── auth/
│   │   │   ├── games/
│   │   │   ├── orders/
│   │   │   ├── wallet/
│   │   │   └── admin/
│   │   ├── lib/
│   │   │   ├── api-client.ts           # Typed fetch wrapper
│   │   │   ├── auth.ts                 # NextAuth config
│   │   │   ├── websocket.ts
│   │   │   └── utils.ts
│   │   ├── hooks/
│   │   ├── stores/                     # Zustand stores
│   │   ├── types/
│   │   ├── next.config.js
│   │   ├── tailwind.config.ts
│   │   └── package.json
│   │
│   └── api/                            # NestJS backend
│       ├── src/
│       │   ├── main.ts                 # Bootstrap
│       │   ├── app.module.ts
│       │   ├── auth/
│       │   │   ├── auth.module.ts
│       │   │   ├── auth.controller.ts
│       │   │   ├── auth.service.ts
│       │   │   ├── strategies/
│       │   │   │   ├── jwt.strategy.ts
│       │   │   │   └── local.strategy.ts
│       │   │   ├── guards/
│       │   │   │   ├── jwt-auth.guard.ts
│       │   │   │   └── roles.guard.ts
│       │   │   ├── decorators/
│       │   │   │   ├── current-user.decorator.ts
│       │   │   │   └── roles.decorator.ts
│       │   │   └── dto/
│       │   ├── users/
│       │   │   ├── users.module.ts
│       │   │   ├── users.controller.ts
│       │   │   ├── users.service.ts
│       │   │   └── dto/
│       │   ├── wallet/
│       │   │   ├── wallet.module.ts
│       │   │   ├── wallet.controller.ts
│       │   │   ├── wallet.service.ts
│       │   │   └── dto/
│       │   ├── games/
│       │   │   ├── games.module.ts
│       │   │   ├── games.controller.ts
│       │   │   ├── games.service.ts
│       │   │   └── dto/
│       │   ├── orders/
│       │   │   ├── orders.module.ts
│       │   │   ├── orders.controller.ts
│       │   │   ├── orders.service.ts
│       │   │   ├── orders.processor.ts  # BullMQ processor
│       │   │   └── dto/
│       │   ├── payments/
│       │   │   ├── payments.module.ts
│       │   │   ├── payments.controller.ts
│       │   │   ├── payments.service.ts
│       │   │   ├── payments.processor.ts
│       │   │   └── dto/
│       │   ├── providers/
│       │   │   ├── providers.module.ts
│       │   │   ├── providers.service.ts
│       │   │   ├── providers.controller.ts  # Admin only
│       │   │   ├── adapters/
│       │   │   │   ├── provider.interface.ts
│       │   │   │   ├── unipin.adapter.ts
│       │   │   │   ├── smileone.adapter.ts
│       │   │   │   └── provider.factory.ts
│       │   │   └── dto/
│       │   ├── coupons/
│       │   │   ├── coupons.module.ts
│       │   │   ├── coupons.controller.ts
│       │   │   ├── coupons.service.ts
│       │   │   └── dto/
│       │   ├── cashback/
│       │   │   ├── cashback.module.ts
│       │   │   └── cashback.service.ts
│       │   ├── affiliates/
│       │   │   ├── affiliates.module.ts
│       │   │   ├── affiliates.controller.ts
│       │   │   ├── affiliates.service.ts
│       │   │   └── dto/
│       │   ├── notifications/
│       │   │   ├── notifications.module.ts
│       │   │   ├── notifications.service.ts
│       │   │   ├── notifications.processor.ts
│       │   │   └── templates/
│       │   ├── audit/
│       │   │   ├── audit.module.ts
│       │   │   ├── audit.service.ts
│       │   │   └── audit.interceptor.ts
│       │   ├── analytics/
│       │   │   ├── analytics.module.ts
│       │   │   ├── analytics.controller.ts
│       │   │   └── analytics.service.ts
│       │   ├── resellers/
│       │   │   ├── resellers.module.ts
│       │   │   ├── resellers.controller.ts
│       │   │   └── resellers.service.ts
│       │   ├── admin/
│       │   │   ├── admin.module.ts
│       │   │   └── admin.controller.ts
│       │   ├── common/
│       │   │   ├── filters/
│       │   │   │   └── all-exceptions.filter.ts
│       │   │   ├── interceptors/
│       │   │   │   └── response.interceptor.ts
│       │   │   ├── pipes/
│       │   │   │   └── validation.pipe.ts
│       │   │   ├── decorators/
│       │   │   └── utils/
│       │   │       ├── order-number.ts
│       │   │       └── crypto.ts
│       │   ├── config/
│       │   │   ├── app.config.ts
│       │   │   ├── database.config.ts
│       │   │   ├── redis.config.ts
│       │   │   └── jwt.config.ts
│       │   └── prisma/
│       │       ├── prisma.module.ts
│       │       └── prisma.service.ts
│       ├── test/
│       │   ├── auth.e2e-spec.ts
│       │   ├── orders.e2e-spec.ts
│       │   └── jest-e2e.json
│       ├── prisma/
│       │   ├── schema.prisma
│       │   ├── migrations/
│       │   └── seed.ts
│       └── package.json
│
├── packages/
│   └── shared/                         # Shared TypeScript types
│       ├── src/
│       │   ├── types/
│       │   │   ├── order.types.ts
│       │   │   ├── user.types.ts
│       │   │   └── payment.types.ts
│       │   └── index.ts
│       └── package.json
│
├── infrastructure/
│   ├── nginx/
│   │   ├── nginx.conf
│   │   └── conf.d/
│   │       └── default.conf
│   ├── docker/
│   │   ├── Dockerfile.api
│   │   ├── Dockerfile.web
│   │   └── Dockerfile.worker
│   └── scripts/
│       ├── deploy.sh
│       └── db-backup.sh
│
├── docs/
│   └── superpowers/
│       └── plans/
│           ├── 2026-06-21-pixelpay-blueprint.md         ← this file
│           ├── 2026-06-21-pixelpay-phase-1-foundation.md
│           ├── 2026-06-21-pixelpay-phase-2-wallet-payments.md
│           ├── 2026-06-21-pixelpay-phase-3-topup-engine.md
│           ├── 2026-06-21-pixelpay-phase-4-promotions-affiliates.md
│           ├── 2026-06-21-pixelpay-phase-5-notifications-audit.md
│           ├── 2026-06-21-pixelpay-phase-6-admin-analytics.md
│           ├── 2026-06-21-pixelpay-phase-7-frontend.md
│           └── 2026-06-21-pixelpay-phase-8-devops.md
│
├── .env.example
├── docker-compose.yml
├── docker-compose.prod.yml
├── turbo.json                          # Turborepo
└── package.json
```

---

## API Endpoint Contracts

All endpoints are prefixed `/api/v1`. Authentication uses Bearer JWT unless noted.

### Auth (`/auth`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | Public | Register new user |
| POST | `/auth/login` | Public | Login, returns access + refresh tokens |
| POST | `/auth/refresh` | Public | Refresh access token |
| POST | `/auth/logout` | JWT | Revoke refresh token |
| POST | `/auth/verify-email` | Public | Verify email with OTP |
| POST | `/auth/resend-verification` | Public | Resend verification email |
| POST | `/auth/forgot-password` | Public | Request password reset |
| POST | `/auth/reset-password` | Public | Reset password with token |
| GET | `/auth/me` | JWT | Get current user |

### Users (`/users`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/users/profile` | JWT | Get own profile |
| PATCH | `/users/profile` | JWT | Update display name, avatar |
| PUT | `/users/change-password` | JWT | Change password |
| GET | `/users/referrals` | JWT | List referrals |

### Wallet (`/wallet`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/wallet` | JWT | Get wallet balance |
| GET | `/wallet/transactions` | JWT | Transaction history (paginated) |

### Payments (`/payments`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/payments/promptpay` | JWT | Create PromptPay QR deposit |
| GET | `/payments/:id` | JWT | Get payment status |
| POST | `/payments/webhook` | HMAC | Payment gateway webhook |

### Games (`/games`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/games` | Public | List active games |
| GET | `/games/:slug` | Public | Get game details |
| GET | `/games/:slug/products` | Public | List products for a game |

### Orders (`/orders`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/orders` | JWT | Create order |
| GET | `/orders` | JWT | List own orders (paginated) |
| GET | `/orders/:id` | JWT | Get order details |
| POST | `/orders/:id/cancel` | JWT | Cancel pending order |

### Coupons (`/coupons`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/coupons/validate` | JWT | Validate coupon for order |

### Affiliates (`/affiliates`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/affiliates/dashboard` | JWT | Affiliate stats |
| GET | `/affiliates/commissions` | JWT | Commission history |
| POST | `/affiliates/withdraw` | JWT | Request commission payout |

### Notifications (`/notifications`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/notifications` | JWT | List notifications (paginated) |
| PATCH | `/notifications/:id/read` | JWT | Mark as read |
| PATCH | `/notifications/read-all` | JWT | Mark all as read |

### Admin (`/admin`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/admin/stats` | ADMIN | Dashboard KPIs |
| GET | `/admin/users` | ADMIN | List users |
| GET | `/admin/users/:id` | ADMIN | User detail |
| PATCH | `/admin/users/:id` | ADMIN | Update user (ban, role) |
| GET | `/admin/orders` | ADMIN | All orders |
| PATCH | `/admin/orders/:id` | ADMIN | Manual status override |
| POST | `/admin/orders/:id/retry` | ADMIN | Force retry failed order |
| GET | `/admin/games` | ADMIN | Manage games |
| POST | `/admin/games` | ADMIN | Create game |
| PATCH | `/admin/games/:id` | ADMIN | Update game |
| GET | `/admin/providers` | ADMIN | List providers |
| POST | `/admin/providers` | ADMIN | Add provider |
| PATCH | `/admin/providers/:id` | ADMIN | Update provider |
| GET | `/admin/coupons` | ADMIN | List coupons |
| POST | `/admin/coupons` | ADMIN | Create coupon |
| PATCH | `/admin/coupons/:id` | ADMIN | Update coupon |
| GET | `/admin/resellers` | ADMIN | Manage resellers |
| PATCH | `/admin/resellers/:id/approve` | ADMIN | Approve reseller |
| GET | `/admin/audit-logs` | ADMIN | View audit trail |
| GET | `/admin/analytics/revenue` | ADMIN | Revenue analytics |
| GET | `/admin/analytics/orders` | ADMIN | Order analytics |
| GET | `/admin/analytics/users` | ADMIN | User growth analytics |

### Reseller API (`/reseller`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/reseller/products` | RESELLER | Browse products with reseller pricing |
| POST | `/reseller/orders` | RESELLER | Place order via API |
| GET | `/reseller/orders` | RESELLER | List own orders |
| GET | `/reseller/balance` | RESELLER | Credit balance |

---

## Infrastructure Architecture

### Docker Compose (Development)

```mermaid
graph LR
    subgraph compose["docker-compose.yml"]
        WEB["web:3001\nNext.js"]
        API["api:3000\nNestJS"]
        WORKER["worker\nBullMQ"]
        PG["postgres:5432\nPostgreSQL 16"]
        REDIS["redis:6379\nRedis 7"]
        NGINX["nginx:80/443\nReverse Proxy"]
    end

    NGINX --> WEB
    NGINX --> API
    API --> PG
    API --> REDIS
    WORKER --> PG
    WORKER --> REDIS
```

### Production Deployment (VPS / Cloud)

```mermaid
graph TB
    subgraph CF["Cloudflare"]
        DNS["DNS + CDN\n+ WAF"]
    end

    subgraph VPS["VPS / Docker Swarm"]
        NGINX["Nginx\n(Let's Encrypt TLS)"]
        subgraph APP_TIER["Application Tier"]
            API1["NestJS API\n(replica 1)"]
            API2["NestJS API\n(replica 2)"]
            WEB1["Next.js Web\n(replica 1)"]
        end
        subgraph WORKER_TIER["Worker Tier"]
            TW["Topup Worker\n(2x)"]
            NW["Notification Worker"]
            PW["Payment Poller"]
        end
    end

    subgraph DATA_TIER["Data Tier (Managed or self-hosted)"]
        PG_PRIMARY["PostgreSQL Primary"]
        PG_REPLICA["PostgreSQL Replica\n(read)"]
        REDIS_CLUSTER["Redis Sentinel\nor Cluster"]
        MINIO["MinIO / S3"]
    end

    DNS --> NGINX
    NGINX --> API1
    NGINX --> API2
    NGINX --> WEB1
    API1 --> PG_PRIMARY
    API2 --> PG_PRIMARY
    API1 --> PG_REPLICA
    TW --> PG_PRIMARY
    TW --> REDIS_CLUSTER
    API1 --> REDIS_CLUSTER
```

---

## Security Checklist

### Authentication & Authorization
- [ ] Passwords hashed with bcrypt (cost factor 12)
- [ ] JWT access tokens expire in 15 minutes
- [ ] Refresh tokens stored in HttpOnly, Secure cookies (not localStorage)
- [ ] Refresh token rotation on every use
- [ ] Refresh token family invalidation on reuse detection (token theft prevention)
- [ ] Email verification required before first order
- [ ] Role-based access control (USER / ADMIN / RESELLER) enforced on every route
- [ ] Rate limit on login (5 attempts per 15 min per IP)
- [ ] Rate limit on register (3 per hour per IP)
- [ ] CSRF protection on state-changing routes

### API Security
- [ ] All inputs validated with class-validator DTOs
- [ ] Global ValidationPipe with whitelist:true, forbidNonWhitelisted:true
- [ ] No user-controlled SQL (Prisma parameterized queries only)
- [ ] Helmet.js headers (CSP, HSTS, X-Frame-Options)
- [ ] CORS restricted to known origins
- [ ] Request size limits (10MB default, lower for JSON endpoints)
- [ ] Payment webhook verified with HMAC signature
- [ ] Provider API keys encrypted at rest (AES-256-GCM) in database

### Data Protection
- [ ] Provider credentials stored encrypted (never plaintext)
- [ ] PII fields (phone, email) indexed with care; avoid over-logging
- [ ] Audit log on all admin actions and financial operations
- [ ] Wallet deduction and order creation in a single DB transaction
- [ ] Idempotency key on payment webhook to prevent double-credit

### Infrastructure
- [ ] PostgreSQL not exposed to internet (internal network only)
- [ ] Redis password-protected and on internal network
- [ ] TLS 1.2+ enforced at Nginx
- [ ] All secrets in environment variables, never committed to repo
- [ ] Docker images run as non-root user
- [ ] Dependency scanning in CI (npm audit / Snyk)
- [ ] Automated DB backups daily, tested monthly
- [ ] WAF in front of Nginx (Cloudflare recommended)

### Payments
- [ ] PromptPay QR generated server-side only
- [ ] Payment amounts validated server-side (never trust client-submitted amount)
- [ ] Wallet transactions wrapped in serializable DB transactions
- [ ] Double-spend prevention via locked_balance + idempotent debit

---

## Development Roadmap & Sprint Plan

Total estimated duration: **16 weeks (4 months)**

| Phase | Weeks | Deliverable |
|-------|-------|-------------|
| Phase 1 | 1–2 | Foundation: monorepo, DB, auth |
| Phase 2 | 3–4 | Wallet & PromptPay payments |
| Phase 3 | 5–7 | Game catalog, orders, topup engine, failover |
| Phase 4 | 8–9 | Coupons, cashback, affiliates |
| Phase 5 | 10 | Notifications & audit logging |
| Phase 6 | 11–12 | Admin dashboard & analytics |
| Phase 7 | 13–15 | Frontend (Next.js) |
| Phase 8 | 16 | DevOps, hardening, deployment |

### Sprint Breakdown (2-week sprints)

**Sprint 1 (Wk 1–2): Foundation**
- Monorepo scaffolding (Turborepo)
- Docker Compose (PostgreSQL + Redis + API + Web)
- Prisma schema + all migrations
- Auth module (register, login, JWT, refresh, email verify)
- Users module

**Sprint 2 (Wk 3–4): Money**
- Wallet module (balance, transactions, locks)
- PromptPay payment integration (QR creation, webhook, polling)
- Payment poller BullMQ worker

**Sprint 3 (Wk 5–6): Topup Core**
- Games catalog module
- Game products module
- Provider abstraction layer + 2 adapter implementations
- Orders module (create, debit wallet, enqueue)
- Topup BullMQ processor

**Sprint 4 (Wk 7): Resilience**
- Provider failover logic
- Retry with exponential backoff
- Dead letter queue + manual retry (admin)
- Order tracking WebSocket gateway

**Sprint 5 (Wk 8–9): Growth Engine**
- Coupons module
- Cashback engine
- Affiliate module + commission tracking

**Sprint 6 (Wk 10): Observability**
- Notification worker (email + SMS + in-app)
- Audit logging interceptor
- Structured logging (pino)

**Sprint 7 (Wk 11–12): Admin & Analytics**
- Admin REST endpoints
- Analytics aggregation queries
- Reseller management

**Sprint 8 (Wk 13–15): Frontend**
- Auth pages, game catalog, order flow
- Wallet top-up UI with QR
- Order tracking page (WebSocket)
- Admin dashboard (Next.js)

**Sprint 9 (Wk 16): Ship**
- Production Docker Compose
- CI/CD (GitHub Actions)
- Environment hardening
- Load testing (k6)
- Deployment runbook

---

## MVP-to-Production Scaling Strategy

### MVP (Month 1–2) — Single VPS, ~50 orders/day
- Single Docker Compose, all services on one server
- 1 topup worker, 1 notification worker
- No CDN — direct Nginx
- Manual DB backups
- 2GB RAM / 2 CPU VPS acceptable

### Growth (Month 3–6) — ~500 orders/day
- Separate database server (4-core, 8GB RAM PostgreSQL)
- Redis as separate container or Redis Cloud
- 2x API replicas behind Nginx upstream
- 2x topup workers for parallel processing
- Add read replica for analytics queries
- Add CDN (Cloudflare) for static assets
- Automated nightly backups to S3/Wasabi

### Scale (Month 6+) — ~5,000+ orders/day
- Docker Swarm or Kubernetes (k3s)
- Horizontal scaling: 4x API, 4x topup workers, 2x notification workers
- PostgreSQL with PgBouncer connection pooling
- Redis Sentinel or Cluster mode
- Dedicated analytics DB (read replica + materialized views)
- Separate worker service with auto-scaling rules
- APM: Sentry + Grafana + Prometheus
- Rate limiting enforced at Nginx + Redis
- Database query optimization: EXPLAIN ANALYZE on slow queries, proper indexes

### Caching Strategy (Redis)

| Data | TTL | Strategy |
|------|-----|----------|
| Game catalog | 5 minutes | Cache-aside |
| Game products | 2 minutes | Cache-aside |
| User profile | 30 seconds | Cache-aside, invalidate on update |
| Provider availability | 1 minute | Cache-aside |
| JWT blacklist | Until expiry | Set-based |
| Coupon validation | 10 seconds | Cache-aside |
| Analytics aggregates | 1 hour | Background refresh |

---

## Deployment Guide

### Prerequisites

```bash
# Required on host
docker >= 24.0
docker compose >= 2.20
git
```

### Environment Variables (`.env`)

```env
# App
NODE_ENV=production
APP_PORT=3000
APP_URL=https://pixelpay.th

# Database
DATABASE_URL=postgresql://pixelpay:secret@postgres:5432/pixelpay

# Redis
REDIS_URL=redis://:secret@redis:6379

# JWT
JWT_SECRET=<64-char-random>
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=<64-char-random>
JWT_REFRESH_EXPIRES_IN=7d

# Encryption (for provider API keys)
ENCRYPTION_KEY=<32-char-hex-key>

# Payment Gateway (GB Pay / 2C2P)
PAYMENT_GATEWAY_URL=https://api.gbprimepay.com
PAYMENT_GATEWAY_API_KEY=<key>
PAYMENT_GATEWAY_SECRET=<secret>
PAYMENT_WEBHOOK_SECRET=<hmac-secret>

# Email
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=<sendgrid-api-key>
SMTP_FROM=noreply@pixelpay.th

# SMS (Twilio)
TWILIO_ACCOUNT_SID=<sid>
TWILIO_AUTH_TOKEN=<token>
TWILIO_FROM=+66xxxxxxxxx

# S3 / MinIO
S3_ENDPOINT=https://s3.amazonaws.com
S3_BUCKET=pixelpay-assets
S3_ACCESS_KEY=<key>
S3_SECRET_KEY=<secret>

# Next.js
NEXT_PUBLIC_API_URL=https://pixelpay.th/api/v1
NEXT_PUBLIC_WS_URL=wss://pixelpay.th
```

### Deployment Steps

```bash
# 1. Clone and configure
git clone https://github.com/your-org/pixelpay.git
cd pixelpay
cp .env.example .env
# Edit .env with production values

# 2. Build images
docker compose -f docker-compose.prod.yml build

# 3. Run database migrations
docker compose -f docker-compose.prod.yml run --rm api npx prisma migrate deploy

# 4. Seed initial data (games, products, admin user)
docker compose -f docker-compose.prod.yml run --rm api npx ts-node prisma/seed.ts

# 5. Start all services
docker compose -f docker-compose.prod.yml up -d

# 6. Verify health
curl https://pixelpay.th/api/v1/health
```

### Health Check Endpoints

- `GET /api/v1/health` — API liveness
- `GET /api/v1/health/db` — Database connectivity
- `GET /api/v1/health/redis` — Redis connectivity
- `GET /api/v1/health/queues` — BullMQ queue status

---

*See individual phase plan files for step-by-step TDD implementation tasks.*
