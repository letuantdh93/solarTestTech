import { createContext, forwardRef, useContext, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/format';

/** Field → control association (label htmlFor + aria-describedby). */
const FieldCtx = createContext<{ id: string; describedBy?: string; invalid?: boolean } | null>(null);
function useFieldProps(id?: string) {
  const f = useContext(FieldCtx);
  return { id: id ?? f?.id, 'aria-describedby': f?.describedBy, ...(f?.invalid ? { 'aria-invalid': true } : {}) };
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-fg hover:bg-primary/90 shadow-sm shadow-primary/20',
  secondary: 'bg-surface-2 text-fg border border-border hover:bg-border/60',
  outline: 'border border-border bg-surface text-fg hover:border-primary/50 hover:text-primary',
  ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
  danger: 'bg-danger text-white hover:bg-danger/90 shadow-sm shadow-danger/20',
  success: 'bg-success text-white hover:bg-success/90 shadow-sm shadow-success/20',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
  icon: 'h-9 w-9 justify-center',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
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
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap rounded-lg font-medium',
        'transition-[background-color,color,border-color,transform,box-shadow] duration-150 active:scale-[0.97]',
        'disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function Card({ className, children, hover, ...rest }: React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div className={cn('card', hover && 'card-hover', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, icon }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
      <div className="flex min-w-0 items-start gap-3">
        {icon && <div className="mt-0.5 text-primary">{icon}</div>}
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-fg">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export type Tone = 'neutral' | 'primary' | 'success' | 'danger' | 'warning' | 'info' | 'solar';
const tones: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted border-border',
  primary: 'bg-primary-soft text-primary border-primary/20',
  success: 'bg-success-soft text-success border-success/20',
  danger: 'bg-danger-soft text-danger border-danger/20',
  warning: 'bg-warning-soft text-warning border-warning/20',
  info: 'bg-info-soft text-info border-info/20',
  solar: 'bg-solar-soft text-solar border-solar/30',
};
export function Badge({ tone = 'neutral', icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium', tones[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input(
  { className, invalid, ...rest },
  ref,
) {
  const fp = useFieldProps(rest.id);
  return <input ref={ref} className={cn('input', invalid && 'border-danger focus:border-danger', className)} aria-invalid={invalid || undefined} {...fp} {...rest} id={fp.id} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea(
  { className, invalid, ...rest },
  ref,
) {
  const fp = useFieldProps(rest.id);
  return <textarea ref={ref} className={cn('input min-h-[88px] resize-y leading-6', invalid && 'border-danger', className)} {...fp} {...rest} id={fp.id} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  const fp = useFieldProps(rest.id);
  return (
    <select ref={ref} className={cn('input cursor-pointer pr-8', className)} {...fp} {...rest} id={fp.id}>
      {children}
    </select>
  );
});

export function Field({ label, hint, error, children, required, className }: { label?: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; required?: boolean; className?: string }) {
  const id = useId();
  const msgId = `${id}-msg`;
  return (
    <FieldCtx.Provider value={{ id, describedBy: error || hint ? msgId : undefined, invalid: !!error }}>
      <div className={className}>
        {label && (
          <label className="label" htmlFor={id}>
            {label}
            {required && <span className="ml-0.5 text-danger" aria-hidden>*</span>}
          </label>
        )}
        {children}
        {error ? <p id={msgId} className="mt-1 text-xs text-danger" role="alert">{error}</p> : hint ? <p id={msgId} className="mt-1 text-xs text-muted">{hint}</p> : null}
      </div>
    </FieldCtx.Provider>
  );
}

export function Checkbox({ checked, onChange, label, disabled, className }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean; className?: string }) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 text-sm', disabled && 'cursor-not-allowed opacity-60', className)}>
      <input
        type="checkbox"
        className="h-4 w-4 cursor-pointer rounded border-border accent-[rgb(var(--primary))]"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-3 text-sm', disabled && 'opacity-60')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200', checked ? 'bg-primary' : 'bg-border')}
      >
        <span className={cn('absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
      </button>
      {label && <span>{label}</span>}
    </label>
  );
}
