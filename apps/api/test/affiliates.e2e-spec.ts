import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest');
import { AppModule } from '../src/app.module';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('Affiliates (e2e)', () => {
  let app: NestFastifyApplication;
  let token: string;

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

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: `aff+${Date.now()}@test.com`, password: 'Test1234!', displayName: 'Affiliate' });
    token = res.body.data.accessToken;
  });

  afterAll(() => app.close());

  it('GET /affiliates/dashboard returns stats', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/affiliates/dashboard')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.totalReferrals).toBe(0);
    expect(res.body.data.totalEarnings).toBeDefined();
    expect(res.body.data.pendingEarnings).toBeDefined();
  });

  it('GET /affiliates/commissions returns paginated list', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/affiliates/commissions')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toEqual([]);
    expect(res.body.data.total).toBe(0);
  });
});
