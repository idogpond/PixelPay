'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
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
      document.cookie = `pixelpay-token=${encodeURIComponent(res.accessToken)}; path=/; samesite=strict`;
      document.cookie = `pixelpay-refresh=${encodeURIComponent(res.refreshToken)}; path=/; samesite=strict`;
      router.push('/');
    } catch (e: any) {
      setError('root', { message: e.message });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-void-deep px-4">
      <div className="w-full max-w-md">
        <Link href="/" className="block mx-auto w-56 mb-2">
          <Image src="/logo.png" alt="PixelPay — เติมเกมไว ปลอดภัย คุ้มค่า" width={448} height={340} priority className="mix-blend-screen" />
        </Link>
        <div className="pixel-cut bg-panel border border-frost/10 p-8">
          <h1 className="font-display text-2xl text-center mb-1 text-frost">Welcome back</h1>
          <p className="text-center text-sm text-frost/50 mb-6">Log in to top up your games</p>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-mono uppercase tracking-wider text-frost/50 mb-1">Email</label>
              <input
                id="email"
                {...register('email')}
                type="email"
                className="w-full border border-frost/15 bg-void px-3 py-2.5 text-frost focus:outline-none focus:ring-2 focus:ring-pixel focus:border-pixel"
                placeholder="you@example.com"
              />
              {errors.email && <p className="text-pink text-xs mt-1">{errors.email.message}</p>}
            </div>
            <div>
              <label htmlFor="password" className="block text-xs font-mono uppercase tracking-wider text-frost/50 mb-1">Password</label>
              <input
                id="password"
                {...register('password')}
                type="password"
                className="w-full border border-frost/15 bg-void px-3 py-2.5 text-frost focus:outline-none focus:ring-2 focus:ring-pixel focus:border-pixel"
              />
              {errors.password && <p className="text-pink text-xs mt-1">{errors.password.message}</p>}
            </div>
            {errors.root && (
              <div className="bg-pink/10 border border-pink/30 px-3 py-2 text-pink text-sm">
                {errors.root.message}
              </div>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full grad-brand text-white py-2.5 font-body font-bold pixel-cut hover:brightness-110 disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? 'Logging in…' : 'Log in'}
            </button>
          </form>
          <p className="text-center text-sm text-frost/50 mt-5">
            New here? <Link href="/register" className="text-neon font-semibold hover:text-neon">Create an account</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
