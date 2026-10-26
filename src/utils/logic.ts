import { Transaction, Habit, TaskItem, AppBackupData, ExpenseCategory } from '../types';

export const VALID_CATEGORIES: ExpenseCategory[] = [
  'Ăn uống',
  'Di chuyển',
  'Học tập',
  'Giải trí',
  'Mua sắm',
  'Hóa đơn',
  'Tiết kiệm',
  'Sức khỏe',
  'Thu nhập',
  'Khác',
];

/**
 * Định dạng tiền tệ chuẩn Việt Nam (ví dụ: 45000 -> "45.000 đ")
 */
export function formatVND(amount: number): string {
  if (!Number.isFinite(amount)) return '0 đ';
  const sign = amount < 0 ? '-' : '';
  const abs = Math.round(Math.abs(amount));
  const formatted = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}${formatted} đ`;
}

/**
 * Phân tích cú pháp nhập tiền viết tắt tiếng Việt:
 * - "45k" / "45K" / "45 nghìn" / "45ng" -> 45000
 * - "1tr5" / "1m5" -> 1500000
 * - "15tr250" -> 15250000
 * - "1.5tr" / "1,5tr" -> 1500000
 * - "2tr" / "2 triệu" -> 2000000
 * - "5lit" / "5 lít" -> 500000
 * - "45.000" / "45,000" / "45000" -> 45000
 */
export function parseVietnameseCurrencyInput(raw: string): number {
  if (!raw || typeof raw !== 'string') return 0;
  const cleaned = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (!cleaned) return 0;

  // Match pattern like "1tr5", "15tr250", "2m5"
  const trCompactMatch = cleaned.match(/^(\d+)(?:tr|trieu|triệu|m)(\d+)$/);
  if (trCompactMatch) {
    const millions = parseInt(trCompactMatch[1], 10);
    const remainderStr = trCompactMatch[2];
    const decimals = parseInt(remainderStr.padEnd(6, '0').slice(0, 6), 10);
    return millions * 1_000_000 + decimals;
  }

  // Match pattern like "1.5tr", "1,5tr", "2tr", "2triệu"
  const trDecimalMatch = cleaned.match(/^(\d+(?:[.,]\d+)?)(?:tr|trieu|triệu|m)$/);
  if (trDecimalMatch) {
    const val = parseFloat(trDecimalMatch[1].replace(',', '.'));
    return Math.round(val * 1_000_000);
  }

  // Match pattern like "5lit", "5lít" (1 lít = 100.000 đ)
  const litMatch = cleaned.match(/^(\d+(?:[.,]\d+)?)(?:lit|lít)$/);
  if (litMatch) {
    const val = parseFloat(litMatch[1].replace(',', '.'));
    return Math.round(val * 100_000);
  }

  // Match pattern like "45k", "45nghin", "45nghìn", "45ng", "1.5k"
  const kMatch = cleaned.match(/^(\d+(?:[.,]\d+)?)(?:k|nghin|nghìn|ng|ngan|ngàn)$/);
  if (kMatch) {
    const val = parseFloat(kMatch[1].replace(',', '.'));
    return Math.round(val * 1_000);
  }

  // Standard formatted number with dots/commas or plain digits (e.g. "45.000 đ" or "120000")
  const digitsOnly = cleaned.replace(/[^\d]/g, '');
  if (!digitsOnly) return 0;
  return parseInt(digitsOnly, 10);
}

/**
 * Định dạng ngày YYYY-MM-DD sang chuẩn Việt Nam DD/MM/YYYY
 */
export function formatDateVN(isoDate: string): string {
  if (!isoDate) return '';
  const datePart = isoDate.split(' ')[0].split('T')[0];
  const parts = datePart.split('-');
  if (parts.length !== 3) return isoDate;
  const [year, month, day] = parts;
  return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
}

/**
 * Lấy danh sách N ngày gần nhất tính đến todayISO (YYYY-MM-DD) theo thứ tự tăng dần
 */
export function getLastNDaysISO(todayISO: string, count: number): string[] {
  const result: string[] = [];
  const [y, m, d] = todayISO.split('-').map(Number);
  const baseDate = new Date(Date.UTC(y, m - 1, d));
  for (let i = count - 1; i >= 0; i--) {
    const dt = new Date(baseDate.getTime() - i * 86_400_000);
    const yyyy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    result.push(`${yyyy}-${mm}-${dd}`);
  }
  return result;
}

/**
 * Tính toán các chỉ số tài chính trong tháng và trạng thái ngân sách
 */
export function calculateMonthlyFinance(
  transactions: Transaction[],
  monthlyBudget: number,
  yearMonthPrefix?: string
) {
  const filtered = yearMonthPrefix
    ? transactions.filter((t) => t.date.startsWith(yearMonthPrefix))
    : transactions;

  let totalIncome = 0;
  let totalExpense = 0;

  for (const tx of filtered) {
    if (tx.type === 'income') {
      totalIncome += tx.amount;
    } else {
      totalExpense += tx.amount;
    }
  }

  const balance = totalIncome - totalExpense;
  const safeBudget = monthlyBudget > 0 ? monthlyBudget : 1;
  const budgetPercentage = Math.round((totalExpense / safeBudget) * 1000) / 10;

  let budgetStatus: 'safe' | 'warning' | 'danger' = 'safe';
  if (budgetPercentage >= 100) {
    budgetStatus = 'danger';
  } else if (budgetPercentage >= 75) {
    budgetStatus = 'warning';
  }

  return {
    totalIncome,
    totalExpense,
    balance,
    budgetPercentage,
    budgetStatus,
  };
}

/**
 * Tính chuỗi ngày liên tiếp (Current Streak & Best Streak) cho một thói quen
 */
export function calculateHabitStreak(completedDates: string[], todayISO: string): {
  currentStreak: number;
  bestStreak: number;
} {
  if (!completedDates || completedDates.length === 0) {
    return { currentStreak: 0, bestStreak: 0 };
  }

  const uniqueSorted = Array.from(new Set(completedDates)).sort();
  const dateSet = new Set(uniqueSorted);

  // Calculate best streak
  let bestStreak = 0;
  let running = 0;
  let prevTime: number | null = null;

  for (const dtStr of uniqueSorted) {
    const [y, m, d] = dtStr.split('-').map(Number);
    const curTime = Date.UTC(y, m - 1, d);
    if (prevTime !== null && curTime - prevTime === 86_400_000) {
      running += 1;
    } else {
      running = 1;
    }
    if (running > bestStreak) bestStreak = running;
    prevTime = curTime;
  }

  // Calculate current streak up to todayISO (or yesterday if today is not yet checked)
  const [ty, tm, td] = todayISO.split('-').map(Number);
  const todayTime = Date.UTC(ty, tm - 1, td);
  const yesterdayDate = new Date(todayTime - 86_400_000);
  const yesterdayISO = `${yesterdayDate.getUTCFullYear()}-${String(
    yesterdayDate.getUTCMonth() + 1
  ).padStart(2, '0')}-${String(yesterdayDate.getUTCDate()).padStart(2, '0')}`;

  let cursorTime: number | null = null;
  if (dateSet.has(todayISO)) {
    cursorTime = todayTime;
  } else if (dateSet.has(yesterdayISO)) {
    cursorTime = todayTime - 86_400_000;
  } else {
    return { currentStreak: 0, bestStreak };
  }

  let currentStreak = 0;
  while (cursorTime !== null) {
    const dt = new Date(cursorTime);
    const iso = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(
      dt.getUTCDate()
    ).padStart(2, '0')}`;
    if (dateSet.has(iso)) {
      currentStreak += 1;
      cursorTime -= 86_400_000;
    } else {
      break;
    }
  }

  return { currentStreak, bestStreak: Math.max(bestStreak, currentStreak) };
}

