import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

type ButtonVariant =
  | 'default'
  | 'secondary'
  | 'ghost'
  | 'link'
  | 'icon'
  | 'topIcon'
  | 'segment'
  | 'nav'
  | 'card'
  | 'subtle';
type ButtonSize = 'default' | 'sm' | 'icon' | 'none';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  active?: boolean;
}

const variants: Record<ButtonVariant, string> = {
  default:
    'inline-flex items-center justify-center gap-2 rounded-[11px] bg-[var(--accent)] px-[15px] text-[10px] font-bold text-white shadow-[0_6px_16px_color-mix(in_srgb,var(--accent),transparent_78%)] transition hover:-translate-y-px hover:brightness-[1.04] disabled:cursor-not-allowed disabled:opacity-50',
  secondary:
    'inline-flex items-center justify-center rounded-[11px] border border-[var(--border)] bg-[var(--surface)] px-[15px] text-[10px] font-bold text-[var(--muted-strong)] transition hover:border-[var(--border-strong)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50',
  ghost:
    'inline-flex items-center justify-center gap-2 rounded-lg text-[var(--muted-strong)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50',
  link: 'inline-flex items-center gap-1.5 text-[10px] font-bold text-[var(--accent-strong)] transition hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-50',
  icon: 'inline-grid place-items-center rounded-[10px] border border-transparent text-[var(--muted-strong)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50',
  topIcon:
    'inline-grid place-items-center rounded-[11px] border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-strong)] shadow-[var(--shadow-xs)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50',
  segment: 'rounded-lg px-3 py-1.5 text-[12px] font-semibold transition',
  nav: 'flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-[13px] font-semibold transition',
  card: 'rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] text-left transition hover:-translate-y-0.5 hover:border-[var(--border-strong)] disabled:cursor-not-allowed disabled:opacity-50',
  subtle:
    'inline-flex items-center justify-center rounded-lg bg-[var(--surface-muted)] px-2.5 py-1.5 text-[9px] font-bold text-[var(--muted-strong)] transition hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-50',
};

const sizes: Record<ButtonSize, string> = {
  default: 'h-[38px]',
  sm: 'h-8',
  icon: 'h-8 w-8',
  none: '',
};

export function Button({
  className,
  variant = 'default',
  size = 'default',
  active,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        variants[variant],
        sizes[size],
        variant === 'segment' &&
          (active
            ? 'bg-[var(--text)] text-[var(--surface)] shadow-sm'
            : 'text-[var(--muted)] hover:text-[var(--text)]'),
        variant === 'nav' &&
          (active
            ? 'bg-[var(--nav-active)] text-[var(--accent-strong)]'
            : 'text-[var(--muted-strong)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]'),
        className,
      )}
      {...props}
    />
  );
}
