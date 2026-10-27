/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  LayoutDashboard,
  Wallet,
  Flame,
  ListTodo,
  Bot,
  CloudCog,
  Sun,
  Moon,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import {
  Transaction,
  Habit,
  TaskItem,
  AppBackupData,
  DriveStorageQuota,
  DriveSyncStatus,
  KronoFlowDatabase,
  UserProfileInfo,
} from './types';
import {
  INITIAL_MONTHLY_BUDGET,
  INITIAL_TRANSACTIONS,
  INITIAL_HABITS,
  INITIAL_TASKS,
} from './utils/seedData';
import {
  formatVND,
  calculateMonthlyFinance,
  calculateDisciplineMetrics,
  calculateTaskMetrics,
  getLocalTodayISO,
} from './utils/logic';
import {
  DriveError,
  checkDriveQuota,
  clearDriveSession,
  getKnownDriveFileId,
  hasActiveDriveSession,
  readOrCreateDatabase,
  restoreDatabaseFromLocal,
  setKnownDriveFileId,
  signInWithGoogleDrive,
  untrashDatabaseFile,
  writeDatabase,
} from './services/googleDriveService';
import {
  DATABASE_VERSION,
  LocalSnapshot,
  clearLocalSnapshot,
  databaseContentHash,
  isLocalModeEnabled,
  loadLocalOnlyDatabase,
  loadLocalSnapshot,
  saveLocalOnlyDatabase,
  saveLocalSnapshot,
  setLocalModeEnabled,
} from './services/localDatabase';
import {
  DRIVE_DB_FILENAME,
  DRIVE_FULL_ERROR_MESSAGE,
  DRIVE_NEAR_FULL_MESSAGE,
  DRIVE_PROTECTION_REMINDER_TEXT,
} from './config/constants';
import { OverviewView } from './components/OverviewView';
import { ExpenseTrackerView } from './components/ExpenseTrackerView';
import { HabitTrackerView } from './components/HabitTrackerView';
import { TaskListView } from './components/TaskListView';
import { AiChatView } from './components/AiChatView';
import { SettingsView } from './components/SettingsView';
import { ConfirmDialog } from './components/ConfirmDialog';
import { ToastContainer, ToastItem } from './components/ToastContainer';
import { PWAInstallButton, OfflineIndicator } from './components/PWAInstallButton';
import {
  CompactDriveQuotaBar,
  DriveAuthWelcomeScreen,
  DriveProtectionReminderBanner,
  DriveQuotaExceededModal,
  DriveSyncStatusBadge,
  DriveTrashedOrDeletedModal,
} from './components/DriveProtectionModals';

type NavTab = 'overview' | 'expenses' | 'habits' | 'tasks' | 'chat' | 'settings';
type AuthPhase = 'signed_out' | 'loading' | 'ready';

const THEME_STORAGE_KEY = 'kronoflow_theme_v1';
const SYNC_DEBOUNCE_MS = 700;
const MAX_SYNC_PASSES = 5;
const ERROR_TOAST_COOLDOWN_MS = 15_000;

function readStoredTheme(): boolean {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'dark';
  } catch {
    return false;
  }
}

function accountKeyOf(profile: UserProfileInfo): string {
  return profile.email || profile.name || 'unknown';
}