/**
 * Tính Điểm Kỷ Luật (Discipline Score) & Cấp bậc (Tân binh -> Bền bỉ -> Kỷ luật thép)
 */
export function calculateDisciplineMetrics(habits: Habit[], todayISO: string) {
  if (habits.length === 0) {
    return {
      overallStreak: 0,
      bestStreak: 0,
      disciplineScore: 0,
      rankTitle: 'Tân binh',
      nextRankTitle: 'Bền bỉ',
      nextRankThreshold: 150,
      todayCompletedCount: 0,
      weeklyConsistencyRate: 0,
    };
  }

  const last7Days = getLastNDaysISO(todayISO, 7);
  let totalCheckIns = 0;
  let maxCurrentStreak = 0;
  let maxBestStreak = 0;
  let todayCompletedCount = 0;
  let missedHabitPenalties = 0;
  let last7CheckIns = 0;

  for (const habit of habits) {
    totalCheckIns += habit.completedDates.length;
    if (habit.completedDates.includes(todayISO)) {
      todayCompletedCount += 1;
    }
    const { currentStreak, bestStreak } = calculateHabitStreak(habit.completedDates, todayISO);
    if (currentStreak > maxCurrentStreak) maxCurrentStreak = currentStreak;
    if (bestStreak > maxBestStreak) maxBestStreak = bestStreak;
    if (currentStreak === 0 && habit.completedDates.length > 0) {
      missedHabitPenalties += 15; // Deduct points for broken streak
    }
    for (const d of last7Days) {
      if (habit.completedDates.includes(d)) last7CheckIns += 1;
    }
  }

  // Compute overall consecutive days where at least 1 habit was completed
  const allDates = Array.from(new Set(habits.flatMap((h) => h.completedDates)));
  const overallStreakInfo = calculateHabitStreak(allDates, todayISO);

  const rawScore =
    totalCheckIns * 12 +
    overallStreakInfo.currentStreak * 20 +
    todayCompletedCount * 10 -
    missedHabitPenalties;
  const disciplineScore = Math.max(0, rawScore);

  let rankTitle = 'Tân binh';
  let nextRankTitle = 'Bền bỉ';
  let nextRankThreshold = 150;

  if (disciplineScore >= 350) {
    rankTitle = 'Kỷ luật thép';
    nextRankTitle = 'Huyền thoại Kỷ luật';
    nextRankThreshold = 600;
  } else if (disciplineScore >= 150) {
    rankTitle = 'Bền bỉ';
    nextRankTitle = 'Kỷ luật thép';
    nextRankThreshold = 350;
  }

  const weeklyConsistencyRate = Math.min(
    100,
    Math.round((last7CheckIns / Math.max(1, habits.length * 7)) * 100)
  );

  return {
    overallStreak: overallStreakInfo.currentStreak,
    bestStreak: Math.max(maxBestStreak, overallStreakInfo.bestStreak),
    disciplineScore,
    rankTitle,
    nextRankTitle,
    nextRankThreshold,
    todayCompletedCount,
    weeklyConsistencyRate,
  };
}

