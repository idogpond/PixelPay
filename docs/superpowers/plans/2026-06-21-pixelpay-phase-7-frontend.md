# Phase 7: Next.js Frontend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Build the complete Next.js 14 frontend: auth pages, game catalog, order flow (game UID + QR/wallet payment), order tracking with WebSocket, wallet top-up, user dashboard, and admin dashboard.

**Architecture:** Next.js App Router with React Server Components for data-heavy pages and Client Components for interactive UI. State management via Zustand for auth/cart. API calls via a typed `api-client.ts` wrapper. WebSocket via socket.io-client for real-time order status.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, shadcn/ui, Zustand, socket.io-client, react-hook-form, zod, @tanstack/react-query

## Global Constraints

- All pages that require auth use Next.js middleware for redirect
- No sensitive data in localStorage — auth tokens in memory (Zustand) + HttpOnly cookies for refresh
- All forms use `react-hook-form` + `zod` validation — no manual validation
- Monetary values always displayed with `.toLocaleString('th-TH')` and "฿" prefix
- All images use `next/image` with explicit width/height
- Admin pages at `/admin/*` — redirect non-admin users at middleware level

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/web/package.json` | Create | Next.js deps |
| `apps/web/app/layout.tsx` | Create | Root layout, providers |
| `apps/web/app/(auth)/login/page.tsx` | Create | Login form |
| `apps/web/app/(auth)/register/page.tsx` | Create | Register form |
| `apps/web/app/(dashboard)/page.tsx` | Create | Game catalog (home) |
| `apps/web/app/(dashboard)/games/[slug]/page.tsx` | Create | Game detail + product selection |
| `apps/web/app/(dashboard)/orders/page.tsx` | Create | Order history |
| `apps/web/app/(dashboard)/orders/[id]/page.tsx` | Create | Order detail + real-time tracking |
| `apps/web/app/(dashboard)/wallet/page.tsx` | Create | Wallet balance + top-up + transactions |
| `apps/web/app/(dashboard)/profile/page.tsx` | Create | Profile + password change |
| `apps/web/app/(dashboard)/affiliate/page.tsx` | Create | Affiliate dashboard |
| `apps/web/app/admin/page.tsx` | Create | Admin stats dashboard |
| `apps/web/app/admin/orders/page.tsx` | Create | Admin order management |
| `apps/web/app/admin/users/page.tsx` | Create | Admin user management |
| `apps/web/lib/api-client.ts` | Create | Typed API fetch wrapper |
| `apps/web/lib/auth.ts` | Create | Auth helpers |
| `apps/web/lib/websocket.ts` | Create | Socket.io client singleton |
| `apps/web/stores/auth.store.ts` | Create | Zustand auth store |
| `apps/web/stores/cart.store.ts` | Create | Selected product store |
| `apps/web/middleware.ts` | Create | Route protection middleware |
| `apps/web/components/games/GameCard.tsx` | Create | Game tile |
| `apps/web/components/games/ProductSelector.tsx` | Create | Product list with order form |
| `apps/web/components/orders/OrderStatusBadge.tsx` | Create | Status chip |
| `apps/web/components/orders/OrderTracker.tsx` | Create | Real-time WebSocket status |
| `apps/web/components/wallet/QrPaymentModal.tsx` | Create | PromptPay QR modal |
| `apps/web/components/wallet/TransactionList.tsx` | Create | Ledger table |
| `apps/web/components/admin/StatsCard.tsx` | Create | KPI card |
| `apps/web/components/admin/DataTable.tsx` | Create | Reusable admin table |

---

### Task 1: Next.js Project Setup

- [ ] **Step 1: Write package.json**

`apps/web/package.json`:
```json
{
  "name": "@pixelpay/web",
  "version": "1.0.0",
  "scripts": {
    "dev": "next dev -p 3001",
    "build": "next build",
    "start": "next start -p 3001"
  },
  "dependencies": {
    "next": "14.2.3",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@tanstack/react-query": "^5.32.0",
    "zustand": "^4.5.2",
    "socket.io-client": "^4.7.4",
    "react-hook-form": "^7.51.0",
    "zod": "^3.23.3",
    "@hookform/resolvers": "^3.4.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.3.0",
    "lucide-react": "^0.378.0",
    "dayjs": "^1.11.11",
    "class-variance-authority": "^0.7.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.3.0",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.3",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Write tailwind.config.ts**

`apps/web/tailwind.config.ts`:
```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#6C63FF',
          dark: '#4B44CC',
          light: '#9D96FF',
        },
      },
    },
  },
  plugins: [],
};
export default config;
```

- [ ] **Step 3: Write API client**

`apps/web/lib/api-client.ts`:
```typescript
const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { params?: Record<string, string> } = {},
): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  if (options.params) {
    Object.entries(options.params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const res = await fetch(url.toString(), { ...options, headers });
  const json = await res.json();

  if (!res.ok) {
    throw new Error(json?.error?.message ?? `Request failed: ${res.status}`);
  }

  return json.data as T;
}
```

- [ ] **Step 4: Write Zustand auth store**

`apps/web/stores/auth.store.ts`:
```typescript
import { create } from 'zustand';
import { setAccessToken } from '../lib/api-client';

interface User {
  id: string;
  email: string;
  displayName: string;
  role: string;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null, token: string | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  setUser: (user, token) => {
    setAccessToken(token);
    set({ user, isLoading: false });
  },
  logout: () => {
    setAccessToken(null);
    set({ user: null });
  },
}));
```

- [ ] **Step 5: Write middleware**

`apps/web/middleware.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/register', '/forgot-password'];
const ADMIN_PATHS = ['/admin'];

export function middleware(req: NextRequest) {
  const token = req.cookies.get('pixelpay-token')?.value;
  const { pathname } = req.nextUrl;

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const isAdmin = ADMIN_PATHS.some((p) => pathname.startsWith(p));

  if (!token && !isPublic) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if (token && isPublic) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 6: Commit scaffold**

```bash
git add apps/web/
git commit -m "feat: Next.js app scaffold — API client, auth store, middleware"
```

---

### Task 2: Auth Pages

- [ ] **Step 1: Write LoginPage**

`apps/web/app/(auth)/login/page.tsx`:
```tsx
'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../../lib/api-client';
import { useAuthStore } from '../../../stores/auth.store';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const { register, handleSubmit, formState: { errors, isSubmitting }, setError } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    try {
      const res = await apiFetch<{ user: any; accessToken: string; refreshToken: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      setUser(res.user, res.accessToken);
      document.cookie = `pixelpay-token=${res.accessToken}; path=/; samesite=strict`;
      router.push('/');
    } catch (e: any) {
      setError('root', { message: e.message });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <h1 className="text-2xl font-bold text-center mb-6 text-brand">Login to PixelPay</h1>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              {...register('email')}
              type="email"
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="you@example.com"
            />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              {...register('password')}
              type="password"
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand"
            />
            {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
          </div>
          {errors.root && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-600 text-sm">
              {errors.root.message}
            </div>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-brand text-white py-2 rounded-lg font-semibold hover:bg-brand-dark disabled:opacity-50"
          >
            {isSubmitting ? 'Logging in...' : 'Login'}
          </button>
        </form>
        <p className="text-center text-sm text-gray-500 mt-4">
          Don&apos;t have an account? <a href="/register" className="text-brand font-medium">Register</a>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write RegisterPage** (same pattern as LoginPage, adds `displayName` field and calls `POST /auth/register`)

- [ ] **Step 3: Commit auth pages**

```bash
git add apps/web/app/(auth)/
git commit -m "feat: login and register pages with react-hook-form + zod"
```

---

### Task 3: Game Catalog & Order Flow

- [ ] **Step 1: Write GameCard component**

`apps/web/components/games/GameCard.tsx`:
```tsx
import Image from 'next/image';
import Link from 'next/link';

interface Props {
  name: string;
  slug: string;
  logoUrl: string | null;
  category: string | null;
}

export function GameCard({ name, slug, logoUrl, category }: Props) {
  return (
    <Link href={`/games/${slug}`} className="group block bg-white rounded-xl shadow hover:shadow-md transition-shadow p-4">
      <div className="relative w-full h-32 mb-3 rounded-lg overflow-hidden bg-gray-100">
        {logoUrl ? (
          <Image src={logoUrl} alt={name} fill className="object-cover group-hover:scale-105 transition-transform" />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-4xl">🎮</div>
        )}
      </div>
      <h3 className="font-semibold text-gray-800 truncate">{name}</h3>
      {category && <p className="text-xs text-gray-400 mt-1">{category}</p>}
    </Link>
  );
}
```

- [ ] **Step 2: Write home page (game catalog)**

`apps/web/app/(dashboard)/page.tsx`:
```tsx
import { apiFetch } from '../../lib/api-client';
import { GameCard } from '../../components/games/GameCard';

interface Game {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  category: string | null;
}

export default async function HomePage() {
  const games = await apiFetch<Game[]>('/games').catch(() => []);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Top Up Games</h1>
      <p className="text-gray-500 mb-8">Fast, secure game top-ups powered by PixelPay</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {games.map((g) => <GameCard key={g.id} {...g} />)}
      </div>
      {games.length === 0 && (
        <div className="text-center py-20 text-gray-400">No games available yet.</div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write OrderTracker component (WebSocket)**

`apps/web/components/orders/OrderTracker.tsx`:
```tsx
'use client';
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

type OrderStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; icon: string }> = {
  PENDING: { label: 'Pending', color: 'text-yellow-600 bg-yellow-50', icon: '⏳' },
  PROCESSING: { label: 'Processing', color: 'text-blue-600 bg-blue-50', icon: '⚡' },
  COMPLETED: { label: 'Completed', color: 'text-green-600 bg-green-50', icon: '✅' },
  FAILED: { label: 'Failed', color: 'text-red-600 bg-red-50', icon: '❌' },
};

interface Props {
  orderId: string;
  initialStatus: OrderStatus;
  userId: string;
}

export function OrderTracker({ orderId, initialStatus, userId }: Props) {
  const [status, setStatus] = useState<OrderStatus>(initialStatus);

  useEffect(() => {
    if (status === 'COMPLETED' || status === 'FAILED') return;

    const socket: Socket = io(process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3000', {
      path: '/orders',
    });

    socket.on('connect', () => socket.emit('join', `user:${userId}`));
    socket.on('order.status', (data: { orderId: string; status: OrderStatus }) => {
      if (data.orderId === orderId) setStatus(data.status);
    });

    return () => { socket.disconnect(); };
  }, [orderId, userId, status]);

  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.PENDING;

  return (
    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full font-medium ${config.color}`}>
      <span>{config.icon}</span>
      <span>{config.label}</span>
      {(status === 'PENDING' || status === 'PROCESSING') && (
        <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write QrPaymentModal**

`apps/web/components/wallet/QrPaymentModal.tsx`:
```tsx
'use client';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import { apiFetch } from '../../lib/api-client';

interface Props {
  amount: number;
  onClose: () => void;
  onSuccess: () => void;
}

interface PaymentData {
  id: string;
  qrCodeUrl: string;
  expiresAt: string;
}

export function QrPaymentModal({ amount, onClose, onSuccess }: Props) {
  const [payment, setPayment] = useState<PaymentData | null>(null);
  const [error, setError] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(900); // 15 min

  useEffect(() => {
    apiFetch<PaymentData>('/payments/promptpay', {
      method: 'POST',
      body: JSON.stringify({ amount }),
    }).then(setPayment).catch((e) => setError(e.message));
  }, [amount]);

  useEffect(() => {
    if (!payment) return;
    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) { clearInterval(interval); onClose(); return 0; }
        return s - 1;
      });
      apiFetch<{ status: string }>(`/payments/${payment.id}`).then((p) => {
        if (p.status === 'COMPLETED') { clearInterval(interval); onSuccess(); }
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [payment, onClose, onSuccess]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4">
        <h2 className="text-xl font-bold text-center mb-4">Scan to Pay</h2>
        <p className="text-center text-2xl font-bold text-brand mb-4">
          ฿{amount.toLocaleString('th-TH')}
        </p>
        {error && <p className="text-red-500 text-center">{error}</p>}
        {payment?.qrCodeUrl && (
          <>
            <div className="flex justify-center mb-4">
              <Image src={payment.qrCodeUrl} alt="PromptPay QR" width={240} height={240} />
            </div>
            <p className="text-center text-gray-500 text-sm">
              Expires in {minutes}:{String(seconds).padStart(2, '0')}
            </p>
          </>
        )}
        <button onClick={onClose} className="w-full mt-4 border border-gray-300 rounded-lg py-2 text-gray-600 hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit frontend core**

```bash
git add apps/web/
git commit -m "feat: game catalog, order tracker (WebSocket), PromptPay QR modal"
```

---

### Task 4: Admin Dashboard UI

- [ ] **Step 1: Write StatsCard component**

`apps/web/components/admin/StatsCard.tsx`:
```tsx
interface Props {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: string;
  trend?: { value: number; label: string };
}

export function StatsCard({ title, value, subtitle, icon, trend }: Props) {
  return (
    <div className="bg-white rounded-xl shadow p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
          {trend && (
            <p className={`text-sm mt-2 font-medium ${trend.value >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
            </p>
          )}
        </div>
        <span className="text-3xl">{icon}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write Admin home page**

`apps/web/app/admin/page.tsx`:
```tsx
'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api-client';
import { StatsCard } from '../../components/admin/StatsCard';

interface Stats {
  totalUsers: number;
  totalOrders: number;
  pendingOrders: number;
  todayOrders: number;
  totalRevenue: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    apiFetch<Stats>('/admin/stats').then(setStats).catch(() => {});
  }, []);

  if (!stats) return <div className="p-8 text-gray-400">Loading...</div>;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatsCard title="Total Users" value={stats.totalUsers.toLocaleString()} icon="👥" />
        <StatsCard title="Total Orders" value={stats.totalOrders.toLocaleString()} icon="📦" />
        <StatsCard title="Pending Orders" value={stats.pendingOrders} icon="⏳" />
        <StatsCard title="Revenue" value={`฿${Number(stats.totalRevenue).toLocaleString('th-TH')}`} icon="💰" />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit admin UI**

```bash
git add apps/web/app/admin/
git commit -m "feat: admin dashboard UI — KPI cards, stats page"
```

---

### Phase 7 Completion Checklist

- [ ] Login + register forms with client-side zod validation
- [ ] API client wrapper with Bearer token injection
- [ ] Middleware protects all dashboard routes; redirects unauthenticated users
- [ ] Home page lists games from API (React Server Component)
- [ ] Game detail page shows products with order form
- [ ] Order tracker uses Socket.io WebSocket for real-time status
- [ ] PromptPay QR modal polls payment status every 5s and auto-closes on success
- [ ] Wallet page shows balance, transactions, and top-up flow
- [ ] Admin dashboard shows KPI cards and order management table
- [ ] All monetary values formatted with `฿` and Thai locale
