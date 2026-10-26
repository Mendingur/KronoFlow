import React, { useState } from 'react';
import {
  Download,
  Upload,
  RotateCcw,
  Cloud,
  FolderKanban,
  Mail,
  Calendar,
  CheckSquare,
  FileText,
  Presentation,
  ClipboardList,
  Users,
  Video,
  MessageCircle,
  StickyNote,
  ExternalLink,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  Trash2,
  ShieldAlert,
  HardDrive,
  RefreshCw,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  Transaction,
  Habit,
  TaskItem,
  AppBackupData,
  DriveStorageQuota,
  DriveSyncStatus,
} from '../types';
import { validateBackupJson, formatVND, formatDateVN } from '../utils/logic';
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
import {
  listDriveFiles,
  backupToGoogleDrive,
  listRecentGmailMessages,
  listGoogleTasks,
  pushTaskToGoogleTasks,
  listCalendarEvents,
  createCalendarEventFromTask,
  inspectGoogleDoc,
  inspectGoogleSlides,
  inspectGoogleForm,
  listGoogleContacts,
  createGoogleMeetSpace,
  listGoogleChatSpaces,
  listGoogleKeepNotes,
} from '../services/workspace';

interface WorkspaceBackupViewProps {
  user: User | null;
  accessToken: string | null;
  monthlyBudget: number;
  transactions: Transaction[];
  habits: Habit[];
  tasks: TaskItem[];
  driveQuota: DriveStorageQuota | null;
  driveSyncStatus: DriveSyncStatus;
  driveFileId: string | null;
  onSignInGoogle: () => Promise<void>;
  onSyncFirestoreCloud: () => Promise<void>;
  onReadFromDrive: () => Promise<void>;
  onSyncToDrive: () => Promise<void>;
  onTriggerDriveFullSimulation: () => void;
  onTriggerDriveTrashedSimulation: () => void;
  onRestoreBackup: (data: AppBackupData) => void;
  onRequestResetDemo: () => void;
  onRequestConfirmAction: (config: {
    title: string;
    description: string;
    action: () => Promise<void>;
  }) => void;
}

