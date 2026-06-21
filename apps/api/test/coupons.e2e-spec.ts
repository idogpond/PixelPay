import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest');
import { AppModule } from '../src/app.module';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Coupons (e2e)', () => {
  let app: NestFastifyApplication;
  let token: string;
  let prisma: PrismaService;

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

    prisma = module.get(PrismaService);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: `coupon+${Date.now()}@test.com`, password: 'Test1234!', displayName: 'Coupon' })
      .expect(201);
    token = res.body.data.accessToken;

    await prisma.coupon.create({
      data: {
        code: `TEST10-${Date.now()}`,
        discountType: 'PERCENTAGE',
        value: 10,
        minOrderAmount: 50,
        usageLimit: 100,
        userLimit: 1,
        isActive: true,
      },
    });
  });

  afterAll(() => app.close());

  it('POST /coupons/validate returns discount for valid coupon', async () => {
    const coupon = await prisma.coupon.findFirst({
      where: { code: { startsWith: 'TEST10-' } },
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/coupons/validate')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: coupon!.code, orderTotal: 100 })
      .expect(200);
    expect(res.body.data.discountAmount).toBe(10);
  });

  it('POST /coupons/validate returns 400 for below minimum order', async () => {
    const coupon = await prisma.coupon.findFirst({
      where: { code: { startsWith: 'TEST10-' } },
    });

    await request(app.getHttpServer())
      .post('/api/v1/coupons/validate')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: coupon!.code, orderTotal: 30 })
      .expect(400);
  });

  it('POST /coupons/validate returns 404 for unknown coupon', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/coupons/validate')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'INVALID', orderTotal: 100 })
      .expect(404);
  });
});
