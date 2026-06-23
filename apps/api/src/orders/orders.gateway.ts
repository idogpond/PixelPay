import { WebSocketGateway, WebSocketServer, SubscribeMessage, ConnectedSocket } from '@nestjs/websockets';
import { UnauthorizedException } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@WebSocketGateway({ namespace: '/orders', cors: { origin: process.env.FRONTEND_URL ?? 'http://localhost:3001' } })
export class OrdersGateway {
  @WebSocketServer()
  server!: Server;

  constructor(
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  @SubscribeMessage('join')
  async handleJoin(@ConnectedSocket() client: Socket) {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect();
      throw new UnauthorizedException('No token provided');
    }

    try {
      const payload = await this.jwtService.verifyAsync<{ sub: string; email: string; role: string }>(
        token,
        { secret: this.config.get<string>('jwt.secret') },
      );
      const room = `user:${payload.sub}`;
      await client.join(room);
    } catch {
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect();
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  emitOrderStatus(userId: string, orderId: string, status: string) {
    this.server.to(`user:${userId}`).emit('order.status', { orderId, status });
  }
}
