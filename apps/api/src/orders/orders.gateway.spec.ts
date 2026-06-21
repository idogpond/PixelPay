import { OrdersGateway } from './orders.gateway';

describe('OrdersGateway', () => {
  it('emits order.status event to the correct room', () => {
    const gateway = new OrdersGateway();
    const mockServer = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
    gateway.server = mockServer as any;
    gateway.emitOrderStatus('user1', 'order1', 'COMPLETED');
    expect(mockServer.to).toHaveBeenCalledWith('user:user1');
    expect(mockServer.emit).toHaveBeenCalledWith('order.status', { orderId: 'order1', status: 'COMPLETED' });
  });
});
