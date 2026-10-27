import React, { useState } from 'react';
import {
  Download,
  Upload,
  RotateCcw,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  Trash2,
  ShieldAlert,
  HardDrive,
  RefreshCw,
} from 'lucide-react';
import {
  Transaction,
  Habit,
  TaskItem,
  AppBackupData,
  DriveStorageQuota,
  DriveSyncStatus,
  UserProfileInfo,
} from '../types';
import { validateBackupJson } from '../utils/logic';
import {
  getStoredGeminiApiKey,
  setStoredGeminiApiKey,
  verifyPersonalGeminiApiKey,
} from '../services/geminiClient';
import {
  DRIVE_DB_FILENAME,
  DRIVE_PROTECTION_REMINDER_TEXT,
  getConfiguredGoogleClientId,
  setConfiguredGoogleClientId,
} from '../config/constants';
import { CompactDriveQuotaBar } from './DriveProtectionModals';

interface SettingsViewProps {
  userProfile: UserProfileInfo | null;
  monthlyBudget: number;
  transactions: Transaction[];
  habits: Habit[];
  tasks: TaskItem[];
  driveQuota: DriveStorageQuota | null;
  driveSyncStatus: DriveSyncStatus;
  driveFileId: string | null;
  onReadFromDrive: () => Promise<void>;
  onSyncToDrive: () => Promise<void>;
  onRestoreBackup: (data: AppBackupData) => void;
  onRequestResetDemo: () => void;
  onRequestConfirmAction: (config: {
    title: string;
    description: string;
    action: () => Promise<void>;
  }) => void;
}

