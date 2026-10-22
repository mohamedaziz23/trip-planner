'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { X } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

// ------------------------------------------------------------------ Button
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-dark disabled:bg-brand/50',
  secondary: 'bg-white text-ink border border-line hover:bg-surface disabled:opacity-60',
  ghost: 'text-ink hover:bg-surface disabled:opacity-60',
  danger: 'bg-red-700 text-white hover:bg-red-800 disabled:bg-red-700/50',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors disabled:cursor-not-allowed',
        size === 'sm' ? 'h-8 px-3 text-sm' : 'h-10 px-4 text-sm',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner className="size-4" /> : icon}
      {children}
    </button>
  );
});

export function ButtonLink({ href, variant = 'primary', className, children, icon }: { href: string; variant?: Variant; className?: string; children: ReactNode; icon?: ReactNode }) {
  return (
    <Link
      href={href}
      className={clsx('inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors', variants[variant], className)}
    >
      {icon}
      {children}
    </Link>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={clsx('animate-spin', className ?? 'size-5')} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

// ------------------------------------------------------------------ Form fields
interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  children: (id: string, describedBy?: string) => ReactNode;
  className?: string;
}

export function Field({ label, error, hint, children, className }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={clsx('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children(id, describedBy)}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const control =
  'w-full rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-muted/80 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:bg-surface';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={clsx(control, 'h-10', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={clsx(control, 'min-h-24 py-2', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={clsx(control, 'h-10 pr-8', className)} {...rest}>
      {children}
    </select>
  );
});

export function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={clsx(
        'rounded-full border px-3 py-1 text-sm capitalize transition-colors',
        selected ? 'border-brand bg-brand text-white' : 'border-line bg-white text-ink hover:border-brand',
      )}
    >
      {children}
    </button>
  );
}

// ------------------------------------------------------------------ Layout pieces
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('rounded-xl border border-line bg-white p-4 shadow-sm', className)}>{children}</div>;
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'brand' | 'warn' | 'danger' | 'success'; className?: string }) {
  const tones = {
    neutral: 'bg-surface text-ink',
    brand: 'bg-brand-light text-brand-dark',
    warn: 'bg-amber-100 text-amber-900',
    danger: 'bg-red-100 text-red-800',
    success: 'bg-green-100 text-green-800',
  };
  return <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', tones[tone], className)}>{children}</span>;
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line bg-white px-6 py-10 text-center">
      {icon && <div className="text-muted">{icon}</div>}
      <h3 className="font-semibold text-ink">{title}</h3>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Alert({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'error' | 'success'; children: ReactNode }) {
  const tones = {
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    error: 'border-red-200 bg-red-50 text-red-900',
    success: 'border-green-200 bg-green-50 text-green-900',
  };
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={clsx('rounded-lg border px-4 py-3 text-sm', tones[tone])}>
      {children}
    </div>
  );
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-muted" role="status">
      <Spinner /> {label}
    </div>
  );
}

// ------------------------------------------------------------------ Modal (native <dialog>)
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={clsx(
        'm-auto w-[calc(100%-2rem)] rounded-2xl border border-line bg-white p-0 text-ink shadow-xl backdrop:bg-black/40',
        wide ? 'max-w-2xl' : 'max-w-lg',
      )}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button type="button" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-surface hover:text-ink" aria-label="Close">
              <X className="size-5" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export function Avatar({ name, url, size = 32 }: { name: string; url?: string | null; size?: number }) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand-light font-semibold text-brand-dark"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials || '?'}
    </span>
  );
}
