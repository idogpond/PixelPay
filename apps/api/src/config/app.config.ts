import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: parseInt(process.env.APP_PORT ?? '3000', 10),
  url: process.env.APP_URL ?? 'http://localhost:3000',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3001',
  encryptionKey: process.env.ENCRYPTION_KEY,
}));
