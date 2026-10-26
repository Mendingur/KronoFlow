/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import { User } from 'firebase/auth';
import {
  Transaction,
  Habit,
  TaskItem,
  AppBackupData,
  DriveStorageQuota,
  DriveSyncStatus,
  FinHabitDatabaseSchema,
  UserProfileInfo,
} from './types';
import {
  TODAY_ISO,
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
} from './utils/logic';
import {
  initAuth,
  googleSignIn,
  logout,
  syncDataToFirestore,
  loadDataFromFirestore,
  deleteFirestoreItem,
} from './services/firebase';
import {
  authenticateWithGoogleDrive,
  computeQuotaMetrics,
  fetchDriveStorageQuota,
  getKnownDriveFileId,
  getSimulatedDriveCondition,
  readOrCreateFinHabitDatabase,
  restoreDatabaseToDriveFromLocal,
  setDriveAccessToken,
  setSimulatedDriveCondition,
  syncDatabaseToDrive,
} from './services/driveDatabase';
import {
  DRIVE_DB_FILENAME,
  DRIVE_FULL_ERROR_MESSAGE,
  DRIVE_PROTECTION_REMINDER_TEXT,
} from './config/constants';
import { OverviewView } from './components/OverviewView';
import { ExpenseTrackerView } from './components/ExpenseTrackerView';
import { HabitTrackerView } from './components/HabitTrackerView';
import { TaskListView } from './components/TaskListView';
import { AiChatView } from './components/AiChatView';
import { WorkspaceBackupView } from './components/WorkspaceBackupView';
import { ConfirmDialog } from './components/ConfirmDialog';
import { ToastContainer, ToastItem } from './components/ToastContainer';
import { PWAInstallButton, OfflineIndicator } from './components/PWAInstallButton';
import {
  CompactDriveQuotaBar,
  DriveAuthWelcomeModal,
  DriveProtectionReminderBanner,
  DriveQuotaExceededModal,
  DriveSyncStatusBadge,
  DriveTrashedOrDeletedModal,
} from './components/DriveProtectionModals';

type NavTab = 'overview' | 'expenses' | 'habits' | 'tasks' | 'chat' | 'workspace';

const STORAGE_KEYS = {
  BUDGET: 'kltc_monthly_budget_v1',
  TRANSACTIONS: 'kltc_transactions_v1',
  HABITS: 'kltc_habits_v1',
  TASKS: 'kltc_tasks_v1',
  THEME: 'kltc_theme_v1',
  DRIVE_LOCAL_BACKUP: 'kronoflow_finhabit_database_backup_v1',
};

const SESSION_GATE_DISMISSED_KEY = 'kronoflow_drive_gate_dismissed_v1';

function loadInitialFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      localStorage.setItem(key, JSON.stringify(fallback));
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [previousTab, setPreviousTab] = useState<NavTab>('overview');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.THEME) === 'dark';
    } catch {
      return false;
    }
  });

  const [monthlyBudget, setMonthlyBudget] = useState<number>(() =>
    loadInitialFromStorage(STORAGE_KEYS.BUDGET, INITIAL_MONTHLY_BUDGET)
  );
  const [transactions, setTransactions] = useState<Transaction[]>(() =>
    loadInitialFromStorage(STORAGE_KEYS.TRANSACTIONS, INITIAL_TRANSACTIONS)
  );
  const [habits, setHabits] = useState<Habit[]>(() =>
    loadInitialFromStorage(STORAGE_KEYS.HABITS, INITIAL_HABITS)
  );
  const [tasks, setTasks] = useState<TaskItem[]>(() =>
    loadInitialFromStorage(STORAGE_KEYS.TASKS, INITIAL_TASKS)
  );

  // Firebase Auth & OAuth Token state
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfileInfo | undefined>(undefined);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // Google Drive `finhabit_database.json` Sync, Quota & Protection State
  const [driveFileId, setDriveFileId] = useState<string | null>(() => getKnownDriveFileId());
  const [driveQuota, setDriveQuota] = useState<DriveStorageQuota | null>(null);
  const [driveSyncStatus, setDriveSyncStatus] = useState<DriveSyncStatus>('disconnected');
  const [isDriveAuthenticating, setIsDriveAuthenticating] = useState<boolean>(false);
  const [isDriveRestoring, setIsDriveRestoring] = useState<boolean>(false);
  const [isDriveRetrying, setIsDriveRetrying] = useState<boolean>(false);

  // Protection & Gate Modals
  const [showDriveLoginGate, setShowDriveLoginGate] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(SESSION_GATE_DISMISSED_KEY) !== '1';
    } catch {
      return true;
    }
  });
  const [showDriveTrashedModal, setShowDriveTrashedModal] = useState<boolean>(false);
  const [showDriveQuotaModal, setShowDriveQuotaModal] = useState<boolean>(false);
  const [showProtectionReminder, setShowProtectionReminder] = useState<boolean>(true);

  // Global Confirmation Modal State
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

  // Helper to trigger auto-dismissing toast notification
  const addToast = useCallback(
    (title: string, message: string, variant: ToastItem['variant'] = 'success') => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-3), { id, title, message, variant }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
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

  // Sync Dark/Light Mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      localStorage.setItem(STORAGE_KEYS.THEME, 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem(STORAGE_KEYS.THEME, 'light');
    }
  }, [darkMode]);

  // Persist all data changes to localStorage automatically
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.BUDGET, JSON.stringify(monthlyBudget));
  }, [monthlyBudget]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
  }, [transactions]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.HABITS, JSON.stringify(habits));
  }, [habits]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));
  }, [tasks]);

  const buildDatabasePayload = useCallback(
    (overrides?: {
      monthlyBudget?: number;
      transactions?: Transaction[];
      habits?: Habit[];
      tasks?: TaskItem[];
      profile?: UserProfileInfo;
    }): FinHabitDatabaseSchema => {
      const payload: FinHabitDatabaseSchema = {
        version: '2.0',
        updatedAt: new Date().toISOString(),
        userProfile:
          overrides?.profile ||
          userProfile ||
          (user
            ? {
                name: user.displayName || 'Người dùng Google',
                email: user.email || '',
                picture: user.photoURL || undefined,
              }
            : undefined),
        settings: {
          darkMode,
          monthlyBudget: overrides?.monthlyBudget ?? monthlyBudget,
        },
        transactions: overrides?.transactions ?? transactions,
        habits: overrides?.habits ?? habits,
        tasks: overrides?.tasks ?? tasks,
      };
      try {
        localStorage.setItem(STORAGE_KEYS.DRIVE_LOCAL_BACKUP, JSON.stringify(payload));
      } catch {
        // Ignore storage write errors
      }
      return payload;
    },
    [monthlyBudget, transactions, habits, tasks, darkMode, user, userProfile]
  );

  // Keep local backup snapshot up to date whenever data changes
  useEffect(() => {
    buildDatabasePayload();
  }, [buildDatabasePayload]);

  // Core Drive READ Handler (Checks quota + trashed/deleted status before/during read)
  const performDriveRead = useCallback(
    async (tokenOverride?: string | null, silent = false) => {
      const sim = getSimulatedDriveCondition();
      const token = tokenOverride ?? accessToken;

      if (!token && sim === 'none') {
        return;
      }

      setDriveSyncStatus('syncing');
      const fallbackData = buildDatabasePayload();
      try {
        const result = await readOrCreateFinHabitDatabase(
          token || 'simulated-token',
          fallbackData
        );

        setDriveQuota(result.quota);

        if (result.status === 'quota_exceeded') {
          setDriveSyncStatus('drive_full_unsynced');
          setShowDriveQuotaModal(true);
          addToast('Bộ nhớ Google Drive đã đầy!', DRIVE_FULL_ERROR_MESSAGE, 'error');
          return;
        }

        if (result.status === 'trashed_or_deleted') {
          setDriveSyncStatus('file_trashed_or_deleted');
          setShowDriveTrashedModal(true);
          addToast(
            `Cảnh báo: File ${DRIVE_DB_FILENAME} bị xóa!`,
            `Phát hiện file ${DRIVE_DB_FILENAME} trên Google Drive đã bị đưa vào Thùng rác hoặc bị xóa mất.`,
            'error'
          );
          return;
        }

        setDriveFileId(result.fileId);
        if (result.data) {
          if (
            typeof result.data.settings?.monthlyBudget === 'number' &&
            result.data.settings.monthlyBudget > 0
          ) {
            setMonthlyBudget(result.data.settings.monthlyBudget);
          }
          if (Array.isArray(result.data.transactions)) {
            setTransactions(result.data.transactions);
          }
          if (Array.isArray(result.data.habits)) {
            setHabits(result.data.habits);
          }
          if (Array.isArray(result.data.tasks)) {
            setTasks(result.data.tasks);
          }
          if (result.data.userProfile) {
            setUserProfile(result.data.userProfile);
          }
        }

        setDriveSyncStatus('synced');
        if (!silent) {
          addToast(
            result.status === 'created'
              ? `Đã khởi tạo ${DRIVE_DB_FILENAME}!`
              : `Đã đọc ${DRIVE_DB_FILENAME} từ Drive!`,
            DRIVE_PROTECTION_REMINDER_TEXT,
            'success'
          );
        }
      } catch (err) {
        setDriveSyncStatus('error');
        if (!silent) {
          addToast(
            'Lỗi đọc Google Drive',
            err instanceof Error ? err.message : 'Không thể đọc dữ liệu từ Google Drive.',
            'error'
          );
        }
      }
    },
    [accessToken, buildDatabasePayload, addToast]
  );

  // Core Drive WRITE Handler (Called on EVERY CRUD operation: add/edit/delete transaction, habit, task, budget)
  const performDriveWrite = useCallback(
    async (
      overrides?: {
        monthlyBudget?: number;
        transactions?: Transaction[];
        habits?: Habit[];
        tasks?: TaskItem[];
      },
      options?: { showSuccessToast?: boolean }
    ) => {
      // 1. Always save immediately to LocalStorage backup so user never loses typed data
      const payload = buildDatabasePayload(overrides);
      const sim = getSimulatedDriveCondition();
      const token = accessToken;

      if (!token && sim === 'none') {
        return;
      }

      setDriveSyncStatus('syncing');
      try {
        const result = await syncDatabaseToDrive(
          token || 'simulated-token',
          driveFileId,
          payload
        );

        if (result.quota) {
          setDriveQuota(result.quota);
        }

        if (result.status === 'quota_exceeded') {
          setDriveSyncStatus('drive_full_unsynced');
          setShowDriveQuotaModal(true);
          addToast('Bộ nhớ Google Drive đã đầy!', DRIVE_FULL_ERROR_MESSAGE, 'error');
          return;
        }

        if (result.status === 'trashed_or_deleted') {
          setDriveSyncStatus('file_trashed_or_deleted');
          setShowDriveTrashedModal(true);
          addToast(
            `Cảnh báo: File ${DRIVE_DB_FILENAME} bị xóa!`,
            `File ${DRIVE_DB_FILENAME} trên Google Drive đã bị xóa hoặc nằm trong Thùng rác. Hãy nhấn Khôi phục lại lên Drive.`,
            'error'
          );
          return;
        }

        setDriveFileId(result.fileId);
        setDriveSyncStatus('synced');

        if (options?.showSuccessToast) {
          addToast(
            `Đã lưu vào ${DRIVE_DB_FILENAME}!`,
            'Mọi thay đổi đã được tự động đồng bộ lên Google Drive cá nhân của bạn.',
            'success'
          );
        }
      } catch (err) {
        setDriveSyncStatus('error');
        addToast(
          'Chưa thể đồng bộ lên Drive',
          err instanceof Error ? err.message : 'Lỗi kết nối Google Drive.',
          'error'
        );
      }
    },
    [accessToken, buildDatabasePayload, driveFileId, addToast]
  );

  // Restore finhabit_database.json from LocalStorage backup onto Google Drive when trashed/deleted
  const handleRestoreDriveFromLocal = async () => {
    setIsDriveRestoring(true);
    try {
      const localSnapshot = buildDatabasePayload();
      if (!accessToken) {
        setSimulatedDriveCondition('none');
        setDriveQuota(
          computeQuotaMetrics({
            limit: 15 * 1024 * 1024 * 1024,
            usage: 4.2 * 1024 * 1024 * 1024,
          })
        );
        setDriveSyncStatus('synced');
        setShowDriveTrashedModal(false);
        addToast(
          'Khôi phục lên Google Drive thành công!',
          `Đã tái tạo file "${DRIVE_DB_FILENAME}" trên Google Drive từ bản sao lưu LocalStorage.`,
          'success'
        );
        return;
      }

      const res = await restoreDatabaseToDriveFromLocal(accessToken, localSnapshot);
      if (res.quota) setDriveQuota(res.quota);

      if (res.status === 'synced') {
        setDriveFileId(res.fileId);
        setDriveSyncStatus('synced');
        setShowDriveTrashedModal(false);
        addToast(
          'Khôi phục lên Google Drive thành công!',
          `Đã khôi phục file "${DRIVE_DB_FILENAME}" lên Google Drive từ bản sao lưu tạm trong LocalStorage.`,
          'success'
        );
      } else if (res.status === 'quota_exceeded') {
        setShowDriveTrashedModal(false);
        setDriveSyncStatus('drive_full_unsynced');
        setShowDriveQuotaModal(true);
        addToast('Bộ nhớ Google Drive đã đầy!', DRIVE_FULL_ERROR_MESSAGE, 'error');
      }
    } catch (err) {
      addToast(
        'Không thể khôi phục lên Drive',
        err instanceof Error ? err.message : 'Vui lòng kiểm tra kết nối mạng và thử lại.',
        'error'
      );
    } finally {
      setIsDriveRestoring(false);
    }
  };

  // Retry syncing after user cleans up Google Drive storage
  const handleRetryDriveQuotaSync = async () => {
    setIsDriveRetrying(true);
    try {
      if (getSimulatedDriveCondition() === 'drive_full') {
        setSimulatedDriveCondition('none');
      }
      if (!accessToken) {
        setDriveQuota(
          computeQuotaMetrics({
            limit: 15 * 1024 * 1024 * 1024,
            usage: 4.2 * 1024 * 1024 * 1024,
          })
        );
        setDriveSyncStatus('synced');
        setShowDriveQuotaModal(false);
        addToast(
          'Đồng bộ thành công!',
          `Dữ liệu giữ tạm trong LocalStorage đã được đồng bộ lên "${DRIVE_DB_FILENAME}".`,
          'success'
        );
        return;
      }

      await performDriveWrite(undefined, { showSuccessToast: true });
      setShowDriveQuotaModal(false);
    } finally {
      setIsDriveRetrying(false);
    }
  };

  // Initialize Firebase Auth listener (supports existing session if available)
  useEffect(() => {
    const unsubscribe = initAuth(
      async (firebaseUser, token) => {
        setUser(firebaseUser);
        setUserProfile({
          name: firebaseUser.displayName || 'Người dùng Google',
          email: firebaseUser.email || '',
          picture: firebaseUser.photoURL || undefined,
        });
        if (token) {
          setAccessToken(token);
          setDriveAccessToken(token);
          setShowDriveLoginGate(false);
          await performDriveRead(token, true);
        }
        try {
          const cloudData = await loadDataFromFirestore(firebaseUser.uid);
          if (cloudData) {
            if (cloudData.monthlyBudget > 0) setMonthlyBudget(cloudData.monthlyBudget);
            if (cloudData.transactions.length > 0) setTransactions(cloudData.transactions);
            if (cloudData.habits.length > 0) setHabits(cloudData.habits);
            if (cloudData.tasks.length > 0) setTasks(cloudData.tasks);
          }
        } catch (err) {
          console.error('Could not load initial Firestore data:', err);
        }
      },
      () => {
        setUser(null);
        setAccessToken(null);
      }
    );
    return () => unsubscribe();
  }, [performDriveRead]);

  // Unified Google Sign-In & Google Drive Connection
  const handleGoogleSignIn = async () => {
    setIsDriveAuthenticating(true);
    try {
      try {
        const gisSession = await authenticateWithGoogleDrive();
        setAccessToken(gisSession.accessToken);
        setUserProfile(gisSession.profile);
        setShowDriveLoginGate(false);
        setShowProtectionReminder(true);
        sessionStorage.setItem(SESSION_GATE_DISMISSED_KEY, '1');

        addToast('Đã kết nối Google Drive!', DRIVE_PROTECTION_REMINDER_TEXT, 'success');
        await performDriveRead(gisSession.accessToken, true);
        return;
      } catch {
        const result = await googleSignIn();
        if (result) {
          setUser(result.user);
          setAccessToken(result.accessToken);
          setDriveAccessToken(result.accessToken);
          setUserProfile({
            name: result.user.displayName || 'Người dùng Google',
            email: result.user.email || '',
            picture: result.user.photoURL || undefined,
          });
          setShowDriveLoginGate(false);
          setShowProtectionReminder(true);
          sessionStorage.setItem(SESSION_GATE_DISMISSED_KEY, '1');

          addToast('Đã kết nối Google Drive!', DRIVE_PROTECTION_REMINDER_TEXT, 'success');
          if (result.accessToken) {
            await performDriveRead(result.accessToken, true);
          }
        }
      }
    } catch (err) {
      console.error('Google Sign-In failed:', err);
      addToast(
        'Đăng nhập Google bị hủy hoặc gặp sự cố',
        'Bạn có thể kiểm tra lại GOOGLE_CLIENT_ID trong mục Cài đặt hoặc tiếp tục dùng chế độ LocalStorage.',
        'info'
      );
    } finally {
      setIsDriveAuthenticating(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
    setDriveAccessToken(null);
    setUser(null);
    setUserProfile(undefined);
    setAccessToken(null);
    setDriveSyncStatus('disconnected');
    addToast('Đã đăng xuất', 'Bạn đã ngắt kết nối tài khoản Google Drive.', 'info');
  };

  // Simulation triggers for testing & verifying Drive Full and File Trashed protections
  const handleTriggerDriveFullSimulation = async () => {
    setSimulatedDriveCondition('drive_full');
    const q = await fetchDriveStorageQuota(accessToken || 'simulated-token');
    setDriveQuota(q);
    setDriveSyncStatus('drive_full_unsynced');
    setShowDriveQuotaModal(true);
    addToast('Bộ nhớ Google Drive đã đầy!', DRIVE_FULL_ERROR_MESSAGE, 'error');
  };

  const handleTriggerDriveTrashedSimulation = async () => {
    setSimulatedDriveCondition('file_trashed');
    await performDriveRead(accessToken || 'simulated-token', false);
  };

  // Transaction Handlers (with automatic Drive quota check + auto-save into finhabit_database.json)
  const handleAddTransaction = (tx: Omit<Transaction, 'id'>) => {
    const created: Transaction = { ...tx, id: `tx-${Date.now()}` };
    const nextTransactions = [created, ...transactions];
    setTransactions(nextTransactions);
    addToast(
      tx.type === 'income' ? 'Đã ghi nhận khoản thu!' : 'Đã ghi nhận khoản chi!',
      `${tx.note} (${formatVND(tx.amount)}) đã được lưu vào sổ thu chi.`
    );
    void performDriveWrite({ transactions: nextTransactions });
  };

  const handleAddBatchTransactions = (batch: Array<Omit<Transaction, 'id'>>) => {
    const created = batch.map((item, idx) => ({
      ...item,
      id: `tx-ai-${Date.now()}-${idx}`,
    }));
    const nextTransactions = [...created, ...transactions];
    setTransactions(nextTransactions);
    addToast(
      'Lưu giao dịch AI thành công!',
      `Đã thêm ${created.length} khoản giao dịch mới vào sổ thu chi.`
    );
    void performDriveWrite({ transactions: nextTransactions });
  };

  const handleUpdateTransaction = (updated: Transaction) => {
    const nextTransactions = transactions.map((t) => (t.id === updated.id ? updated : t));
    setTransactions(nextTransactions);
    addToast('Cập nhật thành công!', `Đã lưu thay đổi cho giao dịch "${updated.note}".`);
    void performDriveWrite({ transactions: nextTransactions });
  };

  const handleRequestDeleteTransaction = (tx: Transaction) => {
    setConfirmState({
      open: true,
      title: 'Xác nhận xóa giao dịch?',
      description: `Bạn có chắc chắn muốn xóa giao dịch "${tx.note}" (${formatVND(
        tx.amount
      )}) khỏi sổ thu chi không?`,
      onConfirm: async () => {
        const nextTransactions = transactions.filter((t) => t.id !== tx.id);
        setTransactions(nextTransactions);
        if (user) {
          await deleteFirestoreItem(user.uid, 'transactions', tx.id).catch(() => {});
        }
        setConfirmState((prev) => ({ ...prev, open: false }));
        addToast('Đã xóa giao dịch', `Giao dịch "${tx.note}" đã được xóa.`, 'info');
        await performDriveWrite({ transactions: nextTransactions });
      },
    });
  };

  // Habit Handlers (with automatic Drive quota check + auto-save into finhabit_database.json)
  const handleToggleHabitDate = (habitId: string, dateISO: string) => {
    const targetHabit = habits.find((h) => h.id === habitId);
    if (!targetHabit) return;

    const alreadyCompleted = targetHabit.completedDates.includes(dateISO);
    const nextHabits = habits.map((hb) => {
      if (hb.id !== habitId) return hb;
      const nextDates = alreadyCompleted
        ? hb.completedDates.filter((d) => d !== dateISO)
        : [...hb.completedDates, dateISO];
      return { ...hb, completedDates: nextDates };
    });
    setHabits(nextHabits);

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
    void performDriveWrite({ habits: nextHabits });
  };

  const handleAddHabit = (hb: Omit<Habit, 'id' | 'completedDates'>) => {
    const created: Habit = {
      ...hb,
      id: `hb-${Date.now()}`,
      completedDates: [],
    };
    const nextHabits = [...habits, created];
    setHabits(nextHabits);
    addToast(
      'Đã thêm thói quen mới!',
      `Thói quen "${created.title}" (${created.category}) đã sẵn sàng để rèn luyện.`
    );
    void performDriveWrite({ habits: nextHabits });
  };

  const handleUpdateHabit = (updated: Habit) => {
    const nextHabits = habits.map((h) => (h.id === updated.id ? updated : h));
    setHabits(nextHabits);
    addToast('Đã cập nhật thói quen!', `Thói quen "${updated.title}" đã được lưu.`);
    void performDriveWrite({ habits: nextHabits });
  };

  const handleRequestDeleteHabit = (hb: Habit) => {
    setConfirmState({
      open: true,
      title: 'Xác nhận xóa thói quen kỷ luật?',
      description: `Bạn có chắc chắn muốn xóa thói quen "${hb.title}" và toàn bộ lịch sử điểm danh của thói quen này không?`,
      onConfirm: async () => {
        const nextHabits = habits.filter((h) => h.id !== hb.id);
        setHabits(nextHabits);
        if (user) {
          await deleteFirestoreItem(user.uid, 'habits', hb.id).catch(() => {});
        }
        setConfirmState((prev) => ({ ...prev, open: false }));
        addToast('Đã xóa thói quen', `Đã xóa "${hb.title}" khỏi danh sách kỷ luật.`, 'info');
        await performDriveWrite({ habits: nextHabits });
      },
    });
  };

  // Task Handlers (with automatic Drive quota check + auto-save into finhabit_database.json)
  const handleAddTask = (tsk: Omit<TaskItem, 'id'>) => {
    const created: TaskItem = { ...tsk, id: `tsk-${Date.now()}` };
    const nextTasks = [created, ...tasks];
    setTasks(nextTasks);
    addToast(
      'Thêm công việc thành công!',
      `Đã tạo công việc "${created.title}" trong danh sách hằng ngày.`,
      'success'
    );
    void performDriveWrite({ tasks: nextTasks });
  };

  const handleUpdateTask = (updated: TaskItem) => {
    const prevTask = tasks.find((t) => t.id === updated.id);
    const nextTasks = tasks.map((t) => (t.id === updated.id ? updated : t));
    setTasks(nextTasks);
    if (prevTask && prevTask.status !== 'done' && updated.status === 'done') {
      addToast(
        'Hoàn thành công việc!',
        `Chúc mừng bạn đã hoàn tất "${updated.title}"!`,
        'success'
      );
    } else {
      addToast('Đã cập nhật công việc', `Đã lưu thay đổi cho "${updated.title}".`, 'info');
    }
    void performDriveWrite({ tasks: nextTasks });
  };

  const handleToggleTaskDone = (taskId: string) => {
    const target = tasks.find((t) => t.id === taskId);
    if (!target) return;
    const nextStatus = target.status === 'done' ? 'todo' : 'done';
    const nextTasks = tasks.map((t) => (t.id === taskId ? { ...t, status: nextStatus } : t));
    setTasks(nextTasks);
    if (nextStatus === 'done') {
      addToast(
        'Hoàn thành công việc!',
        `Chúc mừng bạn đã hoàn tất "${target.title}"!`,
        'success'
      );
    } else {
      addToast(
        'Đã mở lại công việc',
        `Đã chuyển "${target.title}" về trạng thái Chưa làm.`,
        'info'
      );
    }
    void performDriveWrite({ tasks: nextTasks });
  };

  const handleRequestDeleteTask = (tsk: TaskItem) => {
    setConfirmState({
      open: true,
      title: 'Xác nhận xóa công việc?',
      description: `Bạn có chắc chắn muốn xóa công việc "${tsk.title}" khỏi danh sách hằng ngày không?`,
      onConfirm: async () => {
        const nextTasks = tasks.filter((t) => t.id !== tsk.id);
        setTasks(nextTasks);
        if (user) {
          await deleteFirestoreItem(user.uid, 'tasks', tsk.id).catch(() => {});
        }
        setConfirmState((prev) => ({ ...prev, open: false }));
        addToast('Đã xóa công việc', `Đã xóa "${tsk.title}" khỏi danh sách.`, 'info');
        await performDriveWrite({ tasks: nextTasks });
      },
    });
  };

  // Backup & Reset Handlers
  const handleRestoreBackup = (data: AppBackupData) => {
    setMonthlyBudget(data.monthlyBudget);
    setTransactions(data.transactions);
    setHabits(data.habits);
    setTasks(data.tasks);
    addToast('Khôi phục thành công!', 'Toàn bộ dữ liệu từ tệp sao lưu đã được nạp.');
    void performDriveWrite({
      monthlyBudget: data.monthlyBudget,
      transactions: data.transactions,
      habits: data.habits,
      tasks: data.tasks,
    });
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
        void performDriveWrite({
          monthlyBudget: INITIAL_MONTHLY_BUDGET,
          transactions: INITIAL_TRANSACTIONS,
          habits: INITIAL_HABITS,
          tasks: INITIAL_TASKS,
        });
      },
    });
  };

  const contextSummary = useMemo(() => {
    const fin = calculateMonthlyFinance(transactions, monthlyBudget, TODAY_ISO.slice(0, 7));
    const disc = calculateDisciplineMetrics(habits, TODAY_ISO);
    const tsk = calculateTaskMetrics(tasks);
    return `Tổng thu: ${formatVND(fin.totalIncome)}, Tổng chi: ${formatVND(
      fin.totalExpense
    )} / Hạn mức ${formatVND(monthlyBudget)} (${fin.budgetPercentage}%). Chuỗi kỷ luật: ${
      disc.overallStreak
    } ngày (${disc.rankTitle} - ${disc.disciplineScore} điểm). Công việc hoàn thành: ${
      tsk.done
    }/${tsk.total} (Khẩn cấp chưa xong: ${tsk.urgentPending}).`;
  }, [transactions, monthlyBudget, habits, tasks]);

  // Core navigation items for Sidebar & Mobile Drawer (AI Assistant has its own dedicated Floating Button on mobile)
  const mainMenuItems: Array<{ id: NavTab; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Tổng quan', icon: <LayoutDashboard className="h-4 w-4 shrink-0" /> },
    { id: 'expenses', label: 'Quản lý Chi tiêu', icon: <Wallet className="h-4 w-4 shrink-0" /> },
    { id: 'habits', label: 'Rèn luyện Kỷ luật', icon: <Flame className="h-4 w-4 shrink-0" /> },
    { id: 'tasks', label: 'Danh sách Công việc', icon: <ListTodo className="h-4 w-4 shrink-0" /> },
    { id: 'workspace', label: 'Cài đặt & Sao lưu', icon: <CloudCog className="h-4 w-4 shrink-0" /> },
  ];

  const desktopNavItems: Array<{ id: NavTab; label: string; icon: React.ReactNode }> = [
    ...mainMenuItems.slice(0, 4),
    { id: 'chat', label: 'Trợ lý AI', icon: <Bot className="h-4 w-4 shrink-0" /> },
    mainMenuItems[4],
  ];

  // Automatically detect when the header does not have enough room for the horizontal toolbar
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

  // Concise Bottom Navigation items for Mobile Portrait (< 1024px) so labels never truncate
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

  const activeUserDisplay =
    userProfile ||
    (user
      ? {
          name: user.displayName || 'Người dùng Google',
          email: user.email || '',
          picture: user.photoURL || undefined,
        }
      : null);

  return (
    <div className="min-h-screen flex flex-col lg:flex-row kronoflow-ambient-bg text-slate-900 dark:text-slate-100">
      {/* Offline Connectivity Banner */}
      <OfflineIndicator />

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Google Drive Sign-In Welcome Gate Modal */}
      <DriveAuthWelcomeModal
        open={showDriveLoginGate && !accessToken}
        loading={isDriveAuthenticating}
        onSignInGoogleDrive={handleGoogleSignIn}
        onContinueLocalMode={() => {
          sessionStorage.setItem(SESSION_GATE_DISMISSED_KEY, '1');
          setShowDriveLoginGate(false);
        }}
      />

      {/* Red Emergency Modal when finhabit_database.json is Trashed or Deleted on Drive */}
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
                onRefreshQuota={() => void performDriveRead(accessToken || 'simulated-token', true)}
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
            ) : (
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="gsi-material-button w-full justify-center"
              >
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
                  <span className="gsi-material-button-contents">Kết nối Google Drive</span>
                </div>
              </button>
            )}
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
                  onRefreshQuota={() =>
                    void performDriveRead(accessToken || 'simulated-token', true)
                  }
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

              {!activeUserDisplay && (
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  className="gsi-material-button w-full justify-center"
                >
                  <div className="gsi-material-button-content-wrapper">
                    <span className="gsi-material-button-contents">Kết nối Google Drive</span>
                  </div>
                </button>
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
                  onOpenLoginModal={() => setShowDriveLoginGate(true)}
                  onRetrySync={() => {
                    if (driveSyncStatus === 'drive_full_unsynced') {
                      setShowDriveQuotaModal(true);
                    } else {
                      void performDriveWrite(undefined, { showSuccessToast: true });
                    }
                  }}
                  onOpenTrashedModal={() => setShowDriveTrashedModal(true)}
                />
                <PWAInstallButton compact />
                <button
                  type="button"
                  onClick={() => handleSelectTab('workspace')}
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
                  onOpenLoginModal={() => setShowDriveLoginGate(true)}
                  onRetrySync={() => {
                    if (driveSyncStatus === 'drive_full_unsynced') {
                      setShowDriveQuotaModal(true);
                    } else {
                      void performDriveWrite(undefined, { showSuccessToast: true });
                    }
                  }}
                  onOpenTrashedModal={() => setShowDriveTrashedModal(true)}
                />
                {!accessToken && (
                  <button
                    type="button"
                    onClick={() => setShowDriveLoginGate(true)}
                    className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 underline underline-offset-2"
                  >
                    Đăng nhập Google Drive
                  </button>
                )}
              </div>
            )}

            {showProtectionReminder && (
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
                todayISO={TODAY_ISO}
                onNavigate={(tab) => handleSelectTab(tab)}
                onToggleHabitToday={(habitId) => handleToggleHabitDate(habitId, TODAY_ISO)}
                onToggleTaskDone={handleToggleTaskDone}
              />
            )}

            {activeTab === 'expenses' && (
              <ExpenseTrackerView
                transactions={transactions}
                monthlyBudget={monthlyBudget}
                todayISO={TODAY_ISO}
                onUpdateBudget={(b) => {
                  setMonthlyBudget(b);
                  addToast(
                    'Đã cập nhật hạn mức tháng!',
                    `Hạn mức ngân sách mới là ${formatVND(b)}.`
                  );
                  void performDriveWrite({ monthlyBudget: b });
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
                todayISO={TODAY_ISO}
                onToggleHabitDate={handleToggleHabitDate}
                onAddHabit={handleAddHabit}
                onUpdateHabit={handleUpdateHabit}
                onRequestDeleteHabit={handleRequestDeleteHabit}
              />
            )}

            {activeTab === 'tasks' && (
              <TaskListView
                tasks={tasks}
                todayISO={TODAY_ISO}
                onAddTask={handleAddTask}
                onUpdateTask={handleUpdateTask}
                onRequestDeleteTask={handleRequestDeleteTask}
              />
            )}

            {activeTab === 'chat' && <AiChatView contextSummary={contextSummary} />}

            {activeTab === 'workspace' && (
              <WorkspaceBackupView
                user={user}
                accessToken={accessToken}
                monthlyBudget={monthlyBudget}
                transactions={transactions}
                habits={habits}
                tasks={tasks}
                driveQuota={driveQuota}
                driveSyncStatus={driveSyncStatus}
                driveFileId={driveFileId}
                onSignInGoogle={handleGoogleSignIn}
                onReadFromDrive={async () => {
                  await performDriveRead(accessToken || 'simulated-token', false);
                }}
                onSyncToDrive={async () => {
                  await performDriveWrite(undefined, { showSuccessToast: true });
                }}
                onTriggerDriveFullSimulation={handleTriggerDriveFullSimulation}
                onTriggerDriveTrashedSimulation={handleTriggerDriveTrashedSimulation}
                onSyncFirestoreCloud={async () => {
                  if (user) {
                    await syncDataToFirestore(
                      user.uid,
                      monthlyBudget,
                      transactions,
                      habits,
                      tasks
                    );
                    addToast(
                      'Đồng bộ đám mây thành công!',
                      'Dữ liệu của bạn đã được lưu an toàn trên Firebase Firestore.'
                    );
                  }
                }}
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
          className="fixed bottom-0 inset-x-0 z-30 h-16 liquid-glass-header border-t border-slate-200/80 dark:border-slate-800/80 grid grid-cols-5 items-center px-1.5 select-none"
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

          {/* 5th Tab: Mở Menu đầy đủ & Sao lưu */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            aria-label="Mở Menu chức năng và Sao lưu"
            data-testid="bottom-nav-menu"
            className={`relative flex flex-col items-center justify-center min-h-[48px] py-1 px-1 rounded-xl transition-all duration-150 active:scale-95 ${
              isMobileMenuOpen || activeTab === 'workspace'
                ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 font-medium'
            }`}
          >
            {(isMobileMenuOpen || activeTab === 'workspace') && (
              <span
                aria-hidden="true"
                className="absolute top-0.5 h-1 w-6 rounded-full bg-emerald-600 dark:bg-emerald-400"
              />
            )}
            <span
              className={`p-1 rounded-lg transition-colors ${
                isMobileMenuOpen || activeTab === 'workspace'
                  ? 'bg-emerald-500/15 dark:bg-emerald-500/20'
                  : ''
              }`}
            >
              <Menu className="h-5 w-5 shrink-0" />
            </span>
            <span className="text-[11px] leading-tight tracking-tight whitespace-nowrap mt-0.5">
              Menu
            </span>
          </button>
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
