import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useT } from '@/i18n';
import { cn } from '@/lib/format';
import { Button } from './primitives';

// ───────────── Toasts ─────────────
type ToastKind = 'success' | 'error' | 'warning' | 'info';
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: ReactNode;
}
const ToastCtx = createContext<(kind: ToastKind, message: ReactNode) => void>(() => {});

const toastStyle: Record<ToastKind, { icon: ReactNode; cls: string }> = {
  success: { icon: <CheckCircle2 className="h-5 w-5 text-success" />, cls: 'border-l-success' },
  error: { icon: <XCircle className="h-5 w-5 text-danger" />, cls: 'border-l-danger' },
  warning: { icon: <AlertTriangle className="h-5 w-5 text-warning" />, cls: 'border-l-warning' },
  info: { icon: <Info className="h-5 w-5 text-info" />, cls: 'border-l-info' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const { t } = useT();
  const push = useCallback((kind: ToastKind, message: ReactNode) => {
    const id = ++seq.current;
    setItems((s) => [...s.slice(-3), { id, kind, message }]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
          <AnimatePresence initial={false}>
            {items.map((it) => (
              <motion.div
                key={it.id}
                layout
                initial={{ opacity: 0, x: 40, scale: 0.98 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40, transition: { duration: 0.18 } }}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                className={cn('card pointer-events-auto flex items-start gap-3 border-l-4 p-3.5 shadow-lift', toastStyle[it.kind].cls)}
                role={it.kind === 'error' ? 'alert' : 'status'}
              >
                <span className="mt-0.5 shrink-0">{toastStyle[it.kind].icon}</span>
                <div className="flex-1 text-sm text-fg">{it.message}</div>
                <button
                  className="text-subtle transition-colors hover:text-fg"
                  aria-label={t('common.close')}
                  onClick={() => setItems((s) => s.filter((x) => x.id !== it.id))}
                >
                  <X className="h-4 w-4" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const push = useContext(ToastCtx);
  return {
    success: (m: ReactNode) => push('success', m),
    error: (m: ReactNode) => push('error', m),
    warning: (m: ReactNode) => push('warning', m),
    info: (m: ReactNode) => push('info', m),
  };
}

// ───────────── Dialog ─────────────
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissable = true,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  dismissable?: boolean;
}) {
  const { t } = useT();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) onClose();
    };
    document.addEventListener('keydown', onKey);
    const tm = setTimeout(() => panel.current?.querySelector<HTMLElement>('input,textarea,select,button[data-autofocus]')?.focus(), 50);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      clearTimeout(tm);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [open, onClose, dismissable]);
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-4">
          <motion.div
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => dismissable && onClose()}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            className={cn('card relative flex max-h-[92vh] w-full flex-col rounded-b-none sm:rounded-xl', widths[size])}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
          >
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <h2 className="text-base font-semibold">{title}</h2>
                {description && <p className="mt-1 text-sm text-muted">{description}</p>}
              </div>
              {dismissable && (
                <button className="rounded-md p-1 text-subtle transition-colors hover:bg-surface-2 hover:text-fg" onClick={onClose} aria-label={t('common.close')}>
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
            {children && <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-4">{children}</div>}
            {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-surface-2/50 px-5 py-3">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ───────────── Promise-based confirm ─────────────
interface ConfirmOpts {
  title: ReactNode;
  message?: ReactNode;
  confirmLabel?: string;
  tone?: 'primary' | 'danger';
}
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const { t } = useT();
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Dialog
        open={!!state}
        onClose={() => close(false)}
        size="sm"
        title={state?.title ?? ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => close(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant={state?.tone === 'danger' ? 'danger' : 'primary'} onClick={() => close(true)} data-autofocus>
              {state?.confirmLabel ?? t('common.confirm')}
            </Button>
          </>
        }
      >
        {state?.message && <div className="text-sm text-muted">{state.message}</div>}
      </Dialog>
    </ConfirmCtx.Provider>
  );
}
export const useConfirm = () => useContext(ConfirmCtx);
