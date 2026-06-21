# Phase 1: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the PixelPay monorepo, configure Docker, set up PostgreSQL + Redis, implement auth (register/login/JWT/refresh/email verification), and the users module.

**Architecture:** Turborepo monorepo with `apps/api` (NestJS) and `apps/web` (Next.js). All modules use Prisma for DB access. Auth uses JWT access tokens (15m) + HttpOnly refresh tokens (7d) with rotation.

**Tech Stack:** Node.js 20, NestJS 10, Prisma 5, PostgreSQL 16, Redis 7, Docker Compose, bcrypt, @nestjs/jwt, @nestjs/passport, passport-jwt, class-validator, nodemailer

## Global Constraints

- Node.js >= 20.0.0 LTS
- All TypeScript strict mode enabled
- All DTO classes use class-validator decorators — no manual validation
- Prisma is the only ORM — no raw SQL except in migrations
- All services must be injectable (no direct `new Service()` outside tests)
- `.env` values accessed only via `@nestjs/config` ConfigService
- Passwords: bcrypt with saltRounds=12
- JWT access token TTL: 15m; refresh token TTL: 7d
- All HTTP responses wrapped in `{ success, data, meta? }` shape

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `package.json` (root) | Create | Turborepo workspace root |
| `turbo.json` | Create | Pipeline definitions |
| `docker-compose.yml` | Create | Dev services: postgres, redis, api, web, nginx |
| `.env.example` | Create | All env var templates |
| `apps/api/package.json` | Create | NestJS dependencies |
| `apps/api/src/main.ts` | Create | Bootstrap with Fastify, global pipes, CORS |
| `apps/api/src/app.module.ts` | Create | Root module imports |
| `apps/api/src/prisma/prisma.service.ts` | Create | PrismaClient singleton |
| `apps/api/prisma/schema.prisma` | Create | Full schema (all 16 tables) |
| `apps/api/src/config/` | Create | app, database, redis, jwt config factories |
| `apps/api/src/common/interceptors/response.interceptor.ts` | Create | Wrap all responses |
| `apps/api/src/common/filters/http-exception.filter.ts` | Create | Uniform error shape |
| `apps/api/src/auth/auth.module.ts` | Create | Auth module |
| `apps/api/src/auth/auth.service.ts` | Create | register, login, refresh, logout, verify |
| `apps/api/src/auth/auth.controller.ts` | Create | Auth HTTP endpoints |
| `apps/api/src/auth/strategies/jwt.strategy.ts` | Create | JWT extraction + validation |
| `apps/api/src/auth/strategies/local.strategy.ts` | Create | Email+password validation |
| `apps/api/src/auth/guards/jwt-auth.guard.ts` | Create | JwtAuthGuard |
| `apps/api/src/auth/guards/roles.guard.ts` | Create | RolesGuard |
| `apps/api/src/auth/decorators/` | Create | CurrentUser, Roles decorators |
| `apps/api/src/auth/dto/` | Create | RegisterDto, LoginDto, RefreshDto, etc. |
| `apps/api/src/users/users.service.ts` | Create | findById, update, changePassword |
| `apps/api/src/users/users.controller.ts` | Create | /users/* routes |
| `apps/api/src/users/dto/` | Create | UpdateProfileDto, ChangePasswordDto |
| `apps/api/test/auth.e2e-spec.ts` | Create | Auth end-to-end tests |

---

### Task 1: Monorepo Scaffolding

**Files:**
- Create: `package.json`
- Create: `turbo.json`
- Create: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: Write root package.json**

```json
{
  "name": "pixelpay",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.4.0"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

- [ ] **Step 2: Write turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "lint": {}
  }
}
```

- [ ] **Step 3: Create .env.example**

```env
NODE_ENV=development
APP_PORT=3000
APP_URL=http://localhost:3000

DATABASE_URL=postgresql://pixelpay:pixelpay@localhost:5432/pixelpay

REDIS_URL=redis://localhost:6379

JWT_SECRET=change_me_64_chars_minimum_for_production_use_random_string
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=change_me_refresh_64_chars_minimum_random_string
JWT_REFRESH_EXPIRES_IN=7d

ENCRYPTION_KEY=0123456789abcdef0123456789abcdef

PAYMENT_GATEWAY_URL=https://api.gbprimepay.com
PAYMENT_GATEWAY_API_KEY=
PAYMENT_GATEWAY_SECRET=
PAYMENT_WEBHOOK_SECRET=

SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@pixelpay.local

TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM=

S3_ENDPOINT=http://localhost:9000
S3_BUCKET=pixelpay
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin

NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
NEXT_PUBLIC_WS_URL=ws://localhost:3000
```

- [ ] **Step 4: Commit scaffold**

```bash
git add package.json turbo.json .gitignore .env.example
git commit -m "chore: init turborepo monorepo scaffold"
```

---

### Task 2: Docker Compose (Development)

**Files:**
- Create: `docker-compose.yml`
- Create: `infrastructure/nginx/conf.d/default.conf`

- [ ] **Step 1: Write docker-compose.yml**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: pixelpay
      POSTGRES_PASSWORD: pixelpay
      POSTGRES_DB: pixelpay
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U pixelpay"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass pixelpay
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "pixelpay", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  api:
    build:
      context: .
      dockerfile: infrastructure/docker/Dockerfile.api.dev
    volumes:
      - ./apps/api:/app/apps/api
      - /app/apps/api/node_modules
    ports:
      - "3000:3000"
    env_file: .env
    environment:
      DATABASE_URL: postgresql://pixelpay:pixelpay@postgres:5432/pixelpay
      REDIS_URL: redis://:pixelpay@redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  web:
    build:
      context: .
      dockerfile: infrastructure/docker/Dockerfile.web.dev
    volumes:
      - ./apps/web:/app/apps/web
      - /app/apps/web/node_modules
    ports:
      - "3001:3001"
    env_file: .env
    depends_on:
      - api

volumes:
  postgres_data:
  redis_data:
```

- [ ] **Step 2: Write dev Dockerfiles**

`infrastructure/docker/Dockerfile.api.dev`:
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json turbo.json ./
COPY apps/api/package.json ./apps/api/
RUN npm install
COPY apps/api ./apps/api
WORKDIR /app/apps/api
CMD ["npm", "run", "start:dev"]
```

`infrastructure/docker/Dockerfile.web.dev`:
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json turbo.json ./
COPY apps/web/package.json ./apps/web/
RUN npm install
COPY apps/web ./apps/web
WORKDIR /app/apps/web
CMD ["npm", "run", "dev"]
```

- [ ] **Step 3: Verify services start**

```bash
docker compose up -d postgres redis
docker compose ps
```

Expected: postgres and redis show `healthy`

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml infrastructure/
git commit -m "chore: add Docker Compose dev environment"
```

---

### Task 3: NestJS App Scaffold + Prisma Schema

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/nest-cli.json`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Create: `apps/api/src/prisma/prisma.module.ts`
- Create: `apps/api/src/prisma/prisma.service.ts`
- Create: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Write apps/api/package.json**

```json
{
  "name": "@pixelpay/api",
  "version": "1.0.0",
  "scripts": {
    "start:dev": "nest start --watch",
    "start:debug": "nest start --debug --watch",
    "build": "nest build",
    "test": "jest",
    "test:e2e": "jest --config ./test/jest-e2e.json"
  },
  "dependencies": {
    "@nestjs/common": "^10.3.0",
    "@nestjs/core": "^10.3.0",
    "@nestjs/config": "^3.2.0",
    "@nestjs/platform-fastify": "^10.3.0",
    "@nestjs/jwt": "^10.2.0",
    "@nestjs/passport": "^10.0.3",
    "@nestjs/bullmq": "^10.1.1",
    "@nestjs/websockets": "^10.3.0",
    "@nestjs/platform-socket.io": "^10.3.0",
    "@nestjs/swagger": "^7.3.0",
    "@prisma/client": "^5.12.0",
    "passport": "^0.7.0",
    "passport-jwt": "^4.0.1",
    "passport-local": "^1.0.0",
    "bcrypt": "^5.1.1",
    "bullmq": "^5.7.0",
    "class-validator": "^0.14.1",
    "class-transformer": "^0.5.1",
    "nanoid": "^3.3.7",
    "nodemailer": "^6.9.13",
    "helmet": "^7.1.0",
    "ioredis": "^5.3.2",
    "pino": "^9.0.0",
    "dayjs": "^1.11.11"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.3.0",
    "@nestjs/testing": "^10.3.0",
    "@types/bcrypt": "^5.0.2",
    "@types/nodemailer": "^6.4.14",
    "@types/passport-jwt": "^4.0.1",
    "@types/passport-local": "^1.0.38",
    "prisma": "^5.12.0",
    "jest": "^29.7.0",
    "supertest": "^7.0.0",
    "ts-jest": "^29.1.2",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Write Prisma schema (full)**

`apps/api/prisma/schema.prisma` — copy the full schema from the blueprint `2026-06-21-pixelpay-blueprint.md` §Database Schema. Include all enums and 16 tables.

Key snippet to verify structure:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ... all enums and models from blueprint
```

- [ ] **Step 3: Run Prisma migration**

```bash
cd apps/api
npx prisma migrate dev --name init
```

Expected output: `Your database is now in sync with your schema.`

- [ ] **Step 4: Write PrismaService**

`apps/api/src/prisma/prisma.service.ts`:
```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}
```

`apps/api/src/prisma/prisma.module.ts`:
```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

- [ ] **Step 5: Write main.ts**

`apps/api/src/main.ts`:
```typescript
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from '@fastify/helmet';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true }),
  );

  const config = app.get(ConfigService);
  const port = config.get<number>('app.port', 3000);

  await app.register(helmet);

  app.enableCors({
    origin: config.get<string>('app.url'),
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  await app.listen(port, '0.0.0.0');
}
bootstrap();
```

- [ ] **Step 6: Write AppModule**

`apps/api/src/app.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import redisConfig from './config/redis.config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, jwtConfig, redisConfig],
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 7: Write config factories**

`apps/api/src/config/app.config.ts`:
```typescript
import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: parseInt(process.env.APP_PORT ?? '3000', 10),
  url: process.env.APP_URL ?? 'http://localhost:3000',
  encryptionKey: process.env.ENCRYPTION_KEY,
}));
```

`apps/api/src/config/jwt.config.ts`:
```typescript
import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET,
  expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
  refreshSecret: process.env.JWT_REFRESH_SECRET,
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
}));
```

`apps/api/src/config/redis.config.ts`:
```typescript
import { registerAs } from '@nestjs/config';

export default registerAs('redis', () => ({
  url: process.env.REDIS_URL ?? 'redis://localhost:6379',
}));
```

- [ ] **Step 8: Write response interceptor**

`apps/api/src/common/interceptors/response.interceptor.ts`:
```typescript
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data) => ({
        success: true,
        data: data ?? null,
      })),
    );
  }
}
```

- [ ] **Step 9: Write HTTP exception filter**

`apps/api/src/common/filters/http-exception.filter.ts`:
```typescript
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = exception instanceof HttpException
      ? exception.getResponse()
      : 'Internal server error';

    response.status(status).send({
      success: false,
      error: typeof message === 'string' ? { message } : message,
    });
  }
}
```

- [ ] **Step 10: Verify app starts**

```bash
cd apps/api
npm install
npm run start:dev
```

Expected: `Nest application successfully started on port 3000`

- [ ] **Step 11: Commit**

```bash
git add apps/api/
git commit -m "feat: scaffold NestJS app with Prisma, full schema, and global pipes"
```

---

### Task 4: Auth Module — Register & Login

**Files:**
- Create: `apps/api/src/auth/dto/register.dto.ts`
- Create: `apps/api/src/auth/dto/login.dto.ts`
- Create: `apps/api/src/auth/auth.service.ts`
- Create: `apps/api/src/auth/auth.controller.ts`
- Create: `apps/api/src/auth/auth.module.ts`
- Create: `apps/api/src/auth/strategies/local.strategy.ts`
- Create: `apps/api/src/auth/strategies/jwt.strategy.ts`
- Create: `apps/api/src/auth/guards/jwt-auth.guard.ts`
- Create: `apps/api/src/auth/guards/roles.guard.ts`
- Create: `apps/api/src/auth/decorators/current-user.decorator.ts`
- Create: `apps/api/src/auth/decorators/roles.decorator.ts`
- Test: `apps/api/test/auth.e2e-spec.ts`

**Interfaces:**
- Produces: `AuthService.register(dto)`, `AuthService.login(email, password)`, `AuthService.refreshTokens(refreshToken)`, `AuthService.logout(userId, refreshToken)`
- Produces: `JwtAuthGuard`, `RolesGuard`, `@CurrentUser()`, `@Roles(...)`

- [ ] **Step 1: Write failing e2e test — register**

`apps/api/test/auth.e2e-spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(() => app.close());

  const user = {
    email: `test+${Date.now()}@pixelpay.test`,
    password: 'Test1234!',
    displayName: 'Test User',
  };

  describe('POST /api/v1/auth/register', () => {
    it('registers a new user and returns tokens', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(user)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.user.email).toBe(user.email);
    });

    it('rejects duplicate email', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(user)
        .expect(409);
    });

    it('rejects weak password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ ...user, email: 'other@test.com', password: '123' })
        .expect(400);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('returns tokens for valid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(200);

      expect(res.body.data.accessToken).toBeDefined();
    });

    it('returns 401 for wrong password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'wrongpass' })
        .expect(401);
    });
  });
});
```

- [ ] **Step 2: Run test — expect fail**

```bash
cd apps/api
npm run test:e2e -- --testPathPattern=auth
```

Expected: FAIL — `Cannot POST /api/v1/auth/register`

- [ ] **Step 3: Write RegisterDto**

`apps/api/src/auth/dto/register.dto.ts`:
```typescript
import { IsEmail, IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'password must contain uppercase, lowercase and number',
  })
  password: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  displayName: string;
}
```

`apps/api/src/auth/dto/login.dto.ts`:
```typescript
import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}
```

- [ ] **Step 4: Write AuthService**

`apps/api/src/auth/auth.service.ts`:
```typescript
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { customAlphabet } from 'nanoid';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';

const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 8);

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const referralCode = nanoid();

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        displayName: dto.displayName,
        referralCode,
        wallet: { create: { balance: 0, lockedBalance: 0 } },
      },
      select: { id: true, email: true, displayName: true, role: true, referralCode: true },
    });

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    return { user, ...tokens };
  }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');
    if (!user.isActive) throw new UnauthorizedException('Account is disabled');
    return user;
  }

  async login(user: { id: string; email: string; role: string }) {
    const tokens = await this.generateTokens(user.id, user.email, user.role);
    return {
      user: { id: user.id, email: user.email, role: user.role },
      ...tokens,
    };
  }

  async refreshTokens(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return this.generateTokens(user.id, user.email, user.role);
  }

  private async generateTokens(userId: string, email: string, role: string) {
    const payload = { sub: userId, email, role };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.config.get('jwt.secret'),
        expiresIn: this.config.get('jwt.expiresIn'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.config.get('jwt.refreshSecret'),
        expiresIn: this.config.get('jwt.refreshExpiresIn'),
      }),
    ]);
    return { accessToken, refreshToken };
  }
}
```

- [ ] **Step 5: Write JWT strategy**

`apps/api/src/auth/strategies/jwt.strategy.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.secret'),
    });
  }

  async validate(payload: { sub: string; email: string; role: string }) {
    return { id: payload.sub, email: payload.email, role: payload.role };
  }
}
```

`apps/api/src/auth/strategies/local.strategy.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from '../auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({ usernameField: 'email' });
  }

  async validate(email: string, password: string) {
    return this.authService.validateUser(email, password);
  }
}
```

- [ ] **Step 6: Write guards and decorators**

`apps/api/src/auth/guards/jwt-auth.guard.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

`apps/api/src/auth/guards/roles.guard.ts`:
```typescript
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required) return true;
    const { user } = ctx.switchToHttp().getRequest();
    return required.includes(user.role);
  }
}
```

`apps/api/src/auth/decorators/current-user.decorator.ts`:
```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().user,
);
```

`apps/api/src/auth/decorators/roles.decorator.ts`:
```typescript
import { SetMetadata } from '@nestjs/common';
export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
```

- [ ] **Step 7: Write AuthController**

`apps/api/src/auth/auth.controller.ts`:
```typescript
import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @UseGuards(AuthGuard('local'))
  @Post('login')
  login(@Request() req: any) {
    return this.auth.login(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: any) {
    return user;
  }
}
```

- [ ] **Step 8: Write AuthModule**

`apps/api/src/auth/auth.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { RolesGuard } from './guards/roles.guard';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}),
  ],
  providers: [AuthService, JwtStrategy, LocalStrategy, RolesGuard],
  controllers: [AuthController],
  exports: [AuthService, RolesGuard],
})
export class AuthModule {}
```

- [ ] **Step 9: Run tests — expect pass**

```bash
cd apps/api
npm run test:e2e -- --testPathPattern=auth
```

Expected: All 5 tests PASS

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/auth/
git commit -m "feat: implement auth module — register, login, JWT strategy"
```

---

### Task 5: Users Module

**Files:**
- Create: `apps/api/src/users/users.service.ts`
- Create: `apps/api/src/users/users.controller.ts`
- Create: `apps/api/src/users/users.module.ts`
- Create: `apps/api/src/users/dto/update-profile.dto.ts`
- Create: `apps/api/src/users/dto/change-password.dto.ts`

**Interfaces:**
- Consumes: `PrismaService`, `JwtAuthGuard`, `@CurrentUser()`
- Produces: `UsersService.findById(id)`, `UsersService.updateProfile(id, dto)`, `UsersService.changePassword(id, dto)`

- [ ] **Step 1: Write failing test**

`apps/api/test/users.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Users (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: `user+${Date.now()}@test.com`, password: 'Test1234!', displayName: 'User' });
    accessToken = res.body.data.accessToken;
  });

  afterAll(() => app.close());

  it('GET /api/v1/users/profile returns profile', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/users/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.data.email).toBeDefined();
  });

  it('PATCH /api/v1/users/profile updates display name', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/v1/users/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ displayName: 'Updated Name' })
      .expect(200);
    expect(res.body.data.displayName).toBe('Updated Name');
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
npm run test:e2e -- --testPathPattern=users
```

Expected: FAIL — `Cannot GET /api/v1/users/profile`

- [ ] **Step 3: Implement UsersService**

`apps/api/src/users/users.service.ts`:
```typescript
import { BadRequestException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findById(id: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: {
        id: true, email: true, phone: true, displayName: true,
        avatarUrl: true, role: true, isVerified: true, referralCode: true,
        createdAt: true,
      },
    });
  }

  async updateProfile(id: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: { id: true, email: true, displayName: true, avatarUrl: true },
    });
  }

  async changePassword(id: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) throw new BadRequestException('Current password is incorrect');
    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    return { message: 'Password changed successfully' };
  }
}
```

- [ ] **Step 4: Write DTOs**

`apps/api/src/users/dto/update-profile.dto.ts`:
```typescript
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  displayName?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
```

`apps/api/src/users/dto/change-password.dto.ts`:
```typescript
import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
  newPassword: string;
}
```

- [ ] **Step 5: Write UsersController and UsersModule**

`apps/api/src/users/users.controller.ts`:
```typescript
import { Body, Controller, Get, Patch, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('profile')
  profile(@CurrentUser() user: { id: string }) {
    return this.users.findById(user.id);
  }

  @Patch('profile')
  updateProfile(@CurrentUser() user: { id: string }, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.id, dto);
  }

  @Put('change-password')
  changePassword(@CurrentUser() user: { id: string }, @Body() dto: ChangePasswordDto) {
    return this.users.changePassword(user.id, dto);
  }
}
```

`apps/api/src/users/users.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

@Module({
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
```

- [ ] **Step 6: Run tests — expect pass**

```bash
npm run test:e2e -- --testPathPattern=users
```

Expected: 2 tests PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/users/
git commit -m "feat: implement users module — profile, update, change-password"
```

---

### Phase 1 Completion Checklist

- [ ] Monorepo with Turborepo configured
- [ ] Docker Compose runs PostgreSQL + Redis
- [ ] Prisma schema with all 16 tables migrated
- [ ] NestJS starts with Fastify adapter, global pipes, interceptor, filter
- [ ] Auth: register, login, JWT guard all tested and passing
- [ ] Users: profile, update, change-password tested and passing
- [ ] `.env.example` documents all variables
