import React, { useState } from 'react';
import {
  HardDrive,
  AlertTriangle,
  RefreshCw,
  RotateCcw,
  ExternalLink,
  ShieldAlert,
  CheckCircle2,
  CloudOff,
  ChevronDown,
  ChevronUp,
  X,
  FileWarning,
} from 'lucide-react';
import {
  DRIVE_DB_FILENAME,
  DRIVE_PROTECTION_REMINDER_TEXT,
  DRIVE_FULL_ERROR_MESSAGE,
  getConfiguredGoogleClientId,
  setConfiguredGoogleClientId,
} from '../config/constants';
import {
  getStoredGeminiApiKey,
  setStoredGeminiApiKey,
} from '../services/geminiClient';
import { formatBytesVN } from '../services/driveDatabase';
import { DriveStorageQuota, DriveSyncStatus } from '../types';

// 1. Compact Google Drive Storage Quota Progress Bar (for Sidebar & Settings)
export const CompactDriveQuotaBar: React.FC<{
  quota: DriveStorageQuota | null;
  onRefreshQuota?: () => void;
}> = ({ quota, onRefreshQuota }) => {
  if (!quota || quota.limit <= 0) return null;

  const barColor =
    quota.isFull || quota.isNearFull
      ? 'bg-red-600'
      : quota.percentage >= 85
      ? 'bg-amber-500'
      : 'bg-emerald-600 dark:bg-emerald-500';

  return (
    <div
      data-testid="drive-quota-bar"
      className="rounded-xl liquid-glass p-3 space-y-1.5 text-xs"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
          <HardDrive className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>Dung lượng Drive</span>
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            data-testid="drive-quota-percent"
            className={`font-mono font-bold whitespace-nowrap ${
              quota.isFull || quota.isNearFull
                ? 'text-red-600 dark:text-red-400'
                : 'text-slate-700 dark:text-slate-300'
            }`}
          >
            {quota.percentage}%
          </span>
          {onRefreshQuota && (
            <button
              type="button"
              onClick={onRefreshQuota}
              aria-label="Kiểm tra lại dung lượng Google Drive"
              className="p-0.5 rounded hover:bg-slate-200/60 dark:hover:bg-slate-800 text-slate-500"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <div className="h-2 w-full rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${Math.min(100, Math.max(2, quota.percentage))}%` }}
        />
      </div>

      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 font-mono whitespace-nowrap">
        <span>Đã dùng: {formatBytesVN(quota.usage)}</span>
        <span>/ {formatBytesVN(quota.limit)}</span>
      </div>

      {(quota.isFull || quota.isNearFull) && (
        <div className="text-[11px] font-bold text-red-600 dark:text-red-400 flex items-center gap-1 pt-0.5">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>Drive đã đầy (&gt;98%)!</span>
        </div>
      )}
    </div>
  );
};

// 2. Corner / Header Sync Status Badge + Reminder Tooltip
export const DriveSyncStatusBadge: React.FC<{
  syncStatus: DriveSyncStatus;
  onOpenLoginModal: () => void;
  onRetrySync: () => void;
  onOpenTrashedModal: () => void;
}> = ({ syncStatus, onOpenLoginModal, onRetrySync, onOpenTrashedModal }) => {
  if (syncStatus === 'drive_full_unsynced') {
    return (
      <button
        type="button"
        onClick={onRetrySync}
        data-testid="drive-sync-status-badge"
        title={DRIVE_FULL_ERROR_MESSAGE}
        className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-red-700 transition-colors whitespace-nowrap shrink-0"
      >
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span>Chưa đồng bộ (Drive đầy)</span>
      </button>
    );
  }

  if (syncStatus === 'file_trashed_or_deleted') {
    return (
      <button
        type="button"
        onClick={onOpenTrashedModal}
        data-testid="drive-sync-status-badge"
        className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-red-700 transition-colors whitespace-nowrap shrink-0"
      >
        <FileWarning className="h-3.5 w-3.5 shrink-0" />
        <span>File Drive bị xóa / Thùng rác</span>
      </button>
    );
  }

  if (syncStatus === 'syncing') {
    return (
      <span
        data-testid="drive-sync-status-badge"
        className="inline-flex items-center gap-1.5 rounded-xl liquid-glass px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 whitespace-nowrap shrink-0"
      >
        <RefreshCw className="h-3.5 w-3.5 animate-spin text-emerald-600 dark:text-emerald-400 shrink-0" />
        <span>Đang lưu {DRIVE_DB_FILENAME}...</span>
      </span>
    );
  }

  if (syncStatus === 'synced') {
    return (
      <button
        type="button"
        onClick={onRetrySync}
        data-testid="drive-sync-status-badge"
        title={DRIVE_PROTECTION_REMINDER_TEXT}
        className="inline-flex items-center gap-1.5 rounded-xl liquid-glass px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:border-emerald-500/40 transition-colors whitespace-nowrap shrink-0"
      >
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <span className="hidden sm:inline">Đã đồng bộ Drive ({DRIVE_DB_FILENAME})</span>
        <span className="sm:hidden">Đã lưu Drive</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpenLoginModal}
      data-testid="drive-sync-status-badge"
      className="inline-flex items-center gap-1.5 rounded-xl liquid-glass px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:border-emerald-500/40 transition-colors whitespace-nowrap shrink-0"
    >
      <CloudOff className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
      <span className="hidden sm:inline">Kết nối Google Drive</span>
      <span className="sm:hidden">Drive</span>
    </button>
  );
};

// 3. Persistent Reminder Banner at Top of Dashboard / Corner
export const DriveProtectionReminderBanner: React.FC<{
  syncStatus: DriveSyncStatus;
  onDismiss?: () => void;
}> = ({ syncStatus, onDismiss }) => {
  return (
    <div
      data-testid="drive-file-protection-reminder"
      className={`rounded-2xl p-3.5 text-xs border flex items-start justify-between gap-3 ${
        syncStatus === 'drive_full_unsynced' || syncStatus === 'file_trashed_or_deleted'
          ? 'bg-red-50/90 dark:bg-red-950/50 border-red-300 dark:border-red-800 text-red-800 dark:text-red-200'
          : 'liquid-glass text-slate-700 dark:text-slate-300'
      }`}
    >
      <div className="flex items-start gap-2.5 leading-relaxed">
        <ShieldAlert className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold">{DRIVE_PROTECTION_REMINDER_TEXT}</span>
        </div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Ẩn thông báo nhắc nhở"
          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
};

// 4. Welcome / Sign-In Gate Modal ("Đăng nhập bằng Google để kết nối Google Drive của bạn")
export const DriveAuthWelcomeModal: React.FC<{
  open: boolean;
  loading: boolean;
  errorMessage?: string;
  onSignInGoogleDrive: () => Promise<void>;
  onContinueLocalMode: () => void;
}> = ({
  open,
  loading,
  errorMessage,
  onSignInGoogleDrive,
  onContinueLocalMode,
}) => {
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);
  const [clientIdInput, setClientIdInput] = useState(() => getConfiguredGoogleClientId());
  const [geminiKeyInput, setGeminiKeyInput] = useState(() => getStoredGeminiApiKey());
  const [configSavedMsg, setConfigSavedMsg] = useState('');

  if (!open) return null;

  const handleSaveQuickConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setConfiguredGoogleClientId(clientIdInput);
    setStoredGeminiApiKey(geminiKeyInput);
    setConfigSavedMsg('Đã lưu GOOGLE_CLIENT_ID & Gemini API Key vào LocalStorage!');
  };

  return (
    <div
      data-testid="drive-login-gate-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Đăng nhập bằng Google để kết nối Google Drive của bạn"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div className="w-full max-w-lg rounded-2xl liquid-glass p-6 sm:p-7 shadow-2xl space-y-5 animate-view-enter my-auto">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src={`${import.meta.env.BASE_URL}icon.svg`}
              alt="KronoFlow"
              className="h-11 w-11 shrink-0"
            />
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Đăng nhập bằng Google để kết nối Google Drive của bạn
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                KronoFlow — Cơ sở dữ liệu cá nhân lưu trực tiếp trên Google Drive của bạn
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onContinueLocalMode}
            aria-label="Đóng cửa sổ đăng nhập"
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mandatory Important Warning Box */}
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3.5 text-xs text-slate-800 dark:text-slate-200 leading-relaxed flex items-start gap-2.5">
          <ShieldAlert className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <strong>{DRIVE_PROTECTION_REMINDER_TEXT}</strong>
          </div>
        </div>

        <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
          <li className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>
              Tự động tìm hoặc khởi tạo tệp{' '}
              <code className="font-mono font-bold text-slate-900 dark:text-slate-100">
                {DRIVE_DB_FILENAME}
              </code>{' '}
              trên Google Drive cá nhân của bạn.
            </span>
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>
              Tự động lưu (Auto-save) mọi khoản thu chi, chuỗi thói quen kỷ luật và công việc hằng ngày.
            </span>
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>
              Kiểm tra dung lượng Drive tự động và chống mất dữ liệu khi xóa nhầm hoặc đầy bộ nhớ.
            </span>
          </li>
        </ul>

        {errorMessage && (
          <div className="rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 p-3 text-xs font-semibold text-red-700 dark:text-red-300">
            {errorMessage}
          </div>
        )}

        {/* Primary Google Drive Sign-In Action */}
        <div className="space-y-2.5 pt-1">
          <button
            type="button"
            disabled={loading}
            onClick={onSignInGoogleDrive}
            data-testid="google-drive-login-btn"
            className="w-full flex items-center justify-center gap-3 rounded-xl claude-liquid-btn px-5 py-3.5 text-sm font-bold text-white shadow-md transition-all disabled:opacity-60"
          >
            <HardDrive className="h-4 w-4 shrink-0" />
            <span>
              {loading
                ? 'Đang kết nối Google Drive...'
                : 'Đăng nhập bằng Google để kết nối Google Drive của bạn'}
            </span>
          </button>

          <button
            type="button"
            onClick={onContinueLocalMode}
            data-testid="skip-drive-login-btn"
            className="w-full rounded-xl liquid-glass px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:border-emerald-500/40 transition-colors"
          >
            Tạm dùng dữ liệu cục bộ trên trình duyệt (Kết nối Google Drive sau)
          </button>
        </div>

        {/* Optional Client ID & Gemini API Key Configuration Accordion */}
        <div className="border-t border-slate-200/70 dark:border-slate-800 pt-3">
          <button
            type="button"
            onClick={() => setShowAdvancedConfig((prev) => !prev)}
            className="w-full flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          >
            <span>Tùy chỉnh GOOGLE_CLIENT_ID &amp; Gemini API Key cá nhân (GitHub Pages)</span>
            {showAdvancedConfig ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>

          {showAdvancedConfig && (
            <form onSubmit={handleSaveQuickConfig} className="mt-3 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  GOOGLE_CLIENT_ID (OAuth 2.0 Web Client ID)
                </label>
                <input
                  type="text"
                  value={clientIdInput}
                  onChange={(e) => setClientIdInput(e.target.value)}
                  placeholder="xxxx.apps.googleusercontent.com"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Gemini API Key cá nhân (Lưu vào LocalStorage)
                </label>
                <input
                  type="password"
                  value={geminiKeyInput}
                  onChange={(e) => setGeminiKeyInput(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900 px-3 py-2 font-mono text-xs"
                />
              </div>

              {configSavedMsg && (
                <div className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  {configSavedMsg}
                </div>
              )}

              <button
                type="submit"
                className="rounded-lg bg-slate-900 dark:bg-slate-700 px-3.5 py-2 text-xs font-bold text-white"
              >
                Lưu cấu hình Client-side
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

// 5. Red Alert Modal when finhabit_database.json is Trashed or Deleted on Google Drive
export const DriveTrashedOrDeletedModal: React.FC<{
  open: boolean;
  restoring: boolean;
  onRestoreToDrive: () => Promise<void>;
  onClose: () => void;
}> = ({ open, restoring, onRestoreToDrive, onClose }) => {
  if (!open) return null;

  return (
    <div
      data-testid="drive-trashed-modal"
      role="alertdialog"
      aria-modal="true"
      aria-label="Cảnh báo file dữ liệu Google Drive bị xóa hoặc nằm trong Thùng rác"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4"
    >
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border-2 border-red-600 p-6 shadow-2xl space-y-4 animate-view-enter">
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 rounded-xl bg-red-600 flex items-center justify-center text-white shrink-0">
            <FileWarning className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-red-600 dark:text-red-400">
              Cảnh báo Khẩn cấp: Không tìm thấy hoặc File dữ liệu đã bị đưa vào Thùng rác!
            </h3>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Hệ thống phát hiện tệp gốc{' '}
              <code className="font-mono font-bold text-red-600 dark:text-red-400">
                {DRIVE_DB_FILENAME}
              </code>{' '}
              trên Google Drive của bạn đã bị đưa vào Thùng rác (<code className="font-mono">trashed: true</code>) hoặc bị xóa mất.
            </p>
          </div>
        </div>

        <div className="rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 p-3.5 text-xs text-red-800 dark:text-red-200 leading-relaxed">
          Rất may, trình duyệt của bạn vẫn đang giữ bản sao lưu tạm thời an toàn trong{' '}
          <strong>LocalStorage</strong>. Nhấn nút bên dưới để khôi phục lại tệp{' '}
          <code className="font-mono font-bold">{DRIVE_DB_FILENAME}</code> lên Google Drive ngay lập tức!
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300"
          >
            Để sau (Giữ trong LocalStorage)
          </button>

          <button
            type="button"
            disabled={restoring}
            onClick={onRestoreToDrive}
            data-testid="restore-to-drive-btn"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 px-5 py-2.5 text-xs font-bold text-white shadow-md transition-colors disabled:opacity-60"
          >
            <RotateCcw className={`h-4 w-4 ${restoring ? 'animate-spin' : ''}`} />
            <span>{restoring ? 'Đang khôi phục...' : 'Khôi phục lại lên Drive'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// 6. Emergency Drive Quota Full Modal (when usage >= limit, > 98%, or HTTP 403 storageQuotaExceeded)
export const DriveQuotaExceededModal: React.FC<{
  open: boolean;
  quota: DriveStorageQuota | null;
  retrying: boolean;
  onRetrySync: () => Promise<void>;
  onClose: () => void;
}> = ({ open, quota, retrying, onRetrySync, onClose }) => {
  if (!open) return null;

  return (
    <div
      data-testid="drive-quota-modal"
      role="alertdialog"
      aria-modal="true"
      aria-label="Cảnh báo bộ nhớ Google Drive đã đầy"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4"
    >
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border-2 border-red-600 p-6 shadow-2xl space-y-4 animate-view-enter">
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 rounded-xl bg-red-600 flex items-center justify-center text-white shrink-0">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-red-600 dark:text-red-400">
              Cảnh báo Khẩn cấp: Bộ nhớ Google Drive đã đầy!
            </h3>
            <p
              data-testid="drive-full-modal-message"
              className="mt-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 leading-relaxed"
            >
              {DRIVE_FULL_ERROR_MESSAGE}
            </p>
          </div>
        </div>

        {quota && quota.limit > 0 && (
          <div className="rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 p-3 space-y-1.5 text-xs">
            <div className="flex items-center justify-between font-bold text-red-700 dark:text-red-300">
              <span>Dung lượng Drive đã sử dụng:</span>
              <span className="font-mono">{quota.percentage}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-red-200 dark:bg-red-900 overflow-hidden">
              <div
                className="h-full bg-red-600"
                style={{ width: `${Math.min(100, quota.percentage)}%` }}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-red-600 dark:text-red-300">
              <span className="whitespace-nowrap">Đã dùng: {formatBytesVN(quota.usage)}</span>
              <span className="whitespace-nowrap">Thùng rác: {formatBytesVN(quota.usageInDriveTrash)}</span>
              <span className="whitespace-nowrap">Tổng: {formatBytesVN(quota.limit)}</span>
            </div>
          </div>
        )}

        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
          <strong>An toàn dữ liệu:</strong> Thao tác vừa nhập của bạn đã được{' '}
          <strong>giữ tạm an toàn trong LocalStorage</strong> của trình duyệt và gắn nhãn{' '}
          <span className="font-bold text-red-600 dark:text-red-400">
            &ldquo;Chưa đồng bộ (Drive đầy)&rdquo;
          </span>{' '}
          để bạn không bị mất bất kỳ dữ liệu nào vừa gõ.
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
          <a
            href="https://drive.google.com/drive/trash"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>Mở Thùng rác Drive</span>
          </a>

          <button
            type="button"
            onClick={onClose}
            data-testid="close-drive-quota-modal-btn"
            className="rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300"
          >
            Đóng (Lưu tạm trên máy)
          </button>

          <button
            type="button"
            disabled={retrying}
            onClick={onRetrySync}
            data-testid="retry-drive-sync-btn"
            className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 hover:bg-red-700 px-4 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`} />
            <span>{retrying ? 'Đang thử lại...' : 'Thử lại ngay'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
