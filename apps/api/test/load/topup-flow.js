import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 20 },  // Ramp up to 20 users
    { duration: '1m', target: 20 },   // Steady state
    { duration: '30s', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests under 2s
    http_req_failed: ['rate<0.01'],    // Less than 1% failure rate
  },
};

const BASE = __ENV.API_URL || 'http://localhost:3000/api/v1';

export function setup() {
  const res = http.post(`${BASE}/auth/register`, JSON.stringify({
    email: `load_${Date.now()}@test.com`,
    password: 'Test1234!',
    displayName: 'Load Test',
  }), { headers: { 'Content-Type': 'application/json' } });

  return { token: res.json('data.accessToken') };
}

export default function (data) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${data.token}`,
  };

  // Test game catalog (read-heavy)
  const gamesRes = http.get(`${BASE}/games`, { headers });
  check(gamesRes, { 'games 200': (r) => r.status === 200 });

  // Test wallet balance
  const walletRes = http.get(`${BASE}/wallet`, { headers });
  check(walletRes, { 'wallet 200': (r) => r.status === 200 });

  // Test order list
  const ordersRes = http.get(`${BASE}/orders`, { headers });
  check(ordersRes, { 'orders 200': (r) => r.status === 200 });

  sleep(1);
}
