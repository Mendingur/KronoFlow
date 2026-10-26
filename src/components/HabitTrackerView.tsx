import React, { useState, useMemo } from 'react';
import {
  Flame,
  Award,
  Plus,
  Edit3,
  Trash2,
  Check,
  TrendingUp,
} from 'lucide-react';
import { Habit } from '../types';
import {
  getLastNDaysISO,
  calculateHabitStreak,
  calculateDisciplineMetrics,
} from '../utils/logic';

interface HabitTrackerViewProps {
  habits: Habit[];
  todayISO: string;
  onToggleHabitDate: (habitId: string, dateISO: string) => void;
  onAddHabit: (habit: Omit<Habit, 'id' | 'completedDates'>) => void;
  onUpdateHabit: (habit: Habit) => void;
  onRequestDeleteHabit: (habit: Habit) => void;
}

const HABIT_CATEGORIES: Habit['category'][] = [
  'Sức khỏe',
  'Tài chính',
  'Học tập',
  'Tâm trí',
  'Công việc',
];

export const HabitTrackerView: React.FC<HabitTrackerViewProps> = ({
  habits,
  todayISO,
  onToggleHabitDate,
  onAddHabit,
  onUpdateHabit,
  onRequestDeleteHabit,
}) => {
  const [gridMode, setGridMode] = useState<'week' | 'month'>('week');
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [titleInput, setTitleInput] = useState('');
  const [categoryInput, setCategoryInput] = useState<Habit['category']>('Sức khỏe');
  const [targetInput, setTargetInput] = useState<number>(7);
  const [formError, setFormError] = useState('');

  const daysToDisplay = useMemo(
    () => getLastNDaysISO(todayISO, gridMode === 'week' ? 7 : 14),
    [todayISO, gridMode]
  );

  const metrics = useMemo(
    () => calculateDisciplineMetrics(habits, todayISO),
    [habits, todayISO]
  );

  const handleSaveHabit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!titleInput.trim()) {
      setFormError('Vui lòng nhập tên thói quen cần rèn luyện.');
      return;
    }
    setFormError('');

    if (editingHabit) {
      onUpdateHabit({
        ...editingHabit,
        title: titleInput.trim(),
        category: categoryInput,
        targetDaysPerWeek: targetInput,
      });
      setEditingHabit(null);
    } else {
      onAddHabit({
        title: titleInput.trim(),
        category: categoryInput,
        targetDaysPerWeek: targetInput,
      });
    }
    setTitleInput('');
    setTargetInput(7);
  };

  const handleStartEdit = (hb: Habit) => {
    setEditingHabit(hb);
    setTitleInput(hb.title);
    setCategoryInput(hb.category);
    setTargetInput(hb.targetDaysPerWeek);
    setFormError('');
  };

  const rankProgressPercent = Math.min(
    100,
    Math.round((metrics.disciplineScore / metrics.nextRankThreshold) * 100)
  );

  return (
    <div className="space-y-8">
      {/* Gamification & Discipline Score Banner */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rounded-2xl liquid-glass liquid-glass-interactive p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Cấp bậc & Điểm Kỷ Luật
            </span>
            <Award className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2.5">
            <span
              data-testid="habit-rank-title"
              className="text-2xl font-bold text-slate-900 dark:text-slate-100"
            >
              {metrics.rankTitle}
            </span>
            <span className="text-sm font-mono tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
              {metrics.disciplineScore} điểm
            </span>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5">
              <span>Tiến tới: {metrics.nextRankTitle}</span>
              <span className="font-mono tabular-nums">
                {metrics.disciplineScore}/{metrics.nextRankThreshold}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-transform duration-200 origin-left"
                style={{ transform: `scaleX(${rankProgressPercent / 100})` }}
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl liquid-glass liquid-glass-interactive p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Chuỗi ngày liên tiếp (Current Streak)
            </span>
            <Flame className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {metrics.overallStreak} ngày
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Kỷ lục cao nhất (Best Streak):{' '}
            <strong className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
              {metrics.bestStreak} ngày
            </strong>
          </p>
        </div>

        <div className="rounded-2xl liquid-glass liquid-glass-interactive p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Tỷ lệ duy trì 7 ngày qua
            </span>
            <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {metrics.weeklyConsistencyRate}%
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Hôm nay đã hoàn thành{' '}
            <strong className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              {metrics.todayCompletedCount}/{habits.length}
            </strong>{' '}
            thói quen
          </p>
        </div>
      </section>

      {/* Create / Edit Habit Form */}
      <section className="rounded-2xl liquid-glass p-6">
        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
          {editingHabit ? 'Chỉnh sửa thói quen kỷ luật' : 'Thiết lập thói quen kỷ luật mới'}
        </h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Mỗi lần điểm danh hoàn thành cộng +12 điểm kỷ luật; đứt chuỗi bị trừ -15 điểm
        </p>

        <form onSubmit={handleSaveHabit} className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-5">
            <label
              htmlFor="habit-title-input"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
            >
              Tên thói quen rèn luyện
            </label>
            <input
              id="habit-title-input"
              type="text"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              placeholder="VD: Dậy lúc 6h sáng, Đọc sách 30 phút, Không tiêu hoang..."
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="md:col-span-3">
            <label
              htmlFor="habit-category-select"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
            >
              Nhóm kỷ luật
            </label>
            <select
              id="habit-category-select"
              value={categoryInput}
              onChange={(e) => setCategoryInput(e.target.value as Habit['category'])}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100"
            >
              {HABIT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label
              htmlFor="habit-target-select"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
            >
              Mục tiêu / tuần
            </label>
            <select
              id="habit-target-select"
              value={targetInput}
              onChange={(e) => setTargetInput(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100"
            >
              {[3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>
                  {n} ngày/tuần
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2 flex items-center gap-2">
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 dark:bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" />
              {editingHabit ? 'Lưu sửa' : 'Thêm mới'}
            </button>
            {editingHabit && (
              <button
                type="button"
                onClick={() => {
                  setEditingHabit(null);
                  setTitleInput('');
                }}
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300"
              >
                Hủy
              </button>
            )}
          </div>
        </form>
        {formError && (
          <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{formError}</p>
        )}
      </section>

      {/* Interactive Check-in Grid */}
      <section className="rounded-2xl liquid-glass p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Bảng Điểm danh Thói quen Tương tác ({habits.length})
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Nhấn vào từng ô ngày để đánh dấu hoặc bỏ đánh dấu hoàn thành
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800 self-start">
            <button
              type="button"
              onClick={() => setGridMode('week')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                gridMode === 'week'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Xem theo Tuần (7 ngày)
            </button>
            <button
              type="button"
              onClick={() => setGridMode('month')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                gridMode === 'month'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Xem mở rộng (14 ngày)
            </button>
          </div>
        </div>

        <div className="overflow-x-auto mt-4">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400">
                <th className="py-3 pr-4 min-w-[220px]">Thói quen & Nhóm</th>
                <th className="py-3 px-3 text-center whitespace-nowrap">Chuỗi / Kỷ lục</th>
                {daysToDisplay.map((iso) => {
                  const [, m, d] = iso.split('-');
                  const isToday = iso === todayISO;
                  return (
                    <th
                      key={iso}
                      className={`py-3 px-2 text-center font-mono tabular-nums ${
                        isToday ? 'text-emerald-600 dark:text-emerald-400 font-bold' : ''
                      }`}
                    >
                      <div>
                        {d}/{m}
                      </div>
                      <div className="text-[10px] font-normal">
                        {isToday ? 'Hôm nay' : ''}
                      </div>
                    </th>
                  );
                })}
                <th className="py-3 pl-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {habits.map((hb) => {
                const { currentStreak, bestStreak } = calculateHabitStreak(
                  hb.completedDates,
                  todayISO
                );
                return (
                  <tr
                    key={hb.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3.5 pr-4">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {hb.title}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {hb.category} · Mục tiêu {hb.targetDaysPerWeek} ngày/tuần
                      </div>
                    </td>

                    <td className="py-3.5 px-3 text-center font-mono tabular-nums whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400">
                        <Flame className="h-3.5 w-3.5" />
                        {currentStreak}d
                      </span>
                      <span className="text-xs text-slate-400"> / {bestStreak}d</span>
                    </td>

                    {daysToDisplay.map((iso) => {
                      const done = hb.completedDates.includes(iso);
                      const [, m, d] = iso.split('-');
                      return (
                        <td key={iso} className="py-3.5 px-1.5 text-center">
                          <button
                            type="button"
                            onClick={() => onToggleHabitDate(hb.id, iso)}
                            aria-label={`Điểm danh ${hb.title} ngày ${d}/${m}`}
                            className={`h-8 w-8 rounded-lg inline-flex items-center justify-center transition-colors ${
                              done
                                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                            }`}
                          >
                            {done && <Check className="h-4 w-4" />}
                          </button>
                        </td>
                      );
                    })}

                    <td className="py-3.5 pl-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(hb)}
                          aria-label={`Sửa thói quen ${hb.title}`}
                          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRequestDeleteHabit(hb)}
                          aria-label={`Xóa thói quen ${hb.title}`}
                          className="p-1.5 rounded-lg text-slate-500 hover:bg-red-50 dark:hover:bg-red-950/50 hover:text-red-600 dark:hover:text-red-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
