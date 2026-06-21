import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import * as bcrypt from 'bcrypt';

describe('Admin (e2e)', () => {
  let app: NestFastifyApplication;
  let adminToken: string;
  let userToken: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const prisma = module.get(PrismaService);

    // Create admin user directly in DB
    const passwordHash = await bcrypt.hash('Admin1234!', 12);
    const { customAlphabet } = await import('nanoid');
    const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 8);
    await prisma.user.upsert({
      where: { email: 'admin@pixelpay.test' },
      update: {},
      create: {
        email: 'admin@pixelpay.test',
        passwordHash,
        displayName: 'Admin',
        role: 'ADMIN',
        referralCode: nanoid(),
        wallet: { create: {} },
      },
    });

    const adminRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@pixelpay.test', password: 'Admin1234!' });
    adminToken = adminRes.body.data.accessToken;

    const userRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: `regular+${Date.now()}@test.com`, password: 'Test1234!', displayName: 'Regular' });
    userToken = userRes.body.data.accessToken;
  });

  afterAll(() => app.close());

  it('GET /admin/stats returns dashboard data (admin)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.data.totalUsers).toBeDefined();
    expect(res.body.data.totalOrders).toBeDefined();
  });

  it('GET /admin/stats returns 403 for regular user', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/stats')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });

  it('GET /admin/users returns paginated users', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.data.items.length).toBeGreaterThan(0);
    expect(res.body.data.items[0].passwordHash).toBeUndefined();
  });
});
