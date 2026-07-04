import { clsx } from 'clsx';

type Tone = 'neon' | 'pixel' | 'gold' | 'pink' | 'mint';

const TONE_TEXT: Record<Tone, string> = {
  neon: 'text-neon',
  pixel: 'text-pixel-bright',
  gold: 'text-gold',
  pink: 'text-pink',
  mint: 'text-mint',
};

interface Props {
  label: string;
  value: React.ReactNode;
  tone?: Tone;
  size?: 'sm' | 'md' | 'lg';
  live?: boolean;
  className?: string;
}

const SIZE_TEXT: Record<NonNullable<Props['size']>, string> = {
  sm: 'text-base px-2.5 py-1.5',
  md: 'text-xl px-3.5 py-2',
  lg: 'text-3xl px-5 py-3',
};

/**
 * The credit-counter: reused for wallet balance, order status and payment
 * countdown so the one motif ties every "counting" moment in the product
 * to the same glowing readout.
 */
export function CreditCounter({ label, value, tone = 'neon', size = 'md', live, className }: Props) {
  return (
    <div className={clsx('inline-flex flex-col gap-1', className)}>
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-frost/40">
        {label}
      </span>
      <span
        className={clsx(
          'counter-bezel counter-digits rounded-sm inline-flex items-center gap-1 leading-none',
          SIZE_TEXT[size],
          TONE_TEXT[tone],
          live && 'animate-flicker',
        )}
      >
        {value}
      </span>
    </div>
  );
}
