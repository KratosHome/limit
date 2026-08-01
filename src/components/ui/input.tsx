import type { InputHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

type InputVariant = 'default' | 'ghost' | 'date' | 'number';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  variant?: InputVariant;
}

const variants: Record<InputVariant, string> = {
  default: 'h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12px] text-[var(--text)] shadow-[var(--shadow-xs)] outline-none transition placeholder:text-[var(--muted)] focus:border-[color-mix(in_srgb,var(--accent),transparent_25%)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent),transparent_88%)] disabled:cursor-not-allowed disabled:opacity-50',
  ghost: 'w-full bg-transparent text-[12px] font-medium text-[var(--text)] outline-none placeholder:text-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-50',
  date: 'w-[103px] bg-transparent text-[10px] font-bold text-[var(--muted-strong)] outline-none disabled:cursor-not-allowed disabled:opacity-50',
  number: 'w-12 bg-transparent text-right text-[12px] font-bold text-[var(--text)] outline-none disabled:cursor-not-allowed disabled:opacity-50',
};

export function Input({ className, variant = 'default', ...props }: InputProps) {
  return <input className={cn(variants[variant], className)} {...props} />;
}
