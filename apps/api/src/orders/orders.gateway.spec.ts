import { OrdersGateway } from './orders.gateway';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

describe('OrdersGateway', () => {
  it('emits order.status event to the correct room', () => {
    const gateway = new OrdersGateway(
      {} as JwtService,
      {} as ConfigService,
    );
    const mockServer = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
    gateway.server = mockServer as any;
    gateway.emitOrderStatus('user1', 'order1', 'COMPLETED');
    expect(mockServer.to).toHaveBeenCalledWith('user:user1');
    expect(mockServer.emit).toHaveBeenCalledWith('order.status', { orderId: 'order1', status: 'COMPLETED' });
  });
});
