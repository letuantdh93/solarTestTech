import { Component, type ReactNode } from 'react';
import i18n from '@/i18n';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="card max-w-md p-8 text-center">
          <h1 className="text-lg font-semibold">{i18n.t('errors.title')}</h1>
          <p className="mt-2 text-sm text-muted">{i18n.t('common.unknownError')}</p>
          <button className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white" onClick={() => location.reload()}>
            {i18n.t('errors.reload')}
          </button>
        </div>
      </div>
    );
  }
}
