'use client';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { apiFetch, getAccessToken } from '../../../lib/api-client';
import { useAuthStore } from '../../../stores/auth.store';

interface Profile {
  id: string;
  email: string;
  phone: string | null;
  displayName: string;
  role: string;
  isVerified: boolean;
  referralCode: string;
  createdAt: string;
}

type ProfileForm = { displayName: string };
type PasswordForm = { currentPassword: string; newPassword: string; confirmPassword: string };

const inputClasses =
  'w-full border border-frost/15 bg-void px-3 py-2.5 text-frost focus:outline-none focus:ring-2 focus:ring-pixel focus:border-pixel';
const labelClasses = 'block text-xs font-mono uppercase tracking-wider text-frost/50 mb-1';
const cardClasses = 'pixel-cut bg-panel border border-frost/10 p-6';

export default function ProfilePage() {
  const t = useTranslations('profile');
  const tc = useTranslations('common');
  const setUser = useAuthStore((s) => s.setUser);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);

  const profileSchema = useMemo(
    () => z.object({ displayName: z.string().min(2, t('errors.displayNameMin')).max(50) }),
    [t],
  );
  const passwordSchema = useMemo(
    () =>
      z
        .object({
          currentPassword: z.string().min(1, t('errors.currentPasswordRequired')),
          newPassword: z
            .string()
            .min(8, t('errors.newPasswordMin'))
            .max(72)
            .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, t('errors.newPasswordPattern')),
          confirmPassword: z.string(),
        })
        .refine((d) => d.newPassword === d.confirmPassword, {
          path: ['confirmPassword'],
          message: t('errors.passwordMismatch'),
        }),
    [t],
  );

  const profileForm = useForm<ProfileForm>({ resolver: zodResolver(profileSchema) });
  const passwordForm = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) });

  useEffect(() => {
    apiFetch<Profile>('/users/profile')
      .then((p) => {
        setProfile(p);
        profileForm.reset({ displayName: p.displayName });
      })
      .catch((e) => setError(e.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onSaveProfile = async (data: ProfileForm) => {
    setProfileSaved(false);
    try {
      const updated = await apiFetch<{ id: string; email: string; displayName: string }>('/users/profile', {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      setProfile((p) => (p ? { ...p, displayName: updated.displayName } : p));
      if (profile) {
        setUser({ id: profile.id, email: profile.email, displayName: updated.displayName, role: profile.role }, getAccessToken());
      }
      setProfileSaved(true);
    } catch (e: any) {
      profileForm.setError('root', { message: e.message });
    }
  };

  const onChangePassword = async (data: PasswordForm) => {
    setPasswordSaved(false);
    try {
      await apiFetch('/users/change-password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword: data.currentPassword, newPassword: data.newPassword }),
      });
      passwordForm.reset();
      setPasswordSaved(true);
    } catch (e: any) {
      passwordForm.setError('root', { message: e.message });
    }
  };

  if (error) return <div className="max-w-3xl mx-auto px-4 py-10 text-pink">{tc('error', { message: error })}</div>;
  if (!profile) return <div className="max-w-3xl mx-auto px-4 py-10 text-frost/40">{tc('loading')}</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="font-display text-3xl text-frost mb-1">{t('title')}</h1>
      <p className="text-sm text-frost/50 mb-8">
        {t('memberSince', { email: profile.email, date: new Date(profile.createdAt).toLocaleDateString('th-TH') })}
        {profile.isVerified && <span className="text-mint font-medium"> {t('verified')}</span>}
      </p>

      <div className="space-y-8">
        <form onSubmit={profileForm.handleSubmit(onSaveProfile)} className={cardClasses}>
          <h2 className="font-display text-lg text-frost mb-4">{t('displayNameSection')}</h2>
          <div className="mb-4">
            <label htmlFor="displayName" className={labelClasses}>{t('displayName')}</label>
            <input id="displayName" {...profileForm.register('displayName')} className={inputClasses} />
            {profileForm.formState.errors.displayName && (
              <p className="text-pink text-xs mt-1">{profileForm.formState.errors.displayName.message}</p>
            )}
          </div>
          {profileForm.formState.errors.root && (
            <div className="bg-pink/10 border border-pink/30 px-3 py-2 text-pink text-sm mb-4">
              {profileForm.formState.errors.root.message}
            </div>
          )}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={profileForm.formState.isSubmitting}
              className="grad-brand text-white px-5 py-2 font-body font-bold pixel-cut hover:brightness-110 disabled:opacity-50 transition-colors"
            >
              {profileForm.formState.isSubmitting ? tc('saving') : tc('save')}
            </button>
            {profileSaved && <span className="text-mint text-sm">{t('saved')}</span>}
          </div>
        </form>

        <form onSubmit={passwordForm.handleSubmit(onChangePassword)} className={cardClasses}>
          <h2 className="font-display text-lg text-frost mb-4">{t('changePassword')}</h2>
          <div className="space-y-4 mb-4">
            <div>
              <label htmlFor="currentPassword" className={labelClasses}>{t('currentPassword')}</label>
              <input id="currentPassword" type="password" {...passwordForm.register('currentPassword')} className={inputClasses} />
              {passwordForm.formState.errors.currentPassword && (
                <p className="text-pink text-xs mt-1">{passwordForm.formState.errors.currentPassword.message}</p>
              )}
            </div>
            <div>
              <label htmlFor="newPassword" className={labelClasses}>{t('newPassword')}</label>
              <input id="newPassword" type="password" {...passwordForm.register('newPassword')} className={inputClasses} />
              {passwordForm.formState.errors.newPassword && (
                <p className="text-pink text-xs mt-1">{passwordForm.formState.errors.newPassword.message}</p>
              )}
            </div>
            <div>
              <label htmlFor="confirmPassword" className={labelClasses}>{t('confirmPassword')}</label>
              <input id="confirmPassword" type="password" {...passwordForm.register('confirmPassword')} className={inputClasses} />
              {passwordForm.formState.errors.confirmPassword && (
                <p className="text-pink text-xs mt-1">{passwordForm.formState.errors.confirmPassword.message}</p>
              )}
            </div>
          </div>
          {passwordForm.formState.errors.root && (
            <div className="bg-pink/10 border border-pink/30 px-3 py-2 text-pink text-sm mb-4">
              {passwordForm.formState.errors.root.message}
            </div>
          )}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={passwordForm.formState.isSubmitting}
              className="grad-brand text-white px-5 py-2 font-body font-bold pixel-cut hover:brightness-110 disabled:opacity-50 transition-colors"
            >
              {passwordForm.formState.isSubmitting ? t('updating') : t('updatePassword')}
            </button>
            {passwordSaved && <span className="text-mint text-sm">{t('passwordChanged')}</span>}
          </div>
        </form>
      </div>
    </div>
  );
}
