'use client';
import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { apiFetch } from '../../lib/api-client';
import { CreditCounter } from '../ui/CreditCounter';

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
  const t = useTranslations('wallet.qr');
  const tc = useTranslations('common');
  const [payment, setPayment] = useState<PaymentData | null>(null);
  const [error, setError] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(900); // 15 min

  const onCloseRef = useRef(onClose);
  const onSuccessRef = useRef(onSuccess);
  const paymentRef = useRef(payment);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { onSuccessRef.current = onSuccess; }, [onSuccess]);
  useEffect(() => { paymentRef.current = payment; }, [payment]);

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
        if (s <= 1) { clearInterval(interval); onCloseRef.current(); return 0; }
        return s - 1;
      });
      apiFetch<{ status: string }>(`/payments/${paymentRef.current?.id}`).then((p) => {
        if (p.status === 'COMPLETED') { clearInterval(interval); onSuccessRef.current(); }
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [payment]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const urgent = secondsLeft <= 60;

  return (
    <div className="fixed inset-0 bg-void-deep/85 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="pixel-cut bg-panel-light border border-frost/10 max-w-sm w-full p-6 text-frost">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-neon text-center mb-2">
          PromptPay
        </p>
        <h2 className="font-display text-2xl text-center text-pixel-bright mb-5">{t('scanToPay')}</h2>

        <div className="flex justify-center mb-5">
          <CreditCounter
            label={t('amountDue')}
            value={`฿${amount.toLocaleString('th-TH')}`}
            tone="neon"
            size="lg"
          />
        </div>

        {error && <p className="text-pink text-center text-sm">{error}</p>}

        {payment?.qrCodeUrl && (
          <>
            <div className="flex justify-center mb-5 bg-white p-3">
              <Image src={payment.qrCodeUrl} alt="PromptPay QR" width={220} height={220} />
            </div>
            <div className="flex justify-center mb-5">
              <CreditCounter
                label={t('expiresIn')}
                value={`${minutes}:${String(seconds).padStart(2, '0')}`}
                tone={urgent ? 'pink' : 'neon'}
                live={urgent}
                size="sm"
              />
            </div>
          </>
        )}

        <button
          onClick={onClose}
          className="w-full border border-frost/25 py-2.5 text-frost/70 hover:bg-frost/5 hover:text-frost transition-colors font-body"
        >
          {tc('cancel')}
        </button>
      </div>
    </div>
  );
}