export const WorkspaceBackupView: React.FC<WorkspaceBackupViewProps> = ({
  user,
  accessToken,
  monthlyBudget,
  transactions,
  habits,
  tasks,
  driveQuota,
  driveSyncStatus,
  driveFileId,
  onSignInGoogle,
  onSyncFirestoreCloud,
  onReadFromDrive,
  onSyncToDrive,
  onTriggerDriveFullSimulation,
  onTriggerDriveTrashedSimulation,
  onRestoreBackup,
  onRequestResetDemo,
  onRequestConfirmAction,
}) => {
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [loadingService, setLoadingService] = useState<string | null>(null);

  // GOOGLE_CLIENT_ID State
  const [googleClientIdInput, setGoogleClientIdInput] = useState<string>(() =>
    getConfiguredGoogleClientId()
  );

  // Personal Gemini API Key (LocalStorage Client-side) State
  const [apiKeyInput, setApiKeyInput] = useState<string>(() => getStoredGeminiApiKey());
  const [savedKeyActive, setSavedKeyActive] = useState<boolean>(
    () => getStoredGeminiApiKey().length > 0
  );
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [testingKey, setTestingKey] = useState<boolean>(false);

  const handleSaveApiKey = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      setErrorMessage('Vui lòng dán Gemini API Key cá nhân của bạn trước khi lưu.');
      return;
    }
    setStoredGeminiApiKey(trimmed);
    setSavedKeyActive(true);
    setStatusMessage(
      'Đã lưu Gemini API Key cá nhân vào LocalStorage trên trình duyệt của bạn thành công!'
    );
  };

  const handleClearApiKey = () => {
    setStoredGeminiApiKey('');
    setApiKeyInput('');
    setSavedKeyActive(false);
    setErrorMessage('');
    setStatusMessage('Đã xóa Gemini API Key cá nhân khỏi LocalStorage của thiết bị.');
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
        setStatusMessage(res.message);
      } else {
        setErrorMessage(res.message);
      }
    } finally {
      setTestingKey(false);
    }
  };

  // Workspace Data States
  const [driveFiles, setDriveFiles] = useState<
    Array<{ id: string; name: string; webViewLink?: string }>
  >([]);
  const [gmailList, setGmailList] = useState<
    Array<{ id: string; subject: string; from: string; snippet: string }>
  >([]);
  const [gTasks, setGTasks] = useState<Array<{ id: string; title: string; status: string }>>([]);
  const [calEvents, setCalEvents] = useState<
    Array<{ id: string; summary: string; htmlLink?: string }>
  >([]);
  const [contacts, setContacts] = useState<Array<{ resourceName: string; name: string; email: string }>>([]);
  const [meetLink, setMeetLink] = useState<string>('');
  const [chatSpaces, setChatSpaces] = useState<Array<{ name: string; displayName: string }>>([]);
  const [keepNotes, setKeepNotes] = useState<Array<{ name: string; title: string }>>([]);

  // Inspector IDs for Docs, Slides, Forms
  const [docIdInput, setDocIdInput] = useState('');
  const [docTitleResult, setDocTitleResult] = useState('');
  const [slidesIdInput, setSlidesIdInput] = useState('');
  const [slidesTitleResult, setSlidesTitleResult] = useState('');
  const [formIdInput, setFormIdInput] = useState('');
  const [formTitleResult, setFormTitleResult] = useState('');

  // Export JSON Backup
  const handleExportJson = () => {
    const payload: AppBackupData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      monthlyBudget,
      transactions,
      habits,
      tasks,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `KronoFlow_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatusMessage('Đã tải xuống tệp sao lưu .JSON thành công!');
  };

  // Export CSV for Transactions & Tasks
  const handleExportCsv = () => {
    const headers = ['Loai_Du_Lieu,Noi_Dung,Danh_Muc_Uu_Tien,So_Tien_Trang_Thai,Ngay'];
    for (const tx of transactions) {
      headers.push(
        `Giao_Dich,"${tx.note.replace(/"/g, '""')}",${tx.category},${
          tx.type === 'income' ? '+' : '-'
        }${tx.amount},${tx.date}`
      );
    }
    for (const tsk of tasks) {
      headers.push(
        `Cong_Viec,"${tsk.title.replace(/"/g, '""')}",${tsk.priority},${tsk.status},${tsk.deadline}`
      );
    }
    const csvContent = '\uFEFF' + headers.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `KronoFlow_BaoCao_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setStatusMessage('Đã xuất báo cáo bảng tính .CSV (hỗ trợ tiếng Việt UTF-8) thành công!');
  };

  // Import JSON Backup with Validation + Confirmation
  const handleImportJsonFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMessage('');
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        const validation = validateBackupJson(parsed);
        if (!validation.valid || !validation.payload) {
          setErrorMessage(validation.error || 'Tệp sao lưu không hợp lệ.');
          return;
        }
        const validPayload = validation.payload;
        onRequestConfirmAction({
          title: 'Xác nhận khôi phục dữ liệu từ tệp JSON?',
          description: `Thao tác này sẽ ghi đè dữ liệu hiện tại bằng ${validPayload.transactions.length} giao dịch, ${validPayload.habits.length} thói quen và ${validPayload.tasks.length} công việc từ bản sao lưu.`,
          action: async () => {
            onRestoreBackup(validPayload);
            setStatusMessage('Đã khôi phục dữ liệu từ bản sao lưu JSON thành công!');
          },
        });
      } catch {
        setErrorMessage('Không thể đọc tệp JSON. Vui lòng kiểm tra định dạng tệp.');
      }
    };
    reader.readAsText(file);
  };

  const runWorkspaceCall = async (serviceKey: string, fn: () => Promise<void>) => {
    setErrorMessage('');
    setStatusMessage('');
    setLoadingService(serviceKey);
    try {
      await fn();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi kết nối Google Workspace';
      if (msg === 'NEEDS_AUTH') {
        setErrorMessage(
          'Vui lòng bấm "Đăng nhập với Google" để cấp quyền truy cập Google Workspace.'
        );
      } else {
        setErrorMessage(msg);
      }
    } finally {
      setLoadingService(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Status Banner */}
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

      {/* Client-side Personal Gemini API Key Configuration Section */}
      <section
        data-testid="gemini-api-key-section"
        className="rounded-2xl liquid-glass p-6 space-y-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200/70 dark:border-slate-800">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl claude-liquid-btn flex items-center justify-center text-white shrink-0">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Cài đặt Gemini API Key Cá nhân (Client-side / GitHub Pages)
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Dán khóa API Gemini cá nhân của bạn để kích hoạt toàn bộ tính năng AI trực tiếp từ trình duyệt mà không cần máy chủ phụ trợ.
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
              Khóa Gemini API cá nhân (Lưu trữ cục bộ trong LocalStorage)
            </label>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <input
                  id="personal-gemini-api-key"
                  data-testid="gemini-api-key-input"
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="Dán khóa Gemini API của bạn (ví dụ: AIzaSy...)"
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
                  Lưu vào LocalStorage
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
              <strong>Lưu ý bảo mật Client-side:</strong> Khóa API được lưu trực tiếp trong{' '}
              <code className="font-mono">localStorage</code> trên trình duyệt của riêng bạn để phục vụ phiên bản tĩnh trên GitHub Pages và không bao giờ gửi đi nơi khác ngoài máy chủ Google Gemini. Chỉ nên dán khóa trên thiết bị cá nhân đáng tin cậy. Lấy khóa miễn phí tại{' '}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="font-bold text-emerald-600 dark:text-emerald-400 underline"
              >
                Google AI Studio API Keys
              </a>
              .
            </div>
          </div>
        </form>

        {/* GOOGLE_CLIENT_ID Configuration Form */}
        <div className="pt-4 border-t border-slate-200/70 dark:border-slate-800">
          <label
            htmlFor="google-client-id-setting"
            className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5"
          >
            Cấu hình GOOGLE_CLIENT_ID (Dùng cho Google Identity Services &amp; Drive API v3 trên GitHub Pages)
          </label>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              id="google-client-id-setting"
              data-testid="google-client-id-input"
              type="text"
              value={googleClientIdInput}
              onChange={(e) => setGoogleClientIdInput(e.target.value)}
              placeholder="Ví dụ: 123456789-abc.apps.googleusercontent.com"
              className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 px-3.5 py-2.5 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={() => {
                setConfiguredGoogleClientId(googleClientIdInput);
                setStatusMessage(
                  'Đã lưu GOOGLE_CLIENT_ID vào LocalStorage! Bạn cũng có thể chỉnh trực tiếp trong src/config/constants.ts.'
                );
              }}
              data-testid="save-google-client-id-btn"
              className="rounded-xl liquid-glass px-4 py-2.5 text-xs font-bold text-slate-800 dark:text-slate-100 hover:border-emerald-500/40 whitespace-nowrap shrink-0"
            >
              Lưu GOOGLE_CLIENT_ID
            </button>
          </div>
        </div>
      </section>

      {/* Google Drive Database (finhabit_database.json) & Storage Quota Protection Section */}
      <section
        data-testid="drive-database-section"
        className="rounded-2xl liquid-glass p-6 space-y-5"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200/70 dark:border-slate-800">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl claude-liquid-btn flex items-center justify-center text-white shrink-0">
              <HardDrive className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Cơ sở Dữ liệu Google Drive Cá nhân ({DRIVE_DB_FILENAME}) &amp; Bảo vệ Dung lượng
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Tự động đồng bộ (Auto-save) toàn bộ hồ sơ, lịch sử thu chi, thói quen kỷ luật và công việc vào tệp{' '}
                <code className="font-mono font-bold">{DRIVE_DB_FILENAME}</code> trên Google Drive của bạn.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onReadFromDrive}
              data-testid="settings-read-drive-btn"
              className="inline-flex items-center gap-1.5 rounded-xl liquid-glass px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:border-emerald-500/40 whitespace-nowrap"
            >
              <RefreshCw className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Đọc từ Drive ({DRIVE_DB_FILENAME})</span>
            </button>

            <button
              type="button"
              onClick={onSyncToDrive}
              data-testid="settings-write-drive-btn"
              className="inline-flex items-center gap-1.5 rounded-xl claude-liquid-btn px-4 py-2 text-xs font-bold text-white whitespace-nowrap"
            >
              <HardDrive className="h-3.5 w-3.5" />
              <span>Đồng bộ ngay lên Drive</span>
            </button>
          </div>
        </div>

        {/* Mandatory Important Warning Banner */}
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3.5 text-xs text-slate-800 dark:text-slate-200 flex items-start gap-2.5 leading-relaxed">
          <ShieldAlert className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <strong>{DRIVE_PROTECTION_REMINDER_TEXT}</strong>
            {driveFileId && (
              <div className="mt-1 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                ID tệp trên Drive: {driveFileId} · Trạng thái: {driveSyncStatus}
              </div>
            )}
          </div>
        </div>

        {/* Storage Quota Display & Protection Test Triggers */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
          <div>
            {driveQuota ? (
              <CompactDriveQuotaBar quota={driveQuota} onRefreshQuota={onReadFromDrive} />
            ) : (
              <div className="rounded-xl liquid-glass p-4 text-xs text-slate-600 dark:text-slate-400">
                Đăng nhập Google Drive để hiển thị thanh phần trăm dung lượng{' '}
                <code className="font-mono">storageQuota (usage / limit)</code> thời gian thực.
              </div>
            )}
          </div>

          <div className="rounded-xl liquid-glass p-4 space-y-2.5 text-xs">
            <div className="font-bold text-slate-800 dark:text-slate-200">
              Kiểm thử Cơ chế Bảo vệ Dữ liệu &amp; Cảnh báo Khẩn cấp
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Kiểm tra trực tiếp phản ứng của ứng dụng khi Google Drive bị đầy (&gt;98% / 403) hoặc khi file{' '}
              <code className="font-mono">{DRIVE_DB_FILENAME}</code> bị xóa vào Thùng rác:
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={onTriggerDriveFullSimulation}
                data-testid="simulate-drive-full-btn"
                className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50/70 dark:bg-red-950/40 px-3 py-1.5 text-xs font-bold text-red-700 dark:text-red-300 hover:bg-red-100"
              >
                Mô phỏng Drive Đầy (&gt;98%)
              </button>
              <button
                type="button"
                onClick={onTriggerDriveTrashedSimulation}
                data-testid="simulate-drive-trashed-btn"
                className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/40 px-3 py-1.5 text-xs font-bold text-amber-800 dark:text-amber-300 hover:bg-amber-100"
              >
                Mô phỏng File Drive bị xóa / Thùng rác
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* LocalStorage & JSON / CSV Portability Section */}
      <section className="rounded-2xl liquid-glass p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Lưu trữ & Sao lưu Dữ liệu Đa Nền tảng (JSON / CSV / Cloud)
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Tự động lưu tức thì vào LocalStorage trình duyệt, hỗ trợ xuất/nhập tệp và đồng bộ Firebase Firestore
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

        {/* Cloud Sync Status */}
        <div className="mt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Cloud className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div className="text-xs">
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                Đồng bộ Đám mây Firebase Firestore & Google OAuth
              </div>
              <div className="text-slate-500 dark:text-slate-400">
                {user
                  ? `Đã kết nối tài khoản: ${user.displayName || user.email} (${
                      accessToken ? 'Đã cấp quyền Google Workspace' : 'Chỉ đăng nhập cơ bản'
                    })`
                  : 'Chưa đăng nhập tài khoản Google — Dữ liệu đang được bảo vệ an toàn trong LocalStorage'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {user && (
              <button
                type="button"
                onClick={() =>
                  onRequestConfirmAction({
                    title: 'Đồng bộ dữ liệu lên Firebase Firestore?',
                    description: `Hệ thống sẽ cập nhật hạn mức ${formatVND(
                      monthlyBudget
                    )}, ${transactions.length} giao dịch, ${habits.length} thói quen và ${
                      tasks.length
                    } công việc lên đám mây cá nhân của bạn.`,
                    action: async () => {
                      await onSyncFirestoreCloud();
                      setStatusMessage('Đã đồng bộ toàn bộ dữ liệu lên Firebase Firestore!');
                    },
                  })
                }
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap shrink-0"
              >
                <Cloud className="h-3.5 w-3.5" />
                Đồng bộ lên Firestore ngay
              </button>
            )}

            {!accessToken && (
              <button type="button" onClick={onSignInGoogle} className="gsi-material-button">
                <div className="gsi-material-button-content-wrapper">
                  <div className="gsi-material-button-icon">
                    <svg
                      version="1.1"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 48 48"
                      style={{ display: 'block' }}
                    >
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                      />
                      <path
                        fill="#4285F4"
                        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                      />
                      <path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                      />
                    </svg>
                  </div>
                  <span className="gsi-material-button-contents">Sign in with Google</span>
                </div>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Google Workspace Integrations Hub */}
      <section className="space-y-6">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Trung tâm Kết nối Hệ sinh thái Google Workspace
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Đồng bộ trực tiếp với Google Drive, Gmail, Tasks, Calendar, Docs, Slides, Forms, Contacts, Meet, Chat & Keep
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* 1. Google Drive */}
          <div className="rounded-2xl liquid-glass liquid-glass-interactive p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <FolderKanban className="h-4 w-4 text-emerald-600" />
                  Google Drive
                </h3>
                <span className="text-xs text-slate-400">Sao lưu & Tệp tin</span>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Tải bản sao lưu JSON lên Google Drive hoặc xem danh sách tệp của ứng dụng.
              </p>

              {driveFiles.length > 0 && (
                <ul className="mt-3 space-y-1.5 text-xs border-t border-slate-100 dark:border-slate-800 pt-2">
                  {driveFiles.slice(0, 3).map((f) => (
                    <li key={f.id} className="flex items-center justify-between truncate">
                      <span className="truncate text-slate-700 dark:text-slate-300">{f.name}</span>
                      {f.webViewLink && (
                        <a
                          href={f.webViewLink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-emerald-600 hover:underline ml-2 shrink-0"
                        >
                          Mở
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  runWorkspaceCall('drive-list', async () => {
                    const files = await listDriveFiles();
                    setDriveFiles(files);
                    setStatusMessage(`Đã tải ${files.length} tệp từ Google Drive.`);
                  })
                }
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {loadingService === 'drive-list' ? 'Đang tải...' : 'Xem tệp Drive'}
              </button>
              <button
                type="button"
                onClick={() =>
                  onRequestConfirmAction({
                    title: 'Tải bản sao lưu mới lên Google Drive?',
                    description:
                      'Ứng dụng sẽ tạo một tệp sao lưu JSON chứa toàn bộ giao dịch, thói quen và công việc hiện tại trên Google Drive của bạn.',
                    action: async () => {
                      await runWorkspaceCall('drive-backup', async () => {
                        const created = await backupToGoogleDrive({
                          version: '1.0',
                          exportedAt: new Date().toISOString(),
                          monthlyBudget,
                          transactions,
                          habits,
                          tasks,
                        });
                        setDriveFiles((prev) => [created, ...prev]);
                        setStatusMessage(`Đã sao lưu tệp "${created.name}" lên Google Drive!`);
                      });
                    },
                  })
                }
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Sao lưu lên Drive
              </button>
            </div>
          </div>

          {/* 2. Gmail */}
          <div className="rounded-2xl liquid-glass liquid-glass-interactive p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Mail className="h-4 w-4 text-rose-600" />
                  Gmail Hóa đơn
                </h3>
                <span className="text-xs text-slate-400">Tra cứu biên lai</span>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Tìm nhanh các email chứa từ khóa hóa đơn, biên lai hoặc thanh toán trong hộp thư.
              </p>

              {gmailList.length > 0 && (
                <ul className="mt-3 space-y-1.5 text-xs border-t border-slate-100 dark:border-slate-800 pt-2">
                  {gmailList.slice(0, 3).map((m) => (
                    <li key={m.id} className="truncate text-slate-700 dark:text-slate-300">
                      • {m.subject}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() =>
                  runWorkspaceCall('gmail', async () => {
                    const msgs = await listRecentGmailMessages();
                    setGmailList(msgs);
                    setStatusMessage(`Tìm thấy ${msgs.length} email hóa đơn/giao dịch gần đây.`);
                  })
                }
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {loadingService === 'gmail' ? 'Đang quét hộp thư...' : 'Quét email hóa đơn'}
              </button>
            </div>
          </div>

          {/* 3. Google Tasks */}
          <div className="rounded-2xl liquid-glass liquid-glass-interactive p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <CheckSquare className="h-4 w-4 text-sky-600" />
                  Google Tasks
                </h3>
                <span className="text-xs text-slate-400">Đồng bộ việc cần làm</span>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Xem danh sách Google Tasks hoặc đẩy công việc ưu tiên cao nhất sang Google Tasks.
              </p>

              {gTasks.length > 0 && (
                <ul className="mt-3 space-y-1.5 text-xs border-t border-slate-100 dark:border-slate-800 pt-2">
                  {gTasks.slice(0, 3).map((t) => (
                    <li key={t.id} className="truncate text-slate-700 dark:text-slate-300">
                      • {t.title}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  runWorkspaceCall('gtasks-list', async () => {
                    const items = await listGoogleTasks();
                    setGTasks(items);
                    setStatusMessage(`Đã tải ${items.length} việc từ Google Tasks.`);
                  })
                }
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Xem Google Tasks
              </button>
              {tasks[0] && (
                <button
                  type="button"
                  onClick={() =>
                    onRequestConfirmAction({
                      title: 'Đồng bộ công việc sang Google Tasks?',
                      description: `Bạn có chắc muốn thêm công việc "${tasks[0].title}" vào danh sách Google Tasks cá nhân không?`,
                      action: async () => {
                        await runWorkspaceCall('gtasks-push', async () => {
                          await pushTaskToGoogleTasks(tasks[0]);
                          setStatusMessage(`Đã thêm "${tasks[0].title}" vào Google Tasks!`);
                        });
                      },
                    })
                  }
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  Đẩy việc #1 lên Tasks
                </button>
              )}
            </div>
          </div>

          {/* 4. Google Calendar */}
          <div className="rounded-2xl liquid-glass liquid-glass-interactive p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-indigo-600" />
                  Google Calendar
                </h3>
                <span className="text-xs text-slate-400">Lịch biểu & Nhắc hẹn</span>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Xem sự kiện sắp tới hoặc khóa khung giờ (Time-block) trên Calendar cho việc khẩn cấp.
              </p>

              {calEvents.length > 0 && (
                <ul className="mt-3 space-y-1.5 text-xs border-t border-slate-100 dark:border-slate-800 pt-2">
                  {calEvents.slice(0, 3).map((ev) => (
                    <li key={ev.id} className="truncate text-slate-700 dark:text-slate-300">
                      • {ev.summary}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  runWorkspaceCall('calendar-list', async () => {
                    const events = await listCalendarEvents();
                    setCalEvents(events);
                    setStatusMessage(`Đã tải ${events.length} sự kiện từ Google Calendar.`);
                  })
                }
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Xem lịch sắp tới
              </button>
              {tasks[0] && (
                <button
                  type="button"
                  onClick={() =>
                    onRequestConfirmAction({
                      title: 'Tạo sự kiện mới trên Google Calendar?',
                      description: `Hệ thống sẽ tạo khung giờ làm việc 60 phút cho nhiệm vụ "${tasks[0].title}" trên Google Calendar chính của bạn.`,
                      action: async () => {
                        await runWorkspaceCall('calendar-create', async () => {
                          await createCalendarEventFromTask(tasks[0]);
                          setStatusMessage(
                            `Đã tạo lịch làm việc cho "${tasks[0].title}" trên Google Calendar!`
                          );
                        });
                      },
                    })
                  }
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  Đặt lịch việc khẩn
                </button>
              )}
            </div>
          </div>

          {/* 5. Google Docs, Slides & Forms Inspector */}
          <div className="rounded-2xl liquid-glass liquid-glass-interactive p-5 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-blue-600" />
                  Google Docs · Slides · Forms
                </h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Nhập ID tài liệu để kiểm tra tiêu đề báo cáo dự án (Docs), bài thuyết trình (Slides) hoặc biểu mẫu khảo sát (Forms):
              </p>

              {/* Docs */}
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={docIdInput}
                  onChange={(e) => setDocIdInput(e.target.value)}
                  placeholder="ID Google Docs..."
                  aria-label="Nhập ID Google Docs"
                  className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1 text-xs"
                />
                <button
                  type="button"
                  onClick={() =>
                    runWorkspaceCall('docs', async () => {
                      if (!docIdInput.trim()) return;
                      const docData = await inspectGoogleDoc(docIdInput);
                      setDocTitleResult(docData.title || 'Đã kết nối Google Docs');
                    })
                  }
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-semibold"
                >
                  Đọc Docs
                </button>
              </div>
              {docTitleResult && (
                <div className="text-xs text-emerald-600 truncate">Docs: {docTitleResult}</div>
              )}

              {/* Slides */}
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={slidesIdInput}
                  onChange={(e) => setSlidesIdInput(e.target.value)}
                  placeholder="ID Google Slides..."
                  aria-label="Nhập ID Google Slides"
                  className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1 text-xs"
                />
                <button
                  type="button"
                  onClick={() =>
                    runWorkspaceCall('slides', async () => {
                      if (!slidesIdInput.trim()) return;
                      const slideData = await inspectGoogleSlides(slidesIdInput);
                      setSlidesTitleResult(slideData.title || 'Đã kết nối Google Slides');
                    })
                  }
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-semibold inline-flex items-center gap-1"
                >
                  <Presentation className="h-3 w-3" />
                  Slides
                </button>
              </div>
              {slidesTitleResult && (
                <div className="text-xs text-emerald-600 truncate">Slides: {slidesTitleResult}</div>
              )}

              {/* Forms */}
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={formIdInput}
                  onChange={(e) => setFormIdInput(e.target.value)}
                  placeholder="ID Google Forms..."
                  aria-label="Nhập ID Google Forms"
                  className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1 text-xs"
                />
                <button
                  type="button"
                  onClick={() =>
                    runWorkspaceCall('forms', async () => {
                      if (!formIdInput.trim()) return;
                      const formData = await inspectGoogleForm(formIdInput);
                      setFormTitleResult(formData.info?.title || 'Đã kết nối Google Forms');
                    })
                  }
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-semibold inline-flex items-center gap-1"
                >
                  <ClipboardList className="h-3 w-3" />
                  Forms
                </button>
              </div>
              {formTitleResult && (
                <div className="text-xs text-emerald-600 truncate">Forms: {formTitleResult}</div>
              )}
            </div>
          </div>

          {/* 6. Contacts, Meet, Chat & Keep */}
          <div className="rounded-2xl liquid-glass liquid-glass-interactive p-5 flex flex-col justify-between">
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Users className="h-4 w-4 text-emerald-600" />
                Contacts · Meet · Chat · Keep
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tra cứu danh bạ đối tác, khởi tạo phòng họp Google Meet, kiểm tra không gian Google Chat và Google Keep:
              </p>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    runWorkspaceCall('contacts', async () => {
                      const list = await listGoogleContacts();
                      const formatted = list.map(
                        (c: {
                          resourceName: string;
                          names?: Array<{ displayName?: string }>;
                          emailAddresses?: Array<{ value?: string }>;
                        }) => ({
                          resourceName: c.resourceName,
                          name: c.names?.[0]?.displayName || 'Liên hệ',
                          email: c.emailAddresses?.[0]?.value || '',
                        })
                      );
                      setContacts(formatted);
                      setStatusMessage(`Đã tải ${formatted.length} liên hệ từ Google Contacts.`);
                    })
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-semibold"
                >
                  <Users className="h-3.5 w-3.5" />
                  Danh bạ ({contacts.length})
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onRequestConfirmAction({
                      title: 'Tạo phòng họp Google Meet mới?',
                      description:
                        'Hệ thống sẽ khởi tạo một phòng họp Google Meet mới trên tài khoản của bạn để thảo luận công việc.',
                      action: async () => {
                        await runWorkspaceCall('meet', async () => {
                          const space = await createGoogleMeetSpace();
                          setMeetLink(space.meetingUri || 'https://meet.google.com');
                          setStatusMessage('Đã tạo phòng họp Google Meet thành công!');
                        });
                      },
                    })
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-semibold"
                >
                  <Video className="h-3.5 w-3.5 text-emerald-600" />
                  Tạo Google Meet
                </button>

                <button
                  type="button"
                  onClick={() =>
                    runWorkspaceCall('chat', async () => {
                      const spaces = await listGoogleChatSpaces();
                      setChatSpaces(spaces);
                      setStatusMessage(`Đã tải ${spaces.length} phòng trò chuyện Google Chat.`);
                    })
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-semibold"
                >
                  <MessageCircle className="h-3.5 w-3.5 text-sky-600" />
                  Google Chat ({chatSpaces.length})
                </button>

                <button
                  type="button"
                  onClick={() =>
                    runWorkspaceCall('keep', async () => {
                      const notes = await listGoogleKeepNotes();
                      setKeepNotes(notes);
                      setStatusMessage(`Đã tải ${notes.length} ghi chú từ Google Keep.`);
                    })
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-semibold"
                >
                  <StickyNote className="h-3.5 w-3.5 text-amber-500" />
                  Google Keep ({keepNotes.length})
                </button>
              </div>

              {meetLink && (
                <div className="pt-2">
                  <a
                    href={meetLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Mở phòng họp: {meetLink}
                  </a>
                </div>
              )}

              {contacts.length > 0 && (
                <div className="text-xs text-slate-600 dark:text-slate-300 truncate">
                  Liên hệ gần đây: {contacts.map((c) => c.name).join(', ')}
                </div>
              )}

              {chatSpaces.length > 0 && (
                <div className="text-xs text-slate-600 dark:text-slate-300 truncate">
                  Phòng Chat: {chatSpaces.map((s) => s.displayName || s.name).join(', ')}
                </div>
              )}
            </div>

            <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400">
              Cập nhật lần cuối: {formatDateVN('2026-10-26')}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
