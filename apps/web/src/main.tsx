import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import './i18n';
import './styles.css';
import { App } from './App';
import { AuthProvider } from './lib/auth';
import { ToastProvider, ConfirmProvider } from './components/ui/feedback';
import { ErrorBoundary } from './components/ErrorBoundary';
import { applyTheme } from './hooks/useTheme';

try {
  const s = localStorage.getItem('theme');
  applyTheme(s === 'dark' || (!s && window.matchMedia?.('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light');
} catch { /* ignore */ }

const qc = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: (n, e: unknown) => n < 1 && (e as { status?: number })?.status !== 403 && (e as { status?: number })?.status !== 404, staleTime: 15_000 },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={qc}>
        <MotionConfig reducedMotion="user">
          <BrowserRouter>
            <ToastProvider>
              <ConfirmProvider>
                <AuthProvider>
                  <App />
                </AuthProvider>
              </ConfirmProvider>
            </ToastProvider>
          </BrowserRouter>
        </MotionConfig>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
