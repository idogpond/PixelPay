'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../../lib/api-client';
import { useAuthStore } from '../../../stores/auth.store';

const schema = z.object({
  email: z.string().email(),
  displayName: z.string().min(2),
  password: z.string().min(1),
});

type FormData = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const { register, handleSubmit, formState: { errors, isSubmitting }, setError } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    try {
      const res = await apiFetch<{ user: any; accessToken: string; refreshToken: string }>('/auth/register', {
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
        <h1 className="text-2xl font-bold text-center mb-6 text-brand">Create your PixelPay account</h1>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
            <input
              {...register('displayName')}
              type="text"
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="Your name"
            />
            {errors.displayName && <p className="text-red-500 text-xs mt-1">{errors.displayName.message}</p>}
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
            {isSubmitting ? 'Creating account...' : 'Register'}
          </button>
        </form>
        <p className="text-center text-sm text-gray-500 mt-4">
          Already have an account? <a href="/login" className="text-brand font-medium">Login</a>
        </p>
      </div>
    </div>
  );
}