const SYNC_STATUS_LABEL: Record<DriveSyncStatus, string> = {
  disconnected: 'Chưa kết nối',
  syncing: 'Đang đồng bộ',
  synced: 'Đã đồng bộ',
  drive_full_unsynced: 'Chưa đồng bộ (Drive đầy)',
  file_trashed_or_deleted: 'Tệp bị xóa / Thùng rác',
  auth_expired: 'Phiên đăng nhập hết hạn',
  error: 'Lỗi đồng bộ',
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  userProfile,
  monthlyBudget,
  transactions,
  habits,
  tasks,
  driveQuota,
  driveSyncStatus,
  driveFileId,
  onReadFromDrive,
  onSyncToDrive,
  onRestoreBackup,
  onRequestResetDemo,
  onRequestConfirmAction,
}) => {
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [busyAction, setBusyAction] = useState<'read' | 'sync' | null>(null);

  // GOOGLE_CLIENT_ID
  const [googleClientIdInput, setGoogleClientIdInput] = useState<string>(() =>
    getConfiguredGoogleClientId()
  );

  // Khóa Gemini API cá nhân (chỉ lưu trong LocalStorage của trình duyệt này)
  const [apiKeyInput, setApiKeyInput] = useState<string>(() => getStoredGeminiApiKey());
  const [savedKeyActive, setSavedKeyActive] = useState<boolean>(
    () => getStoredGeminiApiKey().length > 0
  );
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [testingKey, setTestingKey] = useState<boolean>(false);

  const notify = (message: string) => {
    setErrorMessage('');
    setStatusMessage(message);
  };
  const fail = (message: string) => {
    setStatusMessage('');
    setErrorMessage(message);
  };

  const handleSaveApiKey = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      fail('Vui lòng dán Gemini API Key cá nhân của bạn trước khi lưu.');
      return;
    }
    setStoredGeminiApiKey(trimmed);
    setSavedKeyActive(true);
    notify('Đã lưu Gemini API Key cá nhân vào LocalStorage trên trình duyệt của bạn!');
  };

  const handleClearApiKey = () => {
    setStoredGeminiApiKey('');
    setApiKeyInput('');
    setSavedKeyActive(false);
    notify('Đã xóa Gemini API Key cá nhân khỏi LocalStorage của thiết bị.');
  };

  const handleTestApiKey = async () => {
    setErrorMessage('');
    setStatusMessage('');
    setTestingKey(true);
    try {
      const res = await verifyPersonalGeminiApiKey(apiKeyInput);
      if (res.ok) {
        setStoredGeminiApiKey(apiKeyInput.trim());
        setSavedKeyActive(true);
        notify(res.message);
      } else {
        fail(res.message);
      }
    } finally {
      setTestingKey(false);
    }
  };

  const runDriveAction = async (kind: 'read' | 'sync', fn: () => Promise<void>) => {
    setBusyAction(kind);
    try {
      await fn();
    } finally {
      setBusyAction(null);
    }
  };

  const handleExportJson = () => {
    const payload: AppBackupData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      monthlyBudget,
      transactions,
      habits,
      tasks,
    };
    downloadBlob(
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
      `KronoFlow_Backup_${new Date().toISOString().slice(0, 10)}.json`
    );
    notify('Đã tải xuống tệp sao lưu .JSON thành công!');
  };

  const handleExportCsv = () => {
    const rows = ['Loai_Du_Lieu,Noi_Dung,Danh_Muc_Uu_Tien,So_Tien_Trang_Thai,Ngay'];
    for (const tx of transactions) {
      rows.push(
        `Giao_Dich,"${tx.note.replace(/"/g, '""')}",${tx.category},${tx.type === 'income' ? '+' : '-'}${
          tx.amount
        },${tx.date}`
      );
    }
    for (const tsk of tasks) {
      rows.push(
        `Cong_Viec,"${tsk.title.replace(/"/g, '""')}",${tsk.priority},${tsk.status},${tsk.deadline}`
      );
    }
    downloadBlob(
      new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' }),
      `KronoFlow_BaoCao_${new Date().toISOString().slice(0, 10)}.csv`
    );
    notify('Đã xuất báo cáo bảng tính .CSV (hỗ trợ tiếng Việt UTF-8) thành công!');
  };

  const handleImportJsonFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    setErrorMessage('');
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        const validation = validateBackupJson(parsed);
        if (!validation.valid || !validation.payload) {
          fail(validation.error || 'Tệp sao lưu không hợp lệ.');
          return;
        }
        const validPayload = validation.payload;
        onRequestConfirmAction({
          title: 'Xác nhận khôi phục dữ liệu từ tệp JSON?',
          description: `Thao tác này sẽ ghi đè dữ liệu hiện tại bằng ${validPayload.transactions.length} giao dịch, ${validPayload.habits.length} thói quen và ${validPayload.tasks.length} công việc từ bản sao lưu.`,
          action: async () => {
            onRestoreBackup(validPayload);
            notify('Đã khôi phục dữ liệu từ bản sao lưu JSON thành công!');
          },
        });
      } catch {
        fail('Không thể đọc tệp JSON. Vui lòng kiểm tra định dạng tệp.');
      }
    };
    reader.readAsText(file);
    input.value = ''; // cho phép chọn lại cùng một tệp
  };

  return (
    <div className="space-y-8">
      {(statusMessage || errorMessage) && (
        <div
          data-testid="settings-status-banner"
          className={`rounded-xl p-4 text-xs font-semibold border ${
            errorMessage
              ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300'
              : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300'
          }`}
        >
          {errorMessage || statusMessage}
        </div>
      )}

      {/* Google Drive: cơ sở dữ liệu cá nhân + dung lượng + nhắc nhở không xóa tệp */}
      <section data-testid="drive-database-section" className="rounded-2xl liquid-glass p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200/70 dark:border-slate-800">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl claude-liquid-btn flex items-center justify-center text-white shrink-0">
              <HardDrive className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Cơ sở dữ liệu trên Google Drive
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {userProfile?.email ? `Tài khoản: ${userProfile.email} · ` : ''}
                Mọi thay đổi được tự động lưu vào tệp{' '}
                <code className="font-mono font-bold">{DRIVE_DB_FILENAME}</code> trong Drive của bạn.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => runDriveAction('read', onReadFromDrive)}
              data-testid="settings-read-drive-btn"
              className="inline-flex items-center gap-1.5 rounded-xl liquid-glass px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:border-emerald-500/40 whitespace-nowrap disabled:opacity-60"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 ${
                  busyAction === 'read' ? 'animate-spin' : ''
                }`}
              />
              <span>Tải lại từ Drive</span>
            </button>

            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => runDriveAction('sync', onSyncToDrive)}
              data-testid="settings-write-drive-btn"
              className="inline-flex items-center gap-1.5 rounded-xl claude-liquid-btn px-4 py-2 text-xs font-bold text-white whitespace-nowrap disabled:opacity-60"
            >
              <HardDrive className="h-3.5 w-3.5" />
              <span>{busyAction === 'sync' ? 'Đang đồng bộ...' : 'Đồng bộ lại'}</span>
            </button>
          </div>
        </div>

        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3.5 text-xs text-slate-800 dark:text-slate-200 flex items-start gap-2.5 leading-relaxed">
          <ShieldAlert className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <strong>{DRIVE_PROTECTION_REMINDER_TEXT}</strong>
            <div className="mt-1 text-[11px] font-mono text-slate-500 dark:text-slate-400 break-all">
              Trạng thái: {SYNC_STATUS_LABEL[driveSyncStatus]}
              {driveFileId ? ` · ID tệp: ${driveFileId}` : ''}
            </div>
          </div>
        </div>

        {driveQuota ? (
          <CompactDriveQuotaBar quota={driveQuota} onRefreshQuota={() => void onReadFromDrive()} />
        ) : (
          <div className="rounded-xl liquid-glass p-4 text-xs text-slate-600 dark:text-slate-400">
            Dung lượng Google Drive sẽ hiển thị ở đây sau khi đồng bộ. (Tài khoản có dung lượng không
            giới hạn sẽ không hiện thanh phần trăm.)
          </div>
        )}
      </section>

      {/* Khóa Gemini API cá nhân + GOOGLE_CLIENT_ID */}
      <section data-testid="gemini-api-key-section" className="rounded-2xl liquid-glass p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200/70 dark:border-slate-800">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl claude-liquid-btn flex items-center justify-center text-white shrink-0">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Gemini API Key cá nhân
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Dán khóa Gemini của riêng bạn để dùng các tính năng AI (huấn luyện viên, nhập nhanh, chia nhỏ việc,
                trợ lý). Không có khóa, ứng dụng vẫn chạy bằng chế độ phân tích cục bộ.
              </p>
            </div>
          </div>

          <div className="shrink-0">
            {savedKeyActive ? (
              <span
                data-testid="api-key-status-active"
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Đã lưu khóa trên máy này
              </span>
            ) : (
              <span
                data-testid="api-key-status-empty"
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-200/70 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400"
              >
                Chưa cài khóa cá nhân
              </span>
            )}
          </div>
        </div>

        <form onSubmit={handleSaveApiKey} className="space-y-4">
          <div>
            <label
              htmlFor="personal-gemini-api-key"
              className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Khóa Gemini API (lưu cục bộ trong LocalStorage của trình duyệt này)
            </label>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <input
                  id="personal-gemini-api-key"
                  data-testid="gemini-api-key-input"
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="Dán khóa Gemini API của bạn tại đây"
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 pl-3.5 pr-10 py-2.5 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((prev) => !prev)}
                  aria-label={showApiKey ? 'Ẩn khóa API' : 'Hiện khóa API'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="submit"
                  data-testid="save-gemini-key-btn"
                  className="inline-flex items-center gap-1.5 rounded-xl claude-liquid-btn px-4 py-2.5 text-xs font-bold text-white whitespace-nowrap"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Lưu khóa
                </button>

                <button
                  type="button"
                  onClick={handleTestApiKey}
                  disabled={testingKey}
                  data-testid="test-gemini-key-btn"
                  className="inline-flex items-center gap-1.5 rounded-xl liquid-glass px-3.5 py-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:border-emerald-500/40 whitespace-nowrap disabled:opacity-50"
                >
                  {testingKey ? 'Đang kiểm tra...' : 'Kiểm tra kết nối'}
                </button>

                {savedKeyActive && (
                  <button
                    type="button"
                    onClick={handleClearApiKey}
                    data-testid="clear-gemini-key-btn"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 dark:border-red-900/60 px-3 py-2.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 whitespace-nowrap"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Xóa khóa
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 p-3 text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">
            <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong>Lưu ý bảo mật:</strong> Khóa chỉ nằm trong <code className="font-mono">localStorage</code>{' '}
              của trình duyệt này và chỉ được gửi tới máy chủ Google Gemini. Chỉ nên dán khóa trên thiết bị cá
              nhân đáng tin cậy. Lấy khóa miễn phí tại{' '}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="font-bold text-emerald-600 dark:text-emerald-400 underline"
              >
                Google AI Studio
              </a>
              .
            </div>
          </div>
        </form>

        <div className="pt-4 border-t border-slate-200/70 dark:border-slate-800">
          <label
            htmlFor="google-client-id-setting"
            className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5"
          >
            GOOGLE_CLIENT_ID (OAuth Client ID loại Web application, dùng để đăng nhập Google &amp; Drive)
          </label>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              id="google-client-id-setting"
              data-testid="google-client-id-input"
              type="text"
              value={googleClientIdInput}
              onChange={(e) => setGoogleClientIdInput(e.target.value)}
              placeholder="xxxxxxxx.apps.googleusercontent.com"
              spellCheck={false}
              className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 px-3.5 py-2.5 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={() => {
                setConfiguredGoogleClientId(googleClientIdInput);
                notify('Đã lưu GOOGLE_CLIENT_ID. Giá trị mới sẽ được dùng ở lần đăng nhập tiếp theo.');
              }}
              data-testid="save-google-client-id-btn"
              className="rounded-xl liquid-glass px-4 py-2.5 text-xs font-bold text-slate-800 dark:text-slate-100 hover:border-emerald-500/40 whitespace-nowrap shrink-0"
            >
              Lưu GOOGLE_CLIENT_ID
            </button>
          </div>
        </div>
      </section>

      {/* Xuất / nhập tệp sao lưu */}
      <section className="rounded-2xl liquid-glass p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Sao lưu thủ công (JSON / CSV)
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Ngoài Google Drive, bạn có thể tải một bản sao dữ liệu về máy hoặc nạp lại từ tệp đã lưu.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleExportJson}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              Xuất dữ liệu (.JSON)
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              Xuất bảng tính (.CSV)
            </button>

            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors whitespace-nowrap shrink-0">
              <Upload className="h-3.5 w-3.5 text-emerald-600" />
              <span>Nhập dữ liệu (.JSON)</span>
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleImportJsonFile}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={onRequestResetDemo}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-900/60 px-4 py-2 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Khôi phục dữ liệu mẫu
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
