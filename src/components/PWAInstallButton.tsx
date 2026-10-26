import React, { useState, useEffect } from 'react';
import { Download, Share, PlusSquare, X, WifiOff, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isIOS, isStandalone, promptInstall } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isStandalone) return null;

  return (
    <>
      {(isInstallable || isIOS) && (
        <button
          type="button"
          onClick={() => {
            if (isInstallable) {
              promptInstall();
            } else {
              setShowIOSGuide(true);
            }
          }}
          data-testid="pwa-install-btn"
          className={
            compact
              ? 'inline-flex items-center gap-1.5 rounded-xl liquid-glass px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:border-emerald-500/40 transition-all whitespace-nowrap shrink-0'
              : 'w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl liquid-glass text-xs font-semibold text-slate-700 dark:text-slate-300 hover:border-emerald-500/40 transition-all whitespace-nowrap shrink-0'
          }
          aria-label="Cài đặt ứng dụng KronoFlow"
        >
          <span className="inline-flex items-center gap-2">
            <Download className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Cài đặt ứng dụng</span>
          </span>
          {!compact && (
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
              PWA
            </span>
          )}
        </button>
      )}

      {showIOSGuide && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Hướng dẫn cài đặt ứng dụng KronoFlow"
        >
          <div className="w-full max-w-sm rounded-2xl liquid-glass p-6 shadow-2xl animate-view-enter">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl claude-liquid-btn flex items-center justify-center text-white">
                  <Smartphone className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Cài đặt KronoFlow
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Thêm vào màn hình chính điện thoại
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                aria-label="Đóng hướng dẫn"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200/60 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <ol className="space-y-3 text-xs text-slate-700 dark:text-slate-300">
              <li className="flex items-center gap-3 rounded-xl bg-white/60 dark:bg-slate-900/60 p-3">
                <Share className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>
                  1. Nhấn vào nút <strong>Chia sẻ (Share)</strong> trên thanh trình duyệt Safari.
                </span>
              </li>
              <li className="flex items-center gap-3 rounded-xl bg-white/60 dark:bg-slate-900/60 p-3">
                <PlusSquare className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>
                  2. Cuộn xuống và chọn <strong>Thêm vào Màn hình chính</strong>.
                </span>
              </li>
            </ol>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      role="status"
      data-testid="offline-banner"
      className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full bg-amber-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-lg whitespace-nowrap"
    >
      <WifiOff className="h-3.5 w-3.5" />
      <span>Đang hoạt động ngoại tuyến — dữ liệu lưu trên thiết bị</span>
    </div>
  );
};
