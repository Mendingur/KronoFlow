import React from 'react';
import { CheckCircle2, Info, AlertCircle, X } from 'lucide-react';

export interface ToastItem {
  id: string;
  title: string;
  message: string;
  variant?: 'success' | 'info' | 'warning' | 'error';
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      data-testid="toast-container"
      className="fixed top-4 right-4 z-50 flex flex-col gap-2.5 w-[calc(100vw-2rem)] max-w-sm pointer-events-none"
    >
      {toasts.map((toast) => {
        const isSuccess = !toast.variant || toast.variant === 'success';
        const isWarning = toast.variant === 'warning';
        const isError = toast.variant === 'error';

        return (
          <div
            key={toast.id}
            role="status"
            data-testid="toast-notification"
            className={`pointer-events-auto flex items-start gap-3 rounded-2xl liquid-glass animate-toast-enter p-4 shadow-xl ${
              isError ? 'border-red-500/60 dark:border-red-500/60' : ''
            }`}
          >
            <div
              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                isSuccess
                  ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400'
                  : isError
                  ? 'bg-red-600 text-white dark:bg-red-600 dark:text-white'
                  : isWarning
                  ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400'
                  : 'bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400'
              }`}
            >
              {isSuccess ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : isError || isWarning ? (
                <AlertCircle className="h-4 w-4" />
              ) : (
                <Info className="h-4 w-4" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div
                className={`text-xs font-bold ${
                  isError
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-slate-900 dark:text-slate-100'
                }`}
              >
                {toast.title}
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {toast.message}
              </p>
            </div>

            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Đóng thông báo"
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100/70 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
