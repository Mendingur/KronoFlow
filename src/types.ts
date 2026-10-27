export type TransactionType = 'income' | 'expense';

export type ExpenseCategory =
  | 'Ăn uống'
  | 'Di chuyển'
  | 'Học tập'
  | 'Giải trí'
  | 'Mua sắm'
  | 'Hóa đơn'
  | 'Tiết kiệm'
  | 'Sức khỏe'
  | 'Thu nhập'
  | 'Khác';

export interface Transaction {
  id: string;
  amount: number;
  type: TransactionType;
  category: ExpenseCategory;
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm
  note: string;
}

export interface Habit {
  id: string;
  title: string;
  category: 'Sức khỏe' | 'Tài chính' | 'Học tập' | 'Tâm trí' | 'Công việc';
  targetDaysPerWeek: number;
  completedDates: string[]; // Array of YYYY-MM-DD
}

export type TaskPriority = 'urgent' | 'important' | 'normal';
export type TaskStatus = 'todo' | 'in_progress' | 'done';

export interface SubTask {
  id: string;
  title: string;
  completed: boolean;
}

export interface TaskItem {
  id: string;
  title: string;
  priority: TaskPriority;
  deadline: string; // YYYY-MM-DD HH:mm or YYYY-MM-DD
  status: TaskStatus;
  subtasks: SubTask[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  mode?: 'fast' | 'general' | 'thinking' | 'search' | 'maps';
  sources?: Array<{ title: string; uri: string }>;
}

export interface AppBackupData {
  version: string;
  exportedAt: string;
  monthlyBudget: number;
  transactions: Transaction[];
  habits: Habit[];
  tasks: TaskItem[];
}

export interface UserProfileInfo {
  name: string;
  email: string;
  picture?: string;
}

/** Cấu trúc tệp kronoflow_database.json lưu trên Google Drive của từng người dùng */
export interface KronoFlowDatabase {
  version: string;
  lastUpdated: string; // ISO datetime
  userProfile?: UserProfileInfo;
  settings: {
    darkMode: boolean;
  };
  budgets: {
    monthlyBudget: number;
  };
  transactions: Transaction[];
  habits: Habit[];
  todos: TaskItem[];
}

export interface DriveStorageQuota {
  limit: number; // bytes (0 nếu không giới hạn)
  usage: number; // bytes
  usageInDrive: number; // bytes
  usageInDriveTrash: number; // bytes
  percentage: number; // 0..100
  isNearFull: boolean; // >= 98%
  isFull: boolean; // usage >= limit
}

export type DriveSyncStatus =
  | 'disconnected'
  | 'syncing'
  | 'synced'
  | 'drive_full_unsynced'
  | 'file_trashed_or_deleted'
  | 'auth_expired'
  | 'error';
