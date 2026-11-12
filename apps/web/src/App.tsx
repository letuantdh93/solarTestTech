import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ShieldAlert, Compass } from 'lucide-react';
import type { Permission } from '@solar/shared';
import { useAuth } from './lib/auth';
import { useT } from './i18n';
import { AppShell } from './components/layout/AppShell';
import { EmptyState, Skeleton } from './components/ui/data';
import { Button } from './components/ui/primitives';
import { LoginPage } from './features/auth/LoginPage';

const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage'));
const ChangePasswordPage = lazy(() => import('./features/auth/ChangePasswordPage'));
const UsersPage = lazy(() => import('./features/users/UsersPage'));
const CategoriesPage = lazy(() => import('./features/categories/CategoriesPage'));
const SettingsPage = lazy(() => import('./features/settings/SettingsPage'));
const AuditPage = lazy(() => import('./features/settings/AuditPage'));
const QuestionsPage = lazy(() => import('./features/questions/QuestionsPage'));
const QuestionEditorPage = lazy(() => import('./features/questions/QuestionEditorPage'));
const QuestionDetailPage = lazy(() => import('./features/questions/QuestionDetailPage'));
const ReviewPage = lazy(() => import('./features/questions/ReviewPage'));
const ExamBuilderPage = lazy(() => import('./features/exams/ExamBuilderPage'));
const ExamsPage = lazy(() => import('./features/exams/ExamsPage'));
const ExamDetailPage = lazy(() => import('./features/exams/ExamDetailPage'));
const MyExamsPage = lazy(() => import('./features/take/MyExamsPage'));
const TakeExamPage = lazy(() => import('./features/take/TakeExamPage'));
const ResultPage = lazy(() => import('./features/results/ResultPage'));
const MyResultsPage = lazy(() => import('./features/results/MyResultsPage'));
const ResultsPage = lazy(() => import('./features/results/ResultsPage'));
const AnalyticsPage = lazy(() => import('./features/analytics/AnalyticsPage'));
const AiAssistantPage = lazy(() => import('./features/ai/AiAssistantPage'));

function PageFallback() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

function Guard({ perms = [], children }: { perms?: Permission[]; children: ReactNode }) {
  const { can } = useAuth();
  const { t } = useT();
  if (perms.length && !can(...perms))
    return <EmptyState icon={<ShieldAlert className="h-7 w-7" />} title={t('common.forbidden')} action={<Button onClick={() => history.back()} variant="secondary">{t('common.back')}</Button>} />;
  return <Suspense fallback={<PageFallback />}>{children}</Suspense>;
}

function NotFound() {
  const { t } = useT();
  return <EmptyState icon={<Compass className="h-7 w-7" />} title={t('common.notFound')} action={<Button onClick={() => (location.href = '/')}>{t('common.goHome')}</Button>} />;
}

export function App() {
  const { me, loading } = useAuth();
  const { t } = useT();
  const loc = useLocation();
  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" role="status" aria-label={t('ui.loading')} />
      </div>
    );
  if (!me)
    return (
      <Routes>
        <Route path="/dang-nhap" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/dang-nhap" replace state={{ from: loc.pathname }} />} />
      </Routes>
    );
  if (me.mustChangePassword && loc.pathname !== '/doi-mat-khau') return <Navigate to="/doi-mat-khau" replace />;

  return (
    <Routes>
      {/* Full-screen exam interface (no shell) */}
      <Route path="/thi/lam-bai/:attemptId" element={<Guard perms={['exams.take']}><TakeExamPage /></Guard>} />
      <Route element={<AppShell />}>
        <Route index element={<Guard><DashboardPage /></Guard>} />
        <Route path="/dang-nhap" element={<Navigate to="/" replace />} />
        <Route path="/doi-mat-khau" element={<Guard><ChangePasswordPage /></Guard>} />
        <Route path="/nguoi-dung" element={<Guard perms={['users.manage']}><UsersPage /></Guard>} />
        <Route path="/danh-muc" element={<Guard perms={['categories.manage', 'categories.view']}><CategoriesPage /></Guard>} />
        <Route path="/cau-hinh" element={<Guard perms={['settings.manage']}><SettingsPage /></Guard>} />
        <Route path="/nhat-ky" element={<Guard perms={['audit.view']}><AuditPage /></Guard>} />
        <Route path="/cau-hoi" element={<Guard perms={['questions.view_all', 'questions.create']}><QuestionsPage /></Guard>} />
        <Route path="/cau-hoi/moi" element={<Guard perms={['questions.create']}><QuestionEditorPage /></Guard>} />
        <Route path="/cau-hoi/:id" element={<Guard perms={['questions.view_all', 'questions.create']}><QuestionDetailPage /></Guard>} />
        <Route path="/cau-hoi/:id/sua" element={<Guard perms={['questions.create', 'questions.edit_all']}><QuestionEditorPage /></Guard>} />
        <Route path="/duyet-cau-hoi" element={<Guard perms={['questions.review']}><ReviewPage /></Guard>} />
        <Route path="/tao-de" element={<Guard perms={['exams.manage']}><ExamBuilderPage /></Guard>} />
        <Route path="/de-thi" element={<Guard perms={['exams.manage', 'exams.assign']}><ExamsPage /></Guard>} />
        <Route path="/de-thi/:id" element={<Guard perms={['exams.manage', 'exams.assign']}><ExamDetailPage /></Guard>} />
        <Route path="/thi" element={<Guard perms={['exams.take']}><MyExamsPage /></Guard>} />
        <Route path="/ket-qua-cua-toi" element={<Guard perms={['results.view_own']}><MyResultsPage /></Guard>} />
        <Route path="/ket-qua/luot/:attemptId" element={<Guard perms={['results.view_own', 'results.view_all']}><ResultPage /></Guard>} />
        <Route path="/ket-qua" element={<Guard perms={['results.view_all']}><ResultsPage /></Guard>} />
        <Route path="/phan-tich" element={<Guard perms={['exams.view_stats', 'results.view_all']}><AnalyticsPage /></Guard>} />
        <Route path="/tro-ly-ai" element={<Guard perms={['ai.use']}><AiAssistantPage /></Guard>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
