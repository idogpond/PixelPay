'use client';
import { useState, useEffect, useRef } from 'react';
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
