import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BarChart3, BookOpenCheck, Bot, ChevronsLeft, ClipboardCheck, ClipboardList, FolderTree, History, KeyRound,
  LayoutDashboard, ListChecks, LogOut, Menu, Moon, ScrollText, Settings, Sun, Trophy, Users, Wand2, X,
} from 'lucide-react';
import type { Permission } from '@solar/shared';
import { useT } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/format';
import { useTheme } from '@/hooks/useTheme';
import { BrandLogo } from '@/components/BrandLogo';

interface NavItem {
  to: string;
  key: string;
  icon: ReactNode;
  perms: Permission[]; // any of
  end?: boolean;
}
interface NavGroup {
  key: string;
  items: NavItem[];
}

const ic = 'h-[18px] w-[18px]';
const NAV: NavGroup[] = [
  {
    key: 'nav.groupMain',
    items: [
      { to: '/', key: 'nav.dashboard', icon: <LayoutDashboard className={ic} />, perms: [], end: true },
      { to: '/thi', key: 'nav.myExams', icon: <ClipboardCheck className={ic} />, perms: ['exams.take'] },
      { to: '/ket-qua-cua-toi', key: 'nav.myResults', icon: <History className={ic} />, perms: ['results.view_own'] },
    ],
  },
  {
    key: 'nav.groupBank',
    items: [
      { to: '/cau-hoi', key: 'nav.questionBank', icon: <BookOpenCheck className={ic} />, perms: ['questions.view_all', 'questions.create'] },
      { to: '/duyet-cau-hoi', key: 'nav.review', icon: <ListChecks className={ic} />, perms: ['questions.review'] },
      { to: '/danh-muc', key: 'nav.categories', icon: <FolderTree className={ic} />, perms: ['categories.manage', 'categories.view'] },
      { to: '/tro-ly-ai', key: 'nav.ai', icon: <Bot className={ic} />, perms: ['ai.use'] },
    ],
  },
  {
    key: 'nav.groupExam',
    items: [
      { to: '/tao-de', key: 'nav.examBuilder', icon: <Wand2 className={ic} />, perms: ['exams.manage'] },
      { to: '/de-thi', key: 'nav.exams', icon: <ClipboardList className={ic} />, perms: ['exams.manage', 'exams.assign'] },
      { to: '/ket-qua', key: 'nav.results', icon: <Trophy className={ic} />, perms: ['results.view_all'] },
      { to: '/phan-tich', key: 'nav.analytics', icon: <BarChart3 className={ic} />, perms: ['exams.view_stats', 'results.view_all'] },
    ],
  },
  {
    key: 'nav.groupAdmin',
    items: [
      { to: '/nguoi-dung', key: 'nav.users', icon: <Users className={ic} />, perms: ['users.manage'] },
      { to: '/cau-hinh', key: 'nav.settings', icon: <Settings className={ic} />, perms: ['settings.manage'] },
      { to: '/nhat-ky', key: 'nav.audit', icon: <ScrollText className={ic} />, perms: ['audit.view'] },
    ],
  },
];

function SolarLogo({ compact }: { compact?: boolean }) {
  const { t } = useT();
  return (
    <div className="flex items-center gap-2.5">
      <BrandLogo size={38} />
      {!compact && (
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-bold text-white">{t('app.short')}</p>
          <p className="truncate text-[11px] text-sidebar-muted">{t('app.subtitle')}</p>
        </div>
      )}
    </div>
  );
}

function SidebarContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { t } = useT();
  const { can } = useAuth();
  return (
    <nav className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label={t('ui.mainNav')}>
      {NAV.map((g) => {
        const items = g.items.filter((i) => i.perms.length === 0 || can(...i.perms));
        if (!items.length) return null;
        return (
          <div key={g.key}>
            {!collapsed && <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted/80">{t(g.key)}</p>}
            <ul className="space-y-0.5">
              {items.map((it) => (
                <li key={it.to}>
                  <NavLink
                    to={it.to}
                    end={it.end}
                    onClick={onNavigate}
                    title={collapsed ? t(it.key) : undefined}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150',
                        isActive ? 'bg-sidebar-active text-white' : 'text-sidebar-fg/75 hover:bg-sidebar-active/60 hover:text-white',
                        collapsed && 'justify-center px-0',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && <motion.span layoutId="nav-active" className="absolute left-0 top-1.5 h-[calc(100%-12px)] w-[3px] rounded-r-full bg-solar" transition={{ type: 'spring', stiffness: 500, damping: 35 }} />}
                        <span className={cn('transition-transform duration-200 group-hover:scale-110', isActive && 'text-solar')}>{it.icon}</span>
                        {!collapsed && <span className="truncate">{t(it.key)}</span>}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function UserMenu() {
  const { me, logout } = useAuth();
  const { t } = useT();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  if (!me) return null;
  const initials = me.fullName.split(' ').slice(-2).map((w) => w[0]).join('').toUpperCase();
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2" aria-haspopup="menu" aria-expanded={open}>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-info text-xs font-bold text-white">{initials}</span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-sm font-medium text-fg">{me.fullName}</span>
          <span className="block text-xs text-muted">{t(`roles.${me.role}`)}</span>
        </span>
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <motion.div
              role="menu"
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.12 } }}
              transition={{ duration: 0.16 }}
              className="card absolute right-0 z-40 mt-2 w-56 origin-top-right p-1.5 shadow-lift"
            >
              <div className="border-b border-border px-3 py-2">
                <p className="truncate text-sm font-medium">{me.fullName}</p>
                <p className="truncate text-xs text-muted">@{me.username}</p>
              </div>
              <button role="menuitem" className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-surface-2" onClick={() => { setOpen(false); nav('/doi-mat-khau'); }}>
                <KeyRound className="h-4 w-4" /> {t('auth.changePassword')}
              </button>
              <button role="menuitem" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-danger hover:bg-danger-soft" onClick={() => void logout()}>
                <LogOut className="h-4 w-4" /> {t('auth.logout')}
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export function AppShell() {
  const { t } = useT();
  const loc = useLocation();
  const { theme, toggle } = useTheme();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar') === 'collapsed');
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    try { localStorage.setItem('sidebar', collapsed ? 'collapsed' : 'open'); } catch { /* ignore */ }
  }, [collapsed]);
  useEffect(() => setMobileOpen(false), [loc.pathname]);

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <motion.aside
        animate={{ width: collapsed ? 76 : 264 }}
        transition={{ type: 'spring', stiffness: 320, damping: 34 }}
        className="sticky top-0 hidden h-screen shrink-0 flex-col bg-sidebar lg:flex"
      >
        <div className={cn('flex h-16 items-center border-b border-white/5 px-4', collapsed && 'justify-center px-0')}>
          <SolarLogo compact={collapsed} />
        </div>
        <SidebarContent collapsed={collapsed} />
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="m-3 flex items-center justify-center gap-2 rounded-lg py-2 text-xs text-sidebar-muted transition-colors hover:bg-sidebar-active hover:text-white"
          aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
        >
          <ChevronsLeft className={cn('h-4 w-4 transition-transform duration-300', collapsed && 'rotate-180')} />
          {!collapsed && t('nav.collapse')}
        </button>
      </motion.aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div className="absolute inset-0 bg-slate-950/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileOpen(false)} />
            <motion.aside
              className="absolute inset-y-0 left-0 flex w-72 flex-col bg-sidebar"
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            >
              <div className="flex h-16 items-center justify-between border-b border-white/5 px-4">
                <SolarLogo />
                <button onClick={() => setMobileOpen(false)} className="rounded-md p-1.5 text-sidebar-muted hover:text-white" aria-label={t('common.close')}>
                  <X className="h-5 w-5" />
                </button>
              </div>
              <SidebarContent collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-border bg-surface/80 px-4 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-2">
            <button className="rounded-lg p-2 text-muted hover:bg-surface-2 lg:hidden" onClick={() => setMobileOpen(true)} aria-label={t('nav.openMenu')}>
              <Menu className="h-5 w-5" />
            </button>
            <p className="hidden text-sm font-medium text-muted md:block">{t('app.name')}</p>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={toggle} className="rounded-lg p-2 text-muted transition-colors hover:bg-surface-2 hover:text-fg" aria-label={`${t('common.theme')}: ${theme === 'dark' ? t('common.themeLight') : t('common.themeDark')}`}>
              <motion.span key={theme} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} className="block">
                {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </motion.span>
            </button>
            <UserMenu />
          </div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={loc.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto w-full max-w-[1400px]"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
