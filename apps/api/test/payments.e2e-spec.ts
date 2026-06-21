import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest');
import { AppModule } from '../src/app.module';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('Payments (e2e)', () => {
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
      .send({
        email: `pay+${Date.now()}@test.com`,
        password: 'Test1234!',
        displayName: 'Payer',
      });
    token = res.body.data.accessToken;
  });

  afterAll(() => app.close());

  it('POST /payments/promptpay validates minimum amount', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/payments/promptpay')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 5 }) // below minimum 10
      .expect(400);
    expect(res.body.success).toBe(false);
  });

  it('GET /payments/:id returns 404 for unknown payment', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/payments/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
