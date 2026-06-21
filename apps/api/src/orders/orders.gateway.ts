import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({ namespace: '/orders', cors: { origin: '*' } })
export class OrdersGateway {
  @WebSocketServer()
  server!: Server;

  emitOrderStatus(userId: string, orderId: string, status: string) {
    this.server.to(`user:${userId}`).emit('order.status', { orderId, status });
  }
}