function createSeedDatabase(profile?: UserProfileInfo): KronoFlowDatabase {
  return {
    version: DATABASE_VERSION,
    lastUpdated: new Date().toISOString(),
    userProfile: profile,
    settings: { darkMode: readStoredTheme() },
    budgets: { monthlyBudget: INITIAL_MONTHLY_BUDGET },
    transactions: INITIAL_TRANSACTIONS,
    habits: INITIAL_HABITS,
    todos: INITIAL_TASKS,
  };
}

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [previousTab, setPreviousTab] = useState<NavTab>('overview');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [todayISO, setTodayISO] = useState<string>(() => getLocalTodayISO());

  // Chế độ "Dùng không cần đăng nhập": dữ liệu chỉ nằm trong LocalStorage của trình duyệt này
  const [bootLocalDb] = useState<KronoFlowDatabase | null>(() =>
    isLocalModeEnabled() ? loadLocalOnlyDatabase() ?? createSeedDatabase() : null
  );
  const [storageMode, setStorageMode] = useState<'drive' | 'local'>(() =>
    bootLocalDb ? 'local' : 'drive'
  );

  const [darkMode, setDarkMode] = useState<boolean>(() =>
    bootLocalDb ? bootLocalDb.settings.darkMode : readStoredTheme()
  );

  // Dữ liệu ứng dụng — nguồn sự thật là tệp kronoflow_database.json trên Google Drive của người dùng
  const [monthlyBudget, setMonthlyBudget] = useState<number>(
    bootLocalDb?.budgets.monthlyBudget ?? INITIAL_MONTHLY_BUDGET
  );
  const [transactions, setTransactions] = useState<Transaction[]>(
    bootLocalDb?.transactions ?? INITIAL_TRANSACTIONS
  );
  const [habits, setHabits] = useState<Habit[]>(bootLocalDb?.habits ?? INITIAL_HABITS);
  const [tasks, setTasks] = useState<TaskItem[]>(bootLocalDb?.todos ?? INITIAL_TASKS);

  // Đăng nhập Google & trạng thái đồng bộ Drive
  const [authPhase, setAuthPhase] = useState<AuthPhase>(() => (bootLocalDb ? 'ready' : 'signed_out'));
  const [authError, setAuthError] = useState<string>('');
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);
  const [userProfile, setUserProfile] = useState<UserProfileInfo | null>(null);
  const [driveFileId, setDriveFileId] = useState<string | null>(() => getKnownDriveFileId());
  const [driveQuota, setDriveQuota] = useState<DriveStorageQuota | null>(null);
  const [driveSyncStatus, setDriveSyncStatus] = useState<DriveSyncStatus>('disconnected');
  const [isDriveRestoring, setIsDriveRestoring] = useState<boolean>(false);
  const [isDriveRetrying, setIsDriveRetrying] = useState<boolean>(false);

  const [showDriveTrashedModal, setShowDriveTrashedModal] = useState<boolean>(false);
  const [showDriveQuotaModal, setShowDriveQuotaModal] = useState<boolean>(false);
  const [showProtectionReminder, setShowProtectionReminder] = useState<boolean>(true);

  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({
    open: false,
    title: '',
    description: '',
    onConfirm: () => {},
  });

  // Refs điều khiển bộ máy đồng bộ (không gây render lại)
  const accountKeyRef = useRef<string>('');
  const driveReadyRef = useRef<boolean>(false); // đã đọc Drive thành công → mới được tự động ghi
  const localTrustedRef = useRef<boolean>(false); // bản đệm LocalStorage thuộc đúng tài khoản đang đăng nhập
  const lastSyncedHashRef = useRef<string>('');
  const inFlightRef = useRef<boolean>(false);
  const latestDbRef = useRef<KronoFlowDatabase | null>(null);
  const trashedFileIdRef = useRef<string | undefined>(undefined);
  const quotaAlertShownRef = useRef<boolean>(false);
  const nearFullWarnedRef = useRef<boolean>(false);
  const authExpiredToastedRef = useRef<boolean>(false);
  const lastErrorToastAtRef = useRef<number>(0);

  const addToast = useCallback(
    (title: string, message: string, variant: ToastItem['variant'] = 'success') => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-3), { id, title, message, variant }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 6000);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleSelectTab = (tab: NavTab) => {
    if (tab !== 'chat') {
      setPreviousTab(tab);
    }
    setActiveTab(tab);
    setIsMobileMenuOpen(false);
  };

  // Cập nhật "hôm nay" khi qua nửa đêm mà vẫn mở ứng dụng
  useEffect(() => {
    const id = window.setInterval(() => {
      setTodayISO((prev) => {
        const next = getLocalTodayISO();
        return next === prev ? prev : next;
      });
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Đồng bộ class Sáng/Tối lên <html>
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', darkMode);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, darkMode ? 'dark' : 'light');
    } catch {
      // Bỏ qua lỗi truy cập storage
    }
  }, [darkMode]);

  const database = useMemo<KronoFlowDatabase>(
    () => ({
      version: DATABASE_VERSION,
      lastUpdated: new Date().toISOString(),
      userProfile: userProfile ?? undefined,
      settings: { darkMode },
      budgets: { monthlyBudget },
      transactions,
      habits,
      todos: tasks,
    }),
    [userProfile, darkMode, monthlyBudget, transactions, habits, tasks]
  );

  const persistLocal = useCallback((db: KronoFlowDatabase, pendingSync: boolean) => {
    if (!accountKeyRef.current) return;
    saveLocalSnapshot({
      account: accountKeyRef.current,
      pendingSync,
      savedAt: new Date().toISOString(),
      db,
    });
  }, []);

  const applyDatabase = useCallback((db: KronoFlowDatabase, markSynced: boolean) => {
    lastSyncedHashRef.current = markSynced ? databaseContentHash(db) : '';
    setMonthlyBudget(db.budgets.monthlyBudget);
    setTransactions(db.transactions);
    setHabits(db.habits);
    setTasks(db.todos);
    setDarkMode(db.settings.darkMode);
  }, []);

  // ───────── Cảnh báo dung lượng / tệp bị xóa / lỗi ─────────

  const reportQuota = useCallback(
    (quota: DriveStorageQuota | null) => {
      if (!quota) return;
      setDriveQuota(quota);
      if (quota.isNearFull && !quota.isFull) {
        if (!nearFullWarnedRef.current) {
          nearFullWarnedRef.current = true;
          setShowDriveQuotaModal(true);
          addToast('Google Drive sắp đầy', DRIVE_NEAR_FULL_MESSAGE, 'warning');
        }
      } else if (!quota.isNearFull) {
        nearFullWarnedRef.current = false;
      }
    },
    [addToast]
  );

  const flagDriveFull = useCallback(
    (quota: DriveStorageQuota | null) => {
      // Một lỗi 403 storageQuotaExceeded nghĩa là đã đầy, kể cả khi số liệu dung lượng chưa phản ánh
      if (quota) setDriveQuota(quota.isFull ? quota : { ...quota, isFull: true, isNearFull: true });
      setDriveSyncStatus('drive_full_unsynced');
      if (!quotaAlertShownRef.current) {
        quotaAlertShownRef.current = true;
        setShowDriveQuotaModal(true);
        addToast('Bộ nhớ Google Drive đã đầy!', DRIVE_FULL_ERROR_MESSAGE, 'error');
      }
    },
    [addToast]
  );

  const flagTrashed = useCallback(
    (trashedFileId?: string) => {
      driveReadyRef.current = false; // chặn tự động ghi cho tới khi người dùng khôi phục
      trashedFileIdRef.current = trashedFileId;
      setDriveSyncStatus('file_trashed_or_deleted');
      setShowDriveTrashedModal(true);
      addToast(
        `Cảnh báo: File ${DRIVE_DB_FILENAME} bị xóa!`,
        `Tệp ${DRIVE_DB_FILENAME} trên Google Drive đã bị xóa hoặc nằm trong Thùng rác. Hãy nhấn "Khôi phục dữ liệu lên Google Drive".`,
        'error'
      );
    },
    [addToast]
  );

  const handleDriveError = useCallback(
    (err: unknown) => {
      if (err instanceof DriveError) {
        if (err.code === 'AUTH_REQUIRED') {
          setDriveSyncStatus('auth_expired');
          if (!authExpiredToastedRef.current) {
            authExpiredToastedRef.current = true;
            addToast(
              'Phiên đăng nhập Google đã hết hạn',
              'Dữ liệu vừa nhập vẫn được giữ trên thiết bị. Nhấn "Phiên hết hạn — Đăng nhập lại" để tiếp tục đồng bộ.',
              'warning'
            );
          }
          return;
        }
        if (err.code === 'QUOTA_EXCEEDED') {
          flagDriveFull(null);
          return;
        }
      }
      setDriveSyncStatus('error');
      const now = Date.now();
      if (now - lastErrorToastAtRef.current > ERROR_TOAST_COOLDOWN_MS) {
        lastErrorToastAtRef.current = now;
        addToast(
          'Chưa thể đồng bộ lên Drive',
          err instanceof Error ? err.message : 'Lỗi kết nối Google Drive.',
          'error'
        );
      }
    },
    [addToast, flagDriveFull]
  );

  // ───────── GHI: mọi thay đổi dữ liệu đều đi qua đây (kiểm tra dung lượng + Thùng rác) ─────────

  const syncNow = useCallback(
    async (opts: { showSuccessToast?: boolean } = {}): Promise<boolean> => {
      if (!driveReadyRef.current) return false;
      if (!hasActiveDriveSession()) {
        handleDriveError(new DriveError('AUTH_REQUIRED', 'Phiên đăng nhập hết hạn'));
        return false;
      }
      if (inFlightRef.current) return false; // vòng ghi đang chạy sẽ tự quét lại dữ liệu mới nhất

      inFlightRef.current = true;
      let success = false;
      try {
        for (let pass = 0; pass < MAX_SYNC_PASSES; pass++) {
          const db = latestDbRef.current;
          if (!db) break;
          const syncedHash = databaseContentHash(db);

          setDriveSyncStatus('syncing');
          const result = await writeDatabase(db);

          if (result.status === 'quota_exceeded') {
            flagDriveFull(result.quota);
            success = false;
            break;
          }
          if (result.status === 'trashed_or_deleted') {
            flagTrashed(result.trashedFileId);
            success = false;
            break;
          }

          lastSyncedHashRef.current = syncedHash;
          quotaAlertShownRef.current = false;
          authExpiredToastedRef.current = false;
          setDriveFileId(result.fileId);
          setDriveSyncStatus('synced');
          reportQuota(result.quota);
          success = true;

          const latest = latestDbRef.current;
          const stillPending = Boolean(latest) && databaseContentHash(latest!) !== syncedHash;
          persistLocal(latest ?? db, stillPending);
          if (!stillPending) break; // không còn thay đổi mới trong lúc đang ghi
        }
        if (success && opts.showSuccessToast) {
          addToast(
            `Đã lưu vào ${DRIVE_DB_FILENAME}!`,
            'Mọi thay đổi đã được đồng bộ lên Google Drive cá nhân của bạn.',
            'success'
          );
        }
      } catch (err) {
        success = false;
        handleDriveError(err);
      } finally {
        inFlightRef.current = false;
      }
      return success;
    },
    [addToast, flagDriveFull, flagTrashed, handleDriveError, persistLocal, reportQuota]
  );

  // Mỗi khi dữ liệu thay đổi: lưu NGAY vào LocalStorage, rồi tự đồng bộ lên Drive sau một nhịp ngắn
  useEffect(() => {
    latestDbRef.current = database;
    if (authPhase !== 'ready') return;

    if (storageMode === 'local') {
      saveLocalOnlyDatabase(database); // chế độ không đăng nhập: chỉ lưu trong trình duyệt
      return;
    }

    const pending = databaseContentHash(database) !== lastSyncedHashRef.current;
    if (driveReadyRef.current || localTrustedRef.current) {
      persistLocal(database, pending);
    }
    if (!pending) return;

    const timer = window.setTimeout(() => {
      void syncNow();
    }, SYNC_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [database, authPhase, storageMode, persistLocal, syncNow]);

  // ───────── ĐỌC từ Drive ─────────

  const readAndApply = useCallback(
    async (args: {
      fallback: KronoFlowDatabase;
      local: LocalSnapshot | null;
      localTrusted: boolean;
      silent: boolean;
    }): Promise<'ok' | 'blocked' | 'failed'> => {
      setDriveSyncStatus('syncing');
      try {
        const result = await readOrCreateDatabase(args.fallback);
        reportQuota(result.quota);

        if (result.status === 'quota_exceeded') {
          // Chưa có tệp trên Drive để ghi đè → dùng dữ liệu đang có và thử đồng bộ lại sau
          driveReadyRef.current = true;
          applyDatabase(args.fallback, false);
          flagDriveFull(result.quota);
          return 'blocked';
        }

        if (result.status === 'trashed_or_deleted') {
          applyDatabase(args.fallback, false);
          flagTrashed(result.trashedFileId);
          return 'blocked';
        }

        driveReadyRef.current = true;
        localTrustedRef.current = true;
        trashedFileIdRef.current = undefined;
        authExpiredToastedRef.current = false;
        setDriveFileId(result.fileId);

        const preferLocal =
          result.status === 'loaded' && args.localTrusted && Boolean(args.local?.pendingSync);
        if (preferLocal && args.local) {
          // Có thay đổi chưa kịp đồng bộ từ lần trước → giữ bản mới trên máy và đẩy lên Drive
          applyDatabase(args.local.db, false);
        } else {
          applyDatabase(result.data, true);
          setDriveSyncStatus('synced');
        }

        if (!args.silent) {
          addToast(
            result.status === 'created'
              ? `Đã khởi tạo ${DRIVE_DB_FILENAME}!`
              : `Đã đọc ${DRIVE_DB_FILENAME} từ Drive!`,
            DRIVE_PROTECTION_REMINDER_TEXT,
            'success'
          );
        }
        return 'ok';
      } catch (err) {
        handleDriveError(err);
        return 'failed';
      }
    },
    [addToast, applyDatabase, flagDriveFull, flagTrashed, handleDriveError, reportQuota]
  );

  const enterLocalMode = useCallback(() => {
    const db = loadLocalOnlyDatabase() ?? createSeedDatabase();
    setLocalModeEnabled(true);
    clearDriveSession();
    driveReadyRef.current = false;
    accountKeyRef.current = '';
    applyDatabase(db, true);
    setStorageMode('local');
    setUserProfile(null);
    setDriveSyncStatus('disconnected');
    setDriveQuota(null);
    setAuthError('');
    setAuthPhase('ready');
  }, [applyDatabase]);

  const startSession = useCallback(
    async (profile: UserProfileInfo, carryOver: KronoFlowDatabase | null = null) => {
      setAuthPhase('loading');
      setAuthError('');
      setStorageMode('drive');
      setLocalModeEnabled(false);

      const accountKey = accountKeyOf(profile);
      const local = loadLocalSnapshot();
      const trusted = Boolean(local && local.account === accountKey);

      if (!trusted) {
        // Bản đệm cũ thuộc về tài khoản khác → xóa để dữ liệu không bị lẫn giữa các người dùng
        clearLocalSnapshot();
        setKnownDriveFileId(null);
        setDriveFileId(null);
      }

      accountKeyRef.current = accountKey;
      localTrustedRef.current = trusted;
      driveReadyRef.current = false;
      lastSyncedHashRef.current = '';
      quotaAlertShownRef.current = false;
      nearFullWarnedRef.current = false;
      trashedFileIdRef.current = undefined;
      setUserProfile(profile);

      const fallback =
        trusted && local
          ? { ...local.db, userProfile: profile }
          : carryOver
          ? { ...carryOver, userProfile: profile } // vừa chuyển từ chế độ không đăng nhập: mang dữ liệu sang Drive
          : createSeedDatabase(profile);

      const outcome = await readAndApply({
        fallback,
        local: trusted ? local : null,
        localTrusted: trusted,
        silent: false,
      });

      if (outcome === 'failed') {
        if (!trusted && carryOver) {
          // Kết nối Drive không thành công → quay lại chế độ không đăng nhập, dữ liệu vẫn còn nguyên
          enterLocalMode();
          return;
        }
        if (!trusted) {
          // Không có bản đệm hợp lệ và không đọc được Drive → quay về màn hình đăng nhập, tránh ghi đè nhầm
          clearDriveSession();
          setUserProfile(null);
          setDriveSyncStatus('disconnected');
          setAuthError(
            'Không thể tải dữ liệu từ Google Drive của bạn. Vui lòng kiểm tra kết nối mạng và đăng nhập lại.'
          );
          setAuthPhase('signed_out');
          return;
        }
        applyDatabase(fallback, false); // vẫn cho xem bản đệm trên thiết bị
      }
      setAuthPhase('ready');

      if (carryOver) {
        addToast(
          'Đã kết nối Google Drive',
          'Nếu trên Drive đã có dữ liệu từ trước thì dữ liệu đó được dùng. Bản lưu ở chế độ không đăng nhập vẫn nằm trên máy này.',
          'info'
        );
      }
    },
    [addToast, applyDatabase, enterLocalMode, readAndApply]
  );

  const reloadFromDrive = useCallback(async () => {
    if (!hasActiveDriveSession()) {
      handleDriveError(new DriveError('AUTH_REQUIRED', 'Phiên đăng nhập hết hạn'));
      return;
    }

    const latest = latestDbRef.current;
    const hasPending = Boolean(latest) && databaseContentHash(latest!) !== lastSyncedHashRef.current;
    if (hasPending && driveReadyRef.current) {
      // Đẩy thay đổi chưa đồng bộ lên trước để việc tải lại không ghi đè dữ liệu vừa nhập
      const ok = await syncNow();
      if (!ok) {
        addToast(
          'Còn thay đổi chưa đồng bộ',
          'Hãy đồng bộ xong rồi mới tải lại từ Drive để tránh ghi đè dữ liệu bạn vừa nhập.',
          'warning'
        );
        return;
      }
    }

    await readAndApply({
      fallback: latestDbRef.current ?? createSeedDatabase(userProfile ?? undefined),
      local: loadLocalSnapshot(),
      localTrusted: localTrustedRef.current,
      silent: false,
    });
  }, [addToast, handleDriveError, readAndApply, syncNow, userProfile]);

  const refreshQuota = useCallback(async () => {
    if (!hasActiveDriveSession()) return;
    try {
      reportQuota(await checkDriveQuota());
    } catch (err) {
      handleDriveError(err);
    }
  }, [handleDriveError, reportQuota]);

  // ───────── Đăng nhập / đăng xuất ─────────

  const handleGoogleSignIn = useCallback(async () => {
    setIsAuthenticating(true);
    setAuthError('');
    try {
      const { profile } = await signInWithGoogleDrive();
      authExpiredToastedRef.current = false;

      if (
        authPhase === 'ready' &&
        storageMode === 'drive' &&
        accountKeyOf(profile) === accountKeyRef.current
      ) {
        // Đăng nhập lại đúng tài khoản cũ: giữ nguyên dữ liệu đang có, chỉ nối lại đồng bộ
        setUserProfile(profile);
        if (driveReadyRef.current) {
          await syncNow({ showSuccessToast: true });
        } else {
          await reloadFromDrive();
        }
      } else {
        const carry = storageMode === 'local' ? latestDbRef.current : null;
        await startSession(profile, carry);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Đăng nhập Google không thành công. Vui lòng thử lại.';
      if (authPhase === 'ready') {
        addToast('Đăng nhập Google không thành công', message, 'error');
      } else {
        setAuthError(message);
      }
    } finally {
      setIsAuthenticating(false);
    }
  }, [addToast, authPhase, storageMode, reloadFromDrive, startSession, syncNow]);

  const handleSignOut = () => {
    clearDriveSession();
    driveReadyRef.current = false;
    setAuthPhase('signed_out');
    setUserProfile(null);
    setDriveSyncStatus('disconnected');
    setDriveQuota(null);
    setShowDriveQuotaModal(false);
    setShowDriveTrashedModal(false);
    setIsMobileMenuOpen(false);
    setActiveTab('overview');
    addToast(
      'Đã đăng xuất',
      'Bạn đã ngắt kết nối Google Drive. Thay đổi chưa đồng bộ (nếu có) vẫn được giữ trên thiết bị này.',
      'info'
    );
  };

  // ───────── Khôi phục khi tệp bị xóa / vào Thùng rác ─────────

  const handleRestoreDriveFromLocal = async () => {
    if (!hasActiveDriveSession()) {
      handleDriveError(new DriveError('AUTH_REQUIRED', 'Phiên đăng nhập hết hạn'));
      return;
    }
    setIsDriveRestoring(true);
    try {
      const trashedId = trashedFileIdRef.current;
      const payload = latestDbRef.current;

      if (localTrustedRef.current && payload) {
        // Ghi lại tệp lên Drive từ bản đệm LocalStorage (đang là dữ liệu mới nhất của người dùng)
        const res = await restoreDatabaseFromLocal(
          { ...payload, lastUpdated: new Date().toISOString() },
          trashedId
        );
        reportQuota(res.quota);
        if (res.status === 'synced') {
          driveReadyRef.current = true;
          trashedFileIdRef.current = undefined;
          lastSyncedHashRef.current = databaseContentHash(payload);
          persistLocal(payload, false);
          setDriveFileId(res.fileId);
          setDriveSyncStatus('synced');
          setShowDriveTrashedModal(false);
          addToast(
            'Khôi phục lên Google Drive thành công!',
            `Đã khôi phục tệp "${DRIVE_DB_FILENAME}" lên Google Drive từ bản sao lưu tạm trong LocalStorage.`,
            'success'
          );
        } else if (res.status === 'quota_exceeded') {
          setShowDriveTrashedModal(false);
          flagDriveFull(res.quota);
        }
        return;
      }

      // Thiết bị này không có bản đệm của tài khoản → chỉ lấy tệp gốc ra khỏi Thùng rác rồi đọc lại
      if (trashedId && (await untrashDatabaseFile(trashedId))) {
        setShowDriveTrashedModal(false);
        await readAndApply({
          fallback: payload ?? createSeedDatabase(userProfile ?? undefined),
          local: null,
          localTrusted: false,
          silent: false,
        });
      } else {
        addToast(
          'Không thể khôi phục tự động',
          'Hãy mở Thùng rác Google Drive, chọn tệp kronoflow_database.json rồi nhấn "Khôi phục".',
          'error'
        );
      }
    } catch (err) {
      handleDriveError(err);
    } finally {
      setIsDriveRestoring(false);
    }
  };

  const handleRetryDriveQuotaSync = async () => {
    setIsDriveRetrying(true);
    try {
      const ok = await syncNow({ showSuccessToast: true });
      if (ok) setShowDriveQuotaModal(false);
    } finally {
      setIsDriveRetrying(false);
    }
  };

  // Nút trạng thái đồng bộ / nút "Đồng bộ lại": chọn đúng hành động theo tình huống hiện tại
  const handleManualSync = useCallback(async () => {
    if (!hasActiveDriveSession()) {
      await handleGoogleSignIn();
      return;
    }
    if (!driveReadyRef.current) {
      await reloadFromDrive();
      return;
    }
    await syncNow({ showSuccessToast: true });
  }, [handleGoogleSignIn, reloadFromDrive, syncNow]);

  const handleBadgeRetry = () => {
    if (driveSyncStatus === 'drive_full_unsynced') {
      setShowDriveQuotaModal(true);
      return;
    }
    void handleManualSync();
  };

  // ───────── Thao tác dữ liệu (tự động được lưu LocalStorage + đồng bộ Drive qua effect ở trên) ─────────

  const handleAddTransaction = (tx: Omit<Transaction, 'id'>) => {
    const created: Transaction = { ...tx, id: `tx-${Date.now()}` };
    setTransactions((prev) => [created, ...prev]);
    addToast(
      tx.type === 'income' ? 'Đã ghi nhận khoản thu!' : 'Đã ghi nhận khoản chi!',
      `${tx.note} (${formatVND(tx.amount)}) đã được lưu vào sổ thu chi.`
    );
  };

  const handleAddBatchTransactions = (batch: Array<Omit<Transaction, 'id'>>) => {
    const created = batch.map((item, idx) => ({
      ...item,
      id: `tx-ai-${Date.now()}-${idx}`,
    }));
    setTransactions((prev) => [...created, ...prev]);
    addToast(
      'Lưu giao dịch AI thành công!',
      `Đã thêm ${created.length} khoản giao dịch mới vào sổ thu chi.`
    );
  };

  const handleUpdateTransaction = (updated: Transaction) => {
    setTransactions((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    addToast('Cập nhật thành công!', `Đã lưu thay đổi cho giao dịch "${updated.note}".`);
  };

  const handleRequestDeleteTransaction = (tx: Transaction) => {
    setConfirmState({
      open: true,
      title: 'Xác nhận xóa giao dịch?',
      description: `Bạn có chắc chắn muốn xóa giao dịch "${tx.note}" (${formatVND(
        tx.amount
      )}) khỏi sổ thu chi không?`,
      onConfirm: () => {
        setTransactions((prev) => prev.filter((t) => t.id !== tx.id));
        setConfirmState((prev) => ({ ...prev, open: false }));
        addToast('Đã xóa giao dịch', `Giao dịch "${tx.note}" đã được xóa.`, 'info');
      },
    });
  };

  const handleToggleHabitDate = (habitId: string, dateISO: string) => {
    const targetHabit = habits.find((h) => h.id === habitId);
    if (!targetHabit) return;

    const alreadyCompleted = targetHabit.completedDates.includes(dateISO);
    setHabits((prev) =>
      prev.map((hb) => {
        if (hb.id !== habitId) return hb;
        const nextDates = alreadyCompleted
          ? hb.completedDates.filter((d) => d !== dateISO)
          : [...hb.completedDates, dateISO];
        return { ...hb, completedDates: nextDates };
      })
    );

    if (!alreadyCompleted) {
      addToast(
        'Hoàn thành thói quen!',
        `Tuyệt vời! Bạn vừa điểm danh "${targetHabit.title}" (+12 điểm kỷ luật).`,
        'success'
      );
    } else {
      addToast(
        'Đã hoàn tác điểm danh',
        `Đã bỏ đánh dấu "${targetHabit.title}" trong ngày ${dateISO}.`,
        'info'
      );
    }
  };

  const handleAddHabit = (hb: Omit<Habit, 'id' | 'completedDates'>) => {
    const created: Habit = {
      ...hb,
      id: `hb-${Date.now()}`,
      completedDates: [],
    };
    setHabits((prev) => [...prev, created]);
    addToast(
      'Đã thêm thói quen mới!',
      `Thói quen "${created.title}" (${created.category}) đã sẵn sàng để rèn luyện.`
    );
  };

  const handleUpdateHabit = (updated: Habit) => {
    setHabits((prev) => prev.map((h) => (h.id === updated.id ? updated : h)));
    addToast('Đã cập nhật thói quen!', `Thói quen "${updated.title}" đã được lưu.`);
  };

  const handleRequestDeleteHabit = (hb: Habit) => {
    setConfirmState({
      open: true,
      title: 'Xác nhận xóa thói quen kỷ luật?',
      description: `Bạn có chắc chắn muốn xóa thói quen "${hb.title}" và toàn bộ lịch sử điểm danh của thói quen này không?`,
      onConfirm: () => {
        setHabits((prev) => prev.filter((h) => h.id !== hb.id));
        setConfirmState((prev) => ({ ...prev, open: false }));
        addToast('Đã xóa thói quen', `Đã xóa "${hb.title}" khỏi danh sách kỷ luật.`, 'info');
      },
    });
  };

  const handleAddTask = (tsk: Omit<TaskItem, 'id'>) => {
    const created: TaskItem = { ...tsk, id: `tsk-${Date.now()}` };
    setTasks((prev) => [created, ...prev]);
    addToast(
      'Thêm công việc thành công!',
      `Đã tạo công việc "${created.title}" trong danh sách hằng ngày.`,
      'success'
    );
  };

  const handleUpdateTask = (updated: TaskItem) => {
    const prevTask = tasks.find((t) => t.id === updated.id);
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    if (prevTask && prevTask.status !== 'done' && updated.status === 'done') {
      addToast('Hoàn thành công việc!', `Chúc mừng bạn đã hoàn tất "${updated.title}"!`, 'success');
    } else {
      addToast('Đã cập nhật công việc', `Đã lưu thay đổi cho "${updated.title}".`, 'info');
    }
  };

  const handleToggleTaskDone = (taskId: string) => {
    const target = tasks.find((t) => t.id === taskId);
    if (!target) return;
    const nextStatus = target.status === 'done' ? 'todo' : 'done';
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: nextStatus } : t)));
    if (nextStatus === 'done') {
      addToast('Hoàn thành công việc!', `Chúc mừng bạn đã hoàn tất "${target.title}"!`, 'success');
    } else {
      addToast(
        'Đã mở lại công việc',
        `Đã chuyển "${target.title}" về trạng thái Chưa làm.`,
        'info'
      );
    }
  };

  const handleRequestDeleteTask = (tsk: TaskItem) => {
    setConfirmState({
      open: true,
      title: 'Xác nhận xóa công việc?',
      description: `Bạn có chắc chắn muốn xóa công việc "${tsk.title}" khỏi danh sách hằng ngày không?`,
      onConfirm: () => {
        setTasks((prev) => prev.filter((t) => t.id !== tsk.id));
        setConfirmState((prev) => ({ ...prev, open: false }));
        addToast('Đã xóa công việc', `Đã xóa "${tsk.title}" khỏi danh sách.`, 'info');
      },
    });
  };

  const handleRestoreBackup = (data: AppBackupData) => {
    setMonthlyBudget(data.monthlyBudget);
    setTransactions(data.transactions);
    setHabits(data.habits);
    setTasks(data.tasks);
    addToast('Khôi phục thành công!', 'Toàn bộ dữ liệu từ tệp sao lưu đã được nạp.');
  };

  const handleRequestResetDemo = () => {
    setConfirmState({
      open: true,
      title: 'Khôi phục dữ liệu mẫu ban đầu?',
      description:
        'Toàn bộ giao dịch, thói quen và danh sách công việc hiện tại sẽ được đặt lại về bộ dữ liệu mẫu tiếng Việt mặc định.',
      onConfirm: () => {
        setMonthlyBudget(INITIAL_MONTHLY_BUDGET);
        setTransactions(INITIAL_TRANSACTIONS);
        setHabits(INITIAL_HABITS);
        setTasks(INITIAL_TASKS);
        setConfirmState((prev) => ({ ...prev, open: false }));
        addToast('Đã khôi phục dữ liệu mẫu!', 'Ứng dụng đã trở về trạng thái dữ liệu mẫu ban đầu.');
      },
    });
  };

  const contextSummary = useMemo(() => {
    const fin = calculateMonthlyFinance(transactions, monthlyBudget, todayISO.slice(0, 7));
    const disc = calculateDisciplineMetrics(habits, todayISO);
    const tsk = calculateTaskMetrics(tasks);
    return `Tổng thu: ${formatVND(fin.totalIncome)}, Tổng chi: ${formatVND(
      fin.totalExpense
    )} / Hạn mức ${formatVND(monthlyBudget)} (${fin.budgetPercentage}%). Chuỗi kỷ luật: ${
      disc.overallStreak
    } ngày (${disc.rankTitle} - ${disc.disciplineScore} điểm). Công việc hoàn thành: ${
      tsk.done
    }/${tsk.total} (Khẩn cấp chưa xong: ${tsk.urgentPending}).`;
  }, [transactions, monthlyBudget, habits, tasks, todayISO]);

  // Mục điều hướng cho Sidebar & ngăn kéo Menu trên điện thoại (Trợ lý AI có nút nổi riêng)
  const mainMenuItems: Array<{ id: NavTab; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Tổng quan', icon: <LayoutDashboard className="h-4 w-4 shrink-0" /> },
    { id: 'expenses', label: 'Quản lý Chi tiêu', icon: <Wallet className="h-4 w-4 shrink-0" /> },
    { id: 'habits', label: 'Rèn luyện Kỷ luật', icon: <Flame className="h-4 w-4 shrink-0" /> },
    { id: 'tasks', label: 'Danh sách Công việc', icon: <ListTodo className="h-4 w-4 shrink-0" /> },
    { id: 'settings', label: 'Cài đặt & Sao lưu', icon: <CloudCog className="h-4 w-4 shrink-0" /> },
  ];

  const desktopNavItems: Array<{ id: NavTab; label: string; icon: React.ReactNode }> = [
    ...mainMenuItems.slice(0, 4),
    { id: 'chat', label: 'Trợ lý AI', icon: <Bot className="h-4 w-4 shrink-0" /> },
    mainMenuItems[4],
  ];

  const [isCompactHeader, setIsCompactHeader] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 1024 : false
  );

  useEffect(() => {
    const updateHeaderMode = () => {
      setIsCompactHeader(window.innerWidth < 1024);
    };
    updateHeaderMode();
    window.addEventListener('resize', updateHeaderMode);
    return () => window.removeEventListener('resize', updateHeaderMode);
  }, []);

  // Thanh điều hướng đáy cho điện thoại dọc (< 1024px): 4 mục chính, phần còn lại nằm trong nút Menu ở thanh trên
  const mobileBottomNavItems: Array<{
    id: NavTab;
    shortLabel: string;
    fullLabel: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'overview',
      shortLabel: 'Tổng quan',
      fullLabel: 'Tổng quan',
      icon: <LayoutDashboard className="h-5 w-5 shrink-0" />,
    },
    {
      id: 'expenses',
      shortLabel: 'Chi tiêu',
      fullLabel: 'Quản lý Chi tiêu',
      icon: <Wallet className="h-5 w-5 shrink-0" />,
    },
    {
      id: 'habits',
      shortLabel: 'Kỷ luật',
      fullLabel: 'Rèn luyện Kỷ luật',
      icon: <Flame className="h-5 w-5 shrink-0" />,
    },
    {
      id: 'tasks',
      shortLabel: 'Công việc',
      fullLabel: 'Danh sách Công việc',
      icon: <ListTodo className="h-5 w-5 shrink-0" />,
    },
  ];

  const activeUserDisplay = userProfile;

  // ───────── Chưa đăng nhập / đang tải dữ liệu từ Drive ─────────
  if (authPhase !== 'ready') {
    return (
      <>
        <OfflineIndicator />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
        {authPhase === 'loading' ? (
          <div
            data-testid="drive-loading-screen"
            className="min-h-screen flex flex-col items-center justify-center gap-3 kronoflow-ambient-bg text-slate-700 dark:text-slate-300"
          >
            <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="KronoFlow" className="h-12 w-12" />
            <div className="text-sm font-semibold">Đang tải dữ liệu từ Google Drive của bạn...</div>
          </div>
        ) : (
          <DriveAuthWelcomeScreen
            loading={isAuthenticating}
            errorMessage={authError}
            onSignInGoogleDrive={handleGoogleSignIn}
            onContinueWithoutLogin={enterLocalMode}
          />
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row kronoflow-ambient-bg text-slate-900 dark:text-slate-100">
      {/* Offline Connectivity Banner */}
      <OfflineIndicator />

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Hộp thoại đỏ khi kronoflow_database.json bị xóa hoặc nằm trong Thùng rác Drive */}
      <DriveTrashedOrDeletedModal
        open={showDriveTrashedModal}
        restoring={isDriveRestoring}
        onRestoreToDrive={handleRestoreDriveFromLocal}
        onClose={() => setShowDriveTrashedModal(false)}
      />

      {/* Emergency Modal when Google Drive Storage Quota is Full */}
      <DriveQuotaExceededModal
        open={showDriveQuotaModal}
        quota={driveQuota}
        retrying={isDriveRetrying}
        onRetrySync={handleRetryDriveQuotaSync}
        onClose={() => setShowDriveQuotaModal(false)}
      />

      {/* Desktop Sidebar Navigation (260px) — only shown when full layout has space */}
      {!isCompactHeader && (
        <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 liquid-glass-sidebar z-30">
          <div className="px-6 py-5 border-b border-slate-200/60 dark:border-slate-800/80">
            <a
              href="#overview"
              onClick={(e) => {
                e.preventDefault();
                handleSelectTab('overview');
              }}
              data-testid="brand-title"
              className="inline-flex items-center gap-2.5 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
            >
              <img
                src={`${import.meta.env.BASE_URL}icon.svg`}
                alt="Biểu tượng KronoFlow"
                className="h-7 w-7 shrink-0"
              />
              <span>KronoFlow</span>
            </a>
          </div>

          <nav aria-label="Điều hướng chính" className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
            {desktopNavItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap shrink-0 ${
                    active
                      ? 'claude-liquid-btn text-white'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              );
            })}

            {/* Compact Google Drive Storage Quota Bar in Sidebar */}
            <div className="pt-3 px-1">
              <CompactDriveQuotaBar
                quota={driveQuota}
                onRefreshQuota={() => void refreshQuota()}
              />
            </div>
          </nav>

          {/* Sidebar Account, PWA Install & Theme Footer */}
          <div className="p-4 border-t border-slate-200/60 dark:border-slate-800/80 space-y-2.5">
            <PWAInstallButton />

            <button
              type="button"
              onClick={() => setDarkMode((prev) => !prev)}
              aria-label="Chuyển đổi giao diện Sáng hoặc Tối"
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl liquid-glass text-xs font-semibold text-slate-700 dark:text-slate-300 hover:border-emerald-500/40 transition-all whitespace-nowrap shrink-0"
            >
              <span>Giao diện</span>
              <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 whitespace-nowrap shrink-0">
                {darkMode ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
                {darkMode ? 'Chế độ Tối' : 'Chế độ Sáng'}
              </span>
            </button>

            {activeUserDisplay ? (
              <div className="flex items-center justify-between gap-2 px-2 py-1">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                    {activeUserDisplay.name}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {activeUserDisplay.email}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  aria-label="Đăng xuất tài khoản Google"
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-red-600"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : null}
          </div>
        </aside>
      )}

      {/* Mobile Slide-Over Sidebar Column (Cột Menu Ẩn / Hiện riêng khi thu gọn) */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 flex"
          role="dialog"
          aria-modal="true"
          aria-label="Menu điều hướng di động"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMobileMenuOpen(false)}
          />

          {/* Slide-out Column */}
          <div
            data-testid="mobile-menu-drawer"
            className="relative z-10 w-72 max-w-[82vw] liquid-glass-sidebar animate-drawer-enter flex flex-col justify-between h-full shadow-2xl overflow-y-auto"
          >
            <div>
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/60 dark:border-slate-800">
                <div className="inline-flex items-center gap-2.5">
                  <img
                    src={`${import.meta.env.BASE_URL}icon.svg`}
                    alt="Biểu tượng KronoFlow"
                    className="h-6 w-6 shrink-0"
                  />
                  <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
                    KronoFlow
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  aria-label="Ẩn menu điều hướng"
                  className="inline-flex items-center gap-1 rounded-lg liquid-glass px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-emerald-500/40"
                >
                  <X className="h-4 w-4" />
                  <span>Ẩn</span>
                </button>
              </div>

              <div className="px-4 pt-4 pb-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Danh mục chức năng chính
              </div>

              <nav aria-label="Menu di động" className="px-3 space-y-1.5">
                {mainMenuItems.map((item) => {
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectTab(item.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                        active
                          ? 'claude-liquid-btn text-white'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>

              <div className="px-4 pt-4">
                <CompactDriveQuotaBar
                  quota={driveQuota}
                  onRefreshQuota={() => void refreshQuota()}
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-200/60 dark:border-slate-800 space-y-2.5">
              <PWAInstallButton />

              <button
                type="button"
                onClick={() => setDarkMode((prev) => !prev)}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl liquid-glass text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                <span>Giao diện</span>
                <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  {darkMode ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
                  {darkMode ? 'Chế độ Tối' : 'Chế độ Sáng'}
                </span>
              </button>

              {activeUserDisplay && (
                <div className="flex items-center justify-between gap-2 px-2 py-1">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                      {activeUserDisplay.name}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {activeUserDisplay.email}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    aria-label="Đăng xuất tài khoản Google"
                    className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-red-600"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-h-screen pb-24 lg:pb-8">
        {/* Top Bar:
            - When compact (< 1024px, horizontal toolbar has no room): ONLY show "KronoFlow" and the "Menu" button.
            - When wide (>= 1024px, horizontal toolbar fits): show the horizontal toolbar, Sync Status badge, and "Cài đặt & Sao lưu", hiding the "Menu" button. */}
        <header className="flex items-center justify-between gap-4 sm:gap-8 px-4 sm:px-6 py-3 liquid-glass-header sticky top-0 z-20">
          {isCompactHeader ? (
            <>
              <a
                href="#overview"
                onClick={(e) => {
                  e.preventDefault();
                  handleSelectTab('overview');
                }}
                data-testid="brand-title-mobile"
                className="inline-flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
              >
                <img
                  src={`${import.meta.env.BASE_URL}icon.svg`}
                  alt="Biểu tượng KronoFlow"
                  className="h-6 w-6 shrink-0"
                />
                <span>KronoFlow</span>
              </a>

              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(true)}
                aria-label="Mở menu điều hướng"
                data-testid="mobile-menu-trigger"
                className="inline-flex items-center gap-2 rounded-xl liquid-glass px-3.5 py-2 text-xs font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap shrink-0"
              >
                <Menu className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span>Menu</span>
              </button>
            </>
          ) : (
            <>
              <nav
                aria-label="Điều hướng nhanh"
                data-testid="desktop-top-toolbar"
                className="flex items-center gap-6 text-xs font-medium text-slate-600 dark:text-slate-400"
              >
                {desktopNavItems.slice(0, 5).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectTab(item.id)}
                    className={`hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 ${
                      activeTab === item.id
                        ? 'text-emerald-600 dark:text-emerald-400 font-semibold underline underline-offset-4'
                        : ''
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </nav>

              <div className="flex items-center gap-2.5 shrink-0">
                <DriveSyncStatusBadge
                  syncStatus={driveSyncStatus}
                  onOpenLoginModal={() => void handleGoogleSignIn()}
                  onRetrySync={handleBadgeRetry}
                  onOpenTrashedModal={() => setShowDriveTrashedModal(true)}
                  localOnly={storageMode === 'local'}
                />
                <PWAInstallButton compact />
                <button
                  type="button"
                  onClick={() => handleSelectTab('settings')}
                  data-testid="header-settings-btn"
                  className="px-3.5 py-2 text-xs font-semibold rounded-xl claude-liquid-btn whitespace-nowrap shrink-0"
                >
                  Cài đặt & Sao lưu
                </button>
              </div>
            </>
          )}
        </header>

        {/* Main Viewport with Smooth Fluid Tab Transitions */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-4">
          {/* Sync Status & Anti-Deletion Protection Bar */}
          <div className="space-y-2.5">
            {isCompactHeader && (
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <DriveSyncStatusBadge
                  syncStatus={driveSyncStatus}
                  onOpenLoginModal={() => void handleGoogleSignIn()}
                  onRetrySync={handleBadgeRetry}
                  onOpenTrashedModal={() => setShowDriveTrashedModal(true)}
                  localOnly={storageMode === 'local'}
                />
              </div>
            )}

            {showProtectionReminder && storageMode === 'drive' && (
              <DriveProtectionReminderBanner
                syncStatus={driveSyncStatus}
                onDismiss={() => setShowProtectionReminder(false)}
              />
            )}
          </div>

          <div key={activeTab} className="animate-view-enter">
            {activeTab === 'overview' && (
              <OverviewView
                transactions={transactions}
                monthlyBudget={monthlyBudget}
                habits={habits}
                tasks={tasks}
                todayISO={todayISO}
                onNavigate={(tab) => handleSelectTab(tab)}
                onToggleHabitToday={(habitId) => handleToggleHabitDate(habitId, todayISO)}
                onToggleTaskDone={handleToggleTaskDone}
              />
            )}

            {activeTab === 'expenses' && (
              <ExpenseTrackerView
                transactions={transactions}
                monthlyBudget={monthlyBudget}
                todayISO={todayISO}
                onUpdateBudget={(b) => {
                  setMonthlyBudget(b);
                  addToast(
                    'Đã cập nhật hạn mức tháng!',
                    `Hạn mức ngân sách mới là ${formatVND(b)}.`
                  );
                }}
                onAddTransaction={handleAddTransaction}
                onAddBatchTransactions={handleAddBatchTransactions}
                onUpdateTransaction={handleUpdateTransaction}
                onRequestDeleteTransaction={handleRequestDeleteTransaction}
              />
            )}

            {activeTab === 'habits' && (
              <HabitTrackerView
                habits={habits}
                todayISO={todayISO}
                onToggleHabitDate={handleToggleHabitDate}
                onAddHabit={handleAddHabit}
                onUpdateHabit={handleUpdateHabit}
                onRequestDeleteHabit={handleRequestDeleteHabit}
              />
            )}

            {activeTab === 'tasks' && (
              <TaskListView
                tasks={tasks}
                todayISO={todayISO}
                onAddTask={handleAddTask}
                onUpdateTask={handleUpdateTask}
                onRequestDeleteTask={handleRequestDeleteTask}
              />
            )}

            {activeTab === 'chat' && <AiChatView contextSummary={contextSummary} />}

            {activeTab === 'settings' && (
              <SettingsView
                storageMode={storageMode}
                onConnectDrive={handleGoogleSignIn}
                userProfile={userProfile}
                monthlyBudget={monthlyBudget}
                transactions={transactions}
                habits={habits}
                tasks={tasks}
                driveQuota={driveQuota}
                driveSyncStatus={driveSyncStatus}
                driveFileId={driveFileId}
                onReadFromDrive={reloadFromDrive}
                onSyncToDrive={handleManualSync}
                onRestoreBackup={handleRestoreBackup}
                onRequestResetDemo={handleRequestResetDemo}
                onRequestConfirmAction={(cfg) =>
                  setConfirmState({
                    open: true,
                    title: cfg.title,
                    description: cfg.description,
                    onConfirm: async () => {
                      setConfirmState((prev) => ({ ...prev, open: false }));
                      await cfg.action();
                    },
                  })
                }
              />
            )}
          </div>
        </main>
      </div>

      {/* Optimized Mobile Portrait Bottom Navigation Bar (Thanh điều hướng dưới đáy cho màn hình dọc điện thoại) */}
      {isCompactHeader && (
        <nav
          aria-label="Thanh điều hướng dưới đáy"
          data-testid="mobile-bottom-nav"
          className="fixed bottom-0 inset-x-0 z-30 h-16 liquid-glass-header border-t border-slate-200/80 dark:border-slate-800/80 grid grid-cols-4 items-center px-1.5 select-none"
        >
          {mobileBottomNavItems.map((item) => {
            const active = activeTab === item.id && !isMobileMenuOpen;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectTab(item.id)}
                aria-label={item.fullLabel}
                aria-current={active ? 'page' : undefined}
                data-testid={`bottom-nav-${item.id}`}
                className={`relative flex flex-col items-center justify-center min-h-[48px] py-1 px-1 rounded-xl transition-all duration-150 active:scale-95 ${
                  active
                    ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 font-medium'
                }`}
              >
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute top-0.5 h-1 w-6 rounded-full bg-emerald-600 dark:bg-emerald-400"
                  />
                )}
                <span
                  className={`p-1 rounded-lg transition-colors ${
                    active ? 'bg-emerald-500/15 dark:bg-emerald-500/20' : ''
                  }`}
                >
                  {item.icon}
                </span>
                <span className="text-[11px] leading-tight tracking-tight whitespace-nowrap mt-0.5">
                  {item.shortLabel}
                </span>
              </button>
            );
          })}

        </nav>
      )}

      {/* Dedicated Floating AI Assistant Button (Nút nổi Trợ lý AI riêng - nằm phía trên Bottom Nav trên mobile) */}
      <button
        type="button"
        onClick={() => {
          if (activeTab === 'chat') {
            setActiveTab(previousTab || 'overview');
          } else {
            setPreviousTab(activeTab);
            setActiveTab('chat');
            setIsMobileMenuOpen(false);
          }
        }}
        aria-label={activeTab === 'chat' ? 'Đóng Trợ lý AI' : 'Mở Trợ lý AI'}
        data-testid="floating-ai-button"
        className={`fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-40 inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-bold text-white shadow-lg transition-all duration-150 hover:scale-105 active:scale-95 whitespace-nowrap shrink-0 ${
          activeTab === 'chat'
            ? 'bg-slate-900 dark:bg-slate-700'
            : 'claude-liquid-btn'
        }`}
      >
        {activeTab === 'chat' ? (
          <>
            <X className="h-4 w-4" />
            <span>Đóng AI</span>
          </>
        ) : (
          <>
            <Bot className="h-4 w-4" />
            <span>Trợ lý AI</span>
          </>
        )}
      </button>

      {/* Global Confirmation Modal for Destructive / Mutating Actions */}
      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
}
