import { Habit, KronoFlowDatabase, TaskItem, Transaction, UserProfileInfo } from '../types';

/**
 * Bản đệm LocalStorage của cơ sở dữ liệu KronoFlow.
 * - Luôn được ghi NGAY khi dữ liệu thay đổi, nên không bao giờ mất thao tác người dùng vừa nhập.
 * - Là nguồn để khôi phục lên Google Drive khi tệp kronoflow_database.json bị xóa / vào Thùng rác.
 * - Gắn với đúng một tài khoản Google (email) để dữ liệu người này không lẫn sang người khác.
 */
export const LOCAL_DB_STORAGE_KEY = 'kronoflow_local_db_v2';
export const DATABASE_VERSION = '2.0';

export interface LocalSnapshot {
  account: string;
  pendingSync: boolean; // true = có thay đổi chưa đồng bộ lên Google Drive
  savedAt: string;
  db: KronoFlowDatabase;
}

export function loadLocalSnapshot(): LocalSnapshot | null {
  try {
    const raw = localStorage.getItem(LOCAL_DB_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalSnapshot> | null;
    if (!parsed || typeof parsed.account !== 'string' || !parsed.db) return null;
    return {
      account: parsed.account,
      pendingSync: Boolean(parsed.pendingSync),
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
      db: normalizeDatabase(parsed.db, parsed.db as KronoFlowDatabase),
    };
  } catch {
    return null;
  }
}

/** Trả về false nếu LocalStorage đầy hoặc bị chặn */
export function saveLocalSnapshot(snapshot: LocalSnapshot): boolean {
  try {
    localStorage.setItem(LOCAL_DB_STORAGE_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

export function clearLocalSnapshot(): void {
  try {
    localStorage.removeItem(LOCAL_DB_STORAGE_KEY);
  } catch {
    // Bỏ qua lỗi truy cập storage
  }
}

/**
 * Chuẩn hóa dữ liệu đọc từ Drive/LocalStorage về đúng cấu trúc hiện hành.
 * Vẫn đọc được các tên trường cũ (tasks, updatedAt, settings.monthlyBudget) để không mất dữ liệu.
 */
export function normalizeDatabase(raw: unknown, fallback: KronoFlowDatabase): KronoFlowDatabase {
  if (!raw || typeof raw !== 'object') return fallback;
  const obj = raw as Record<string, unknown>;
  const settings = (obj.settings ?? {}) as Record<string, unknown>;
  const budgets = (obj.budgets ?? {}) as Record<string, unknown>;

  const budgetCandidate =
    typeof budgets.monthlyBudget === 'number' ? budgets.monthlyBudget : settings.monthlyBudget;
  const monthlyBudget =
    typeof budgetCandidate === 'number' && budgetCandidate > 0
      ? budgetCandidate
      : fallback.budgets.monthlyBudget;

  const todosRaw = Array.isArray(obj.todos) ? obj.todos : obj.tasks;

  return {
    version: typeof obj.version === 'string' ? obj.version : DATABASE_VERSION,
    lastUpdated:
      typeof obj.lastUpdated === 'string'
        ? obj.lastUpdated
        : typeof obj.updatedAt === 'string'
        ? obj.updatedAt
        : new Date().toISOString(),
    userProfile: (obj.userProfile as UserProfileInfo | undefined) ?? fallback.userProfile,
    settings: {
      darkMode: typeof settings.darkMode === 'boolean' ? settings.darkMode : fallback.settings.darkMode,
    },
    budgets: { monthlyBudget },
    transactions: Array.isArray(obj.transactions)
      ? (obj.transactions as Transaction[])
      : fallback.transactions,
    habits: Array.isArray(obj.habits) ? (obj.habits as Habit[]) : fallback.habits,
    todos: Array.isArray(todosRaw) ? (todosRaw as TaskItem[]) : fallback.todos,
  };
}

// ───────── Chế độ không đăng nhập: dữ liệu chỉ nằm trong LocalStorage của trình duyệt này ─────────

export const LOCAL_MODE_STORAGE_KEY = 'kronoflow_mode_v1';
export const LOCAL_ONLY_DB_STORAGE_KEY = 'kronoflow_local_only_db_v1';

export function isLocalModeEnabled(): boolean {
  try {
    return localStorage.getItem(LOCAL_MODE_STORAGE_KEY) === 'local';
  } catch {
    return false;
  }
}

export function setLocalModeEnabled(enabled: boolean): void {
  try {
    if (enabled) {
      localStorage.setItem(LOCAL_MODE_STORAGE_KEY, 'local');
    } else {
      localStorage.removeItem(LOCAL_MODE_STORAGE_KEY);
    }
  } catch {
    // Bỏ qua lỗi truy cập storage
  }
}

export function loadLocalOnlyDatabase(): KronoFlowDatabase | null {
  try {
    const raw = localStorage.getItem(LOCAL_ONLY_DB_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return normalizeDatabase(parsed, parsed as KronoFlowDatabase);
  } catch {
    return null;
  }
}

export function saveLocalOnlyDatabase(db: KronoFlowDatabase): boolean {
  try {
    localStorage.setItem(LOCAL_ONLY_DB_STORAGE_KEY, JSON.stringify(db));
    return true;
  } catch {
    return false;
  }
}

/** Dấu vân tay nội dung (bỏ qua lastUpdated) để biết dữ liệu đã thật sự thay đổi chưa */
export function databaseContentHash(db: KronoFlowDatabase): string {
  return JSON.stringify([db.settings, db.budgets, db.transactions, db.habits, db.todos]);
}
