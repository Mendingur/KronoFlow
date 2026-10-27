import React, { useState, useEffect, useCallback } from 'react';
import {
  Wallet,
  CheckCircle2,
  Flame,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Award,
  ChevronRight,
  BrainCircuit,
} from 'lucide-react';
import { Transaction, Habit, TaskItem } from '../types';
import {
  formatVND,
  formatDateVN,
  calculateMonthlyFinance,
  calculateDisciplineMetrics,
  calculateTaskMetrics,
} from '../utils/logic';
import { analyzeCoachClientSide } from '../services/geminiClient';

interface OverviewViewProps {
  transactions: Transaction[];
  monthlyBudget: number;
  habits: Habit[];
  tasks: TaskItem[];
  todayISO: string;
  onNavigate: (tab: 'expenses' | 'habits' | 'tasks' | 'chat') => void;
  onToggleHabitToday: (habitId: string) => void;
  onToggleTaskDone: (taskId: string) => void;
}

interface CoachData {
  headline: string;
  financialAdvice: string;
  productivityWarning: string;
  habitMotivation: string;
  actionItems: string[];
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  transactions,
  monthlyBudget,
  habits,
  tasks,
  todayISO,
  onNavigate,
  onToggleHabitToday,
  onToggleTaskDone,
}) => {
  const yearMonth = todayISO.slice(0, 7);
  const finance = calculateMonthlyFinance(transactions, monthlyBudget, yearMonth);
  const discipline = calculateDisciplineMetrics(habits, todayISO);
  const taskStats = calculateTaskMetrics(tasks);

  const [coachData, setCoachData] = useState<CoachData>({
    headline: 'Nhịp độ tài chính và kỷ luật của bạn đang ở mức ổn định, hãy tập trung hoàn thành các mục tiêu trọng tâm hôm nay!',
    financialAdvice: `Bạn đã chi ${formatVND(finance.totalExpense)} (${finance.budgetPercentage}% ngân sách tháng). Hãy ưu tiên duy trì mức chi ăn uống & giải trí hợp lý trong tuần này.`,
    productivityWarning:
      taskStats.urgentPending > 0
        ? `Còn ${taskStats.urgentPending} công việc Quan trọng & Khẩn cấp cần giải quyết dứt điểm trong ngày.`
        : 'Tất cả công việc khẩn cấp hôm nay đã được xử lý gọn gàng.',
    habitMotivation: `Chuỗi kỷ luật ${discipline.overallStreak} ngày liên tiếp (${discipline.rankTitle}) đang tiến triển rất tốt. Hãy hoàn thành đủ ${habits.length} thói quen hôm nay!`,
    actionItems: [
      'Hoàn thành báo cáo dự án Quý 4 trước 17h00 chiều nay.',
      'Duy trì thói quen Đọc sách 30 phút và Không tiêu tiền hoang phí.',
      'Rà soát các khoản chi tiêu nhỏ lẻ bằng tính năng Nhập nhanh AI.',
    ],
  });
  const [loadingCoach, setLoadingCoach] = useState(false);

  const fetchCoachAnalysis = useCallback(async () => {
    setLoadingCoach(true);
    try {
      const json = await analyzeCoachClientSide({
        totalIncome: finance.totalIncome,
        totalExpense: finance.totalExpense,
        monthlyBudget,
        budgetPercentage: finance.budgetPercentage,
        completedTasks: taskStats.done,
        totalTasks: taskStats.total,
        urgentPending: taskStats.urgentPending,
        todayCompletedHabits: discipline.todayCompletedCount,
        totalHabits: habits.length,
        streak: discipline.overallStreak,
        rankTitle: discipline.rankTitle,
      });
      if (json?.data) {
        setCoachData(json.data);
      }
    } catch (err) {
      console.error('Coach analysis error:', err);
    } finally {
      setLoadingCoach(false);
    }
  }, [
    finance.totalIncome,
    finance.totalExpense,
    finance.budgetPercentage,
    monthlyBudget,
    taskStats.done,
    taskStats.total,
    taskStats.urgentPending,
    discipline.todayCompletedCount,
    discipline.overallStreak,
    discipline.rankTitle,
    habits.length,
  ]);

  useEffect(() => {
    // Update default summary numbers smoothly when state changes
    setCoachData((prev) => ({
      ...prev,
      financialAdvice: `Bạn đã chi ${formatVND(finance.totalExpense)} / ${formatVND(monthlyBudget)} (${finance.budgetPercentage}% ngân sách tháng). Số dư khả dụng hiện tại là ${formatVND(finance.balance)}.`,
    }));
  }, [finance.totalExpense, finance.budgetPercentage, finance.balance, monthlyBudget]);

  // Progress bar color based on budgetStatus
  const budgetBarColor =
    finance.budgetStatus === 'danger'
      ? 'bg-red-600'
      : finance.budgetStatus === 'warning'
      ? 'bg-amber-500'
      : 'bg-emerald-600';

  const budgetStatusLabel =
    finance.budgetStatus === 'danger'
      ? 'Vượt hạn mức ngân sách'
      : finance.budgetStatus === 'warning'
      ? 'Sắp chạm trần ngân sách'
      : 'Trong ngưỡng an toàn';

  // Progress ring math
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset =
    circumference - (Math.min(100, Math.max(0, taskStats.completionRate)) / 100) * circumference;

  return (
    <div className="space-y-8">
      {/* KPI Summary Cards */}
      <section aria-label="Chỉ số tổng quan" className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* KPI 1: Số dư tháng này */}
        <div className="rounded-2xl liquid-glass liquid-glass-interactive p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Số dư tháng này (Tháng 10/2026)
              </span>
              <Wallet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div
              data-testid="kpi-monthly-balance"
              className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-mono tabular-nums"
            >
              {formatVND(finance.balance)}
            </div>
            <div className="mt-2 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <ArrowUpRight className="h-3.5 w-3.5" />
                Thu: {formatVND(finance.totalIncome)}
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                <ArrowDownRight className="h-3.5 w-3.5" />
                Chi: {formatVND(finance.totalExpense)}
              </span>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800/80">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-medium text-slate-600 dark:text-slate-300">
                Tiến độ ngân sách: {budgetStatusLabel}
              </span>
              <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                {finance.budgetPercentage}%
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className={`h-full transition-transform duration-200 origin-left ${budgetBarColor}`}
                style={{
                  transform: `scaleX(${Math.min(1, finance.budgetPercentage / 100)})`,
                }}
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              <span>Đã chi: {formatVND(finance.totalExpense)}</span>
              <span>Hạn mức: {formatVND(monthlyBudget)}</span>
            </div>
          </div>
        </div>

        {/* KPI 2: Hiệu suất công việc */}
        <div className="rounded-2xl liquid-glass liquid-glass-interactive p-6 flex flex-col justify-between">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Hiệu suất công việc hôm nay
              </span>
              <div
                data-testid="kpi-task-completion"
                className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-mono tabular-nums"
              >
                {taskStats.completionRate}%
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Đã hoàn thành{' '}
                <strong className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
                  {taskStats.done}/{taskStats.total}
                </strong>{' '}
                nhiệm vụ
              </p>
            </div>

            {/* Progress Ring SVG */}
            <div className="relative h-20 w-20 shrink-0 flex items-center justify-center">
              <svg className="h-20 w-20 -rotate-90 transform" viewBox="0 0 80 80">
                <circle
                  cx="40"
                  cy="40"
                  r={radius}
                  stroke="currentColor"
                  strokeWidth="7"
                  fill="transparent"
                  className="text-slate-100 dark:text-slate-800"
                />
                <circle
                  cx="40"
                  cy="40"
                  r={radius}
                  stroke="currentColor"
                  strokeWidth="7"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  fill="transparent"
                  className="text-emerald-600 dark:text-emerald-400 transition-all duration-200"
                />
              </svg>
              <CheckCircle2 className="absolute h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">
              Việc khẩn cấp chờ xử lý:{' '}
              <strong className="font-mono tabular-nums text-red-600 dark:text-red-400">
                {taskStats.urgentPending}
              </strong>
            </span>
            <button
              type="button"
              onClick={() => onNavigate('tasks')}
              className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400 hover:underline whitespace-nowrap shrink-0"
            >
              Mở danh sách việc
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* KPI 3: Chuỗi kỷ luật */}
        <div className="rounded-2xl liquid-glass liquid-glass-interactive p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Chuỗi kỷ luật & Điểm rèn luyện
              </span>
              <Flame className="h-4 w-4 text-amber-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-3">
              <span
                data-testid="kpi-streak-count"
                className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-mono tabular-nums"
              >
                {discipline.overallStreak} ngày liên tiếp
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <Award className="h-4 w-4 text-amber-500 shrink-0" />
              <span>Cấp bậc:</span>
              <strong className="text-slate-900 dark:text-slate-100">{discipline.rankTitle}</strong>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                {discipline.disciplineScore} điểm
              </span>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">
              Điểm danh hôm nay:{' '}
              <strong className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {discipline.todayCompletedCount}/{habits.length}
              </strong>{' '}
              thói quen
            </span>
            <button
              type="button"
              onClick={() => onNavigate('habits')}
              className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400 hover:underline whitespace-nowrap shrink-0"
            >
              Rèn luyện ngay
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* AI Productivity & Financial Coach Card */}
      <section
        aria-label="AI Huấn luyện viên Năng suất và Tài chính"
        className="rounded-2xl liquid-glass p-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/60 dark:border-slate-800">
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <BrainCircuit className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>AI Huấn luyện viên Năng suất & Tài chính</span>
                <span aria-hidden="true">·</span>
                <span>Phân tích chuyên sâu Gemini 4 Argon (Tư duy bậc cao)</span>
              </div>
              <h2 className="mt-1 text-base font-bold text-slate-900 dark:text-slate-100">
                {coachData.headline}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={fetchCoachAnalysis}
            disabled={loadingCoach}
            className="inline-flex items-center gap-2 rounded-xl claude-liquid-btn px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingCoach ? 'animate-spin' : ''}`} />
            {loadingCoach ? 'Đang phân tích...' : 'Phân tích lại'}
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              01. Đánh giá Chi tiêu & Ngân sách
            </h3>
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {coachData.financialAdvice}
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              02. Cảnh báo Tiến độ Công việc
            </h3>
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {coachData.productivityWarning}
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              03. Động lực Duy trì Kỷ luật
            </h3>
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {coachData.habitMotivation}
            </p>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2.5">
            Đề xuất hành động trọng tâm hôm nay:
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {coachData.actionItems.map((item, idx) => (
              <div
                key={idx}
                className="rounded-xl bg-slate-50 dark:bg-slate-800/60 px-3.5 py-2.5 text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2"
              >
                <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                  0{idx + 1}.
                </span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Quick Action Columns: Today's Habits & Priority Tasks & Recent Expenses */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1: Điểm danh thói quen hôm nay */}
        <div className="rounded-2xl liquid-glass p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Thói quen hôm nay ({formatDateVN(todayISO)})
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Đánh dấu nhanh để cộng Điểm Kỷ Luật
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('habits')}
              className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline whitespace-nowrap shrink-0"
            >
              Xem bảng tháng
            </button>
          </div>

          <div className="divide-y divide-slate-200/50 dark:divide-slate-800">
            {habits.map((hb) => {
              const checked = hb.completedDates.includes(todayISO);
              return (
                <div key={hb.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div
                      className={`text-sm font-medium truncate ${
                        checked
                          ? 'line-through text-slate-400 dark:text-slate-500'
                          : 'text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {hb.title}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {hb.category} · Mục tiêu {hb.targetDaysPerWeek} ngày/tuần
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleHabitToday(hb.id)}
                    aria-label={`Điểm danh hôm nay: ${hb.title}`}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
                      checked
                        ? 'claude-liquid-btn text-white'
                        : 'bg-slate-100/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-700'
                    }`}
                  >
                    {checked ? 'Đã xong' : 'Điểm danh'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Column 2: Công việc ưu tiên cao */}
        <div className="rounded-2xl liquid-glass p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Công việc Ưu tiên trong ngày
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tập trung xử lý việc Quan trọng & Khẩn cấp
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('tasks')}
              className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline whitespace-nowrap shrink-0"
            >
              Quản lý việc
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {tasks.slice(0, 4).map((tsk) => {
              const isDone = tsk.status === 'done';
              const priorityLabel =
                tsk.priority === 'urgent'
                  ? 'Quan trọng & Khẩn cấp'
                  : tsk.priority === 'important'
                  ? 'Quan trọng'
                  : 'Bình thường';
              const priorityColor =
                tsk.priority === 'urgent'
                  ? 'text-red-600 dark:text-red-400'
                  : tsk.priority === 'important'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-slate-500 dark:text-slate-400';

              return (
                <div key={tsk.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div
                      className={`text-sm font-medium truncate ${
                        isDone
                          ? 'line-through text-slate-400 dark:text-slate-500'
                          : 'text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {tsk.title}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <span className={`font-semibold ${priorityColor}`}>{priorityLabel}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{formatDateVN(tsk.deadline)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleTaskDone(tsk.id)}
                    aria-label={`Đổi trạng thái hoàn thành: ${tsk.title}`}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
                      isDone
                        ? 'claude-liquid-btn text-white'
                        : 'bg-slate-100/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-700'
                    }`}
                  >
                    {isDone ? 'Hoàn thành' : 'Đánh dấu xong'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Column 3: Giao dịch gần đây */}
        <div className="rounded-2xl liquid-glass p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Giao dịch Thu / Chi gần nhất
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Cập nhật tức thì vào hạn mức ngân sách
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('expenses')}
              className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline whitespace-nowrap shrink-0"
            >
              Sổ thu chi
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {transactions.slice(0, 5).map((tx) => (
              <div key={tx.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                    {tx.note}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    <span>{tx.category}</span>
                    <span aria-hidden="true"> · </span>
                    <span className="font-mono tabular-nums">{formatDateVN(tx.date)}</span>
                  </div>
                </div>
                <div
                  className={`text-sm font-mono tabular-nums font-semibold whitespace-nowrap shrink-0 ${
                    tx.type === 'income'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-900 dark:text-slate-100'
                  }`}
                >
                  {tx.type === 'income' ? '+' : '-'}
                  {formatVND(tx.amount)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