/**
 * Tính hiệu suất hoàn thành công việc hằng ngày
 */
export function calculateTaskMetrics(tasks: TaskItem[]) {
  const total = tasks.length;
  if (total === 0) {
    return {
      total: 0,
      done: 0,
      inProgress: 0,
      todo: 0,
      urgentPending: 0,
      completionRate: 0,
    };
  }

  const done = tasks.filter((t) => t.status === 'done').length;
  const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
  const todo = tasks.filter((t) => t.status === 'todo').length;
  const urgentPending = tasks.filter((t) => t.priority === 'urgent' && t.status !== 'done').length;
  const completionRate = Math.round((done / total) * 100);

  return {
    total,
    done,
    inProgress,
    todo,
    urgentPending,
    completionRate,
  };
}

/**
 * Kiểm tra tính hợp lệ của file JSON sao lưu trước khi khôi phục
 */
export function validateBackupJson(data: unknown): { valid: boolean; error?: string; payload?: AppBackupData } {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Dữ liệu JSON không hợp lệ hoặc bị rỗng.' };
  }
  const obj = data as Record<string, unknown>;
  if (typeof obj.monthlyBudget !== 'number' || obj.monthlyBudget < 0) {
    return { valid: false, error: 'Thiếu hoặc sai định dạng hạn mức ngân sách tháng (monthlyBudget).' };
  }
  if (!Array.isArray(obj.transactions)) {
    return { valid: false, error: 'Thiếu danh sách giao dịch (transactions).' };
  }
  if (!Array.isArray(obj.habits)) {
    return { valid: false, error: 'Thiếu danh sách thói quen (habits).' };
  }
  if (!Array.isArray(obj.tasks)) {
    return { valid: false, error: 'Thiếu danh sách công việc (tasks).' };
  }
  return {
    valid: true,
    payload: {
      version: typeof obj.version === 'string' ? obj.version : '1.0',
      exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
      monthlyBudget: obj.monthlyBudget,
      transactions: obj.transactions as Transaction[],
      habits: obj.habits as Habit[],
      tasks: obj.tasks as TaskItem[],
    },
  };
}
