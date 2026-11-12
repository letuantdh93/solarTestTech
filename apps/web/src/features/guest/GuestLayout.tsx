import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useT } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { Badge, Button } from '@/components/ui/primitives';
import { BrandLogo } from '@/components/BrandLogo';

/** Minimal shell for candidates who entered without an account. */
export function GuestLayout({ children }: { children: ReactNode }) {
  const { t } = useT();
  const { me, logout } = useAuth();
  const nav = useNavigate();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <BrandLogo size={36} />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold">{me?.fullName}</p>
              <Badge tone="info">{t('guest.guestBadge')}</Badge>
            </div>
          </div>
          <Button variant="outline" icon={<LogOut className="h-4 w-4" />} onClick={async () => { await logout(); nav('/vao-thi', { replace: true }); }}>{t('guest.finish')}</Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
