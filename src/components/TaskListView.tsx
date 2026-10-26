import React, { useState, useMemo } from 'react';
import {
  Plus,
  Wand2,
  Trash2,
  Edit3,
  Search,
  ChevronDown,
  ChevronRight,
  CheckSquare,
  Square,
  ListChecks,
} from 'lucide-react';
import { TaskItem, TaskPriority, TaskStatus, SubTask } from '../types';
import { formatDateVN, calculateTaskMetrics } from '../utils/logic';
import { breakdownTaskClientSide } from '../services/geminiClient';

interface TaskListViewProps {
  tasks: TaskItem[];
  todayISO: string;
  onAddTask: (task: Omit<TaskItem, 'id'>) => void;
  onUpdateTask: (task: TaskItem) => void;
  onRequestDeleteTask: (task: TaskItem) => void;
}

export const TaskListView: React.FC<TaskListViewProps> = ({
  tasks,
  todayISO,
  onAddTask,
  onUpdateTask,
  onRequestDeleteTask,
}) => {
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('urgent');
  const [deadlineDate, setDeadlineDate] = useState(todayISO);
  const [deadlineTime, setDeadlineTime] = useState('17:00');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [draftSubtasks, setDraftSubtasks] = useState<SubTask[]>([]);
  const [newSubtaskText, setNewSubtaskText] = useState('');
  const [formError, setFormError] = useState('');

  // AI Breakdown state
  const [loadingTaskId, setLoadingTaskId] = useState<string | null>(null);
  const [loadingFormAi, setLoadingFormAi] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState<'all' | TaskPriority>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | TaskStatus>('all');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({
    'tsk-1': true,
    'tsk-2': true,
  });

  const stats = useMemo(() => calculateTaskMetrics(tasks), [tasks]);

  const filteredTasks = useMemo(() => {
    const priorityOrder: Record<TaskPriority, number> = {
      urgent: 0,
      important: 1,
      normal: 2,
    };
    return tasks
      .filter((t) => {
        if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
        if (filterStatus !== 'all' && t.status !== filterStatus) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          return (
            t.title.toLowerCase().includes(q) ||
            t.subtasks.some((s) => s.title.toLowerCase().includes(q))
          );
        }
        return true;
      })
      .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  }, [tasks, filterPriority, filterStatus, searchQuery]);

  // AI Breakdown for Creation Form
  const handleFormAiBreakdown = async () => {
    if (!title.trim()) {
      setFormError('Vui lòng nhập tên mục tiêu/công việc trước khi bấm Chia nhỏ bằng AI.');
      return;
    }
    setFormError('');
    setLoadingFormAi(true);
    try {
      const data = await breakdownTaskClientSide(title);
      if (Array.isArray(data.subtasks)) {
        const generated: SubTask[] = data.subtasks.map((st: string, i: number) => ({
          id: `st-draft-${Date.now()}-${i}`,
          title: st,
          completed: false,
        }));
        setDraftSubtasks((prev) => [...prev, ...generated]);
      }
    } catch (err) {
      console.error('AI breakdown error:', err);
    } finally {
      setLoadingFormAi(false);
    }
  };

  // AI Breakdown for an existing Task in the list
  const handleExistingTaskAiBreakdown = async (task: TaskItem) => {
    setLoadingTaskId(task.id);
    setExpandedIds((prev) => ({ ...prev, [task.id]: true }));
    try {
      const data = await breakdownTaskClientSide(task.title);
      if (Array.isArray(data.subtasks)) {
        const added: SubTask[] = data.subtasks.map((st: string, idx: number) => ({
          id: `st-${Date.now()}-${idx}`,
          title: st,
          completed: false,
        }));
        onUpdateTask({
          ...task,
          subtasks: [...task.subtasks, ...added],
        });
      }
    } catch (err) {
      console.error('AI task breakdown error:', err);
    } finally {
      setLoadingTaskId(null);
    }
  };

  const handleAddDraftSubtask = () => {
    if (!newSubtaskText.trim()) return;
    setDraftSubtasks((prev) => [
      ...prev,
      {
        id: `st-manual-${Date.now()}`,
        title: newSubtaskText.trim(),
        completed: false,
      },
    ]);
    setNewSubtaskText('');
  };

  const handleSaveTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setFormError('Vui lòng nhập tiêu đề công việc.');
      return;
    }
    setFormError('');

    const fullDeadline = `${deadlineDate} ${deadlineTime}`.trim();
    if (editingTask) {
      onUpdateTask({
        ...editingTask,
        title: title.trim(),
        priority,
        deadline: fullDeadline,
        status,
        subtasks: draftSubtasks,
      });
      setEditingTask(null);
    } else {
      onAddTask({
        title: title.trim(),
        priority,
        deadline: fullDeadline,
        status,
        subtasks: draftSubtasks,
      });
    }

    setTitle('');
    setDraftSubtasks([]);
    setStatus('todo');
  };

  const handleStartEdit = (task: TaskItem) => {
    setEditingTask(task);
    setTitle(task.title);
    setPriority(task.priority);
    const [dPart, tPart] = task.deadline.split(' ');
    setDeadlineDate(dPart || todayISO);
    setDeadlineTime(tPart || '17:00');
    setStatus(task.status);
    setDraftSubtasks(task.subtasks);
    setFormError('');
  };

  const handleToggleSubtask = (task: TaskItem, subtaskId: string) => {
    const updatedSubtasks = task.subtasks.map((s) =>
      s.id === subtaskId ? { ...s, completed: !s.completed } : s
    );
    const allCompleted =
      updatedSubtasks.length > 0 && updatedSubtasks.every((s) => s.completed);
    onUpdateTask({
      ...task,
      subtasks: updatedSubtasks,
      status: allCompleted ? 'done' : task.status === 'done' ? 'in_progress' : task.status,
    });
  };

  const priorityMeta = (p: TaskPriority) => {
    if (p === 'urgent') {
      return {
        label: 'Quan trọng & Khẩn cấp',
        colorClass: 'text-red-600 dark:text-red-400',
        dotClass: 'bg-red-600',
      };
    }
    if (p === 'important') {
      return {
        label: 'Quan trọng',
        colorClass: 'text-amber-600 dark:text-amber-400',
        dotClass: 'bg-amber-500',
      };
    }
    return {
      label: 'Bình thường',
      colorClass: 'text-sky-600 dark:text-sky-400',
      dotClass: 'bg-sky-500',
    };
  };

  return (
    <div className="space-y-8">
      {/* Priority Matrix Summary Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="rounded-2xl liquid-glass liquid-glass-interactive p-5">
          <span className="text-xs text-slate-500 dark:text-slate-400">Tổng số công việc</span>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {stats.total} nhiệm vụ
          </div>
        </div>
        <div className="rounded-2xl liquid-glass liquid-glass-interactive p-5">
          <span className="text-xs text-red-600 dark:text-red-400 font-medium">
            Quan trọng & Khẩn cấp (Chờ làm)
          </span>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-red-600 dark:text-red-400">
            {stats.urgentPending} việc
          </div>
        </div>
        <div className="rounded-2xl liquid-glass liquid-glass-interactive p-5">
          <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
            Đang thực hiện
          </span>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {stats.inProgress} việc
          </div>
        </div>
        <div className="rounded-2xl liquid-glass liquid-glass-interactive p-5">
          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            Tỷ lệ hoàn thành
          </span>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
            {stats.completionRate}% ({stats.done}/{stats.total})
          </div>
        </div>
      </section>

      {/* Task Creation & AI Task Breakdown Form */}
      <section className="rounded-2xl liquid-glass p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {editingTask ? 'Cập nhật Công việc' : 'Thêm Công việc mới & Chia nhỏ bằng AI'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Phân nhóm theo Ma trận Eisenhower và dùng AI tự động tách thành các bước nhỏ khả thi
            </p>
          </div>
          <button
            type="button"
            onClick={handleFormAiBreakdown}
            disabled={loadingFormAi}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
          >
            <Wand2 className="h-3.5 w-3.5" />
            {loadingFormAi ? 'AI đang chia nhỏ...' : 'Chia nhỏ bằng AI'}
          </button>
        </div>

        <form onSubmit={handleSaveTask} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-5">
              <label
                htmlFor="task-title-input"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Tiêu đề công việc / Mục tiêu lớn
              </label>
              <input
                id="task-title-input"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="VD: Ôn thi cuối kỳ môn Kinh tế vĩ mô, Lên kế hoạch Đà Lạt..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="md:col-span-3">
              <label
                htmlFor="task-priority-select"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Mức độ ưu tiên
              </label>
              <select
                id="task-priority-select"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100"
              >
                <option value="urgent">1. Quan trọng & Khẩn cấp (Đỏ)</option>
                <option value="important">2. Quan trọng (Vàng cam)</option>
                <option value="normal">3. Bình thường (Xanh lam)</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label
                htmlFor="task-deadline-date"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Hạn hoàn thành
              </label>
              <input
                id="task-deadline-date"
                type="date"
                value={deadlineDate}
                onChange={(e) => setDeadlineDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="md:col-span-2">
              <label
                htmlFor="task-status-select"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Trạng thái
              </label>
              <select
                id="task-status-select"
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100"
              >
                <option value="todo">Chưa làm</option>
                <option value="in_progress">Đang làm</option>
                <option value="done">Hoàn thành</option>
              </select>
            </div>
          </div>

          {/* Subtasks builder */}
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-4 border border-slate-200/70 dark:border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Danh sách công việc con ({draftSubtasks.length})
              </span>
            </div>

            <div className="flex items-center gap-2 mb-3">
              <input
                type="text"
                value={newSubtaskText}
                onChange={(e) => setNewSubtaskText(e.target.value)}
                placeholder="Thêm bước thực hiện nhỏ..."
                aria-label="Nhập bước thực hiện nhỏ"
                className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={handleAddDraftSubtask}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                + Thêm bước
              </button>
            </div>

            {draftSubtasks.length > 0 && (
              <ul className="space-y-1.5">
                {draftSubtasks.map((st, idx) => (
                  <li
                    key={st.id}
                    className="flex items-center justify-between text-xs bg-white dark:bg-slate-900 px-3 py-2 rounded-lg border border-slate-100 dark:border-slate-800"
                  >
                    <span className="text-slate-700 dark:text-slate-300">
                      <strong className="font-mono text-emerald-600 mr-1.5">0{idx + 1}.</strong>
                      {st.title}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setDraftSubtasks((prev) => prev.filter((item) => item.id !== st.id))
                      }
                      aria-label={`Xóa bước ${st.title}`}
                      className="text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {formError && (
            <p className="text-xs font-medium text-red-600 dark:text-red-400">{formError}</p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" />
              {editingTask ? 'Lưu cập nhật công việc' : 'Tạo công việc mới'}
            </button>
            {editingTask && (
              <button
                type="button"
                onClick={() => {
                  setEditingTask(null);
                  setTitle('');
                  setDraftSubtasks([]);
                }}
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300"
              >
                Hủy chỉnh sửa
              </button>
            )}
          </div>
        </form>
      </section>

      {/* Filter Bar & Task List */}
      <section className="rounded-2xl liquid-glass p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Danh sách Công việc Hằng ngày ({filteredTasks.length})
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Bấm &ldquo;Chia nhỏ bằng AI&rdquo; trên bất kỳ công việc nào để tự động tạo các bước con
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm kiếm công việc..."
                aria-label="Tìm kiếm công việc"
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
              />
            </div>

            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value as 'all' | TaskPriority)}
              aria-label="Lọc theo mức độ ưu tiên"
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200"
            >
              <option value="all">Tất cả mức ưu tiên</option>
              <option value="urgent">Quan trọng & Khẩn cấp</option>
              <option value="important">Quan trọng</option>
              <option value="normal">Bình thường</option>
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as 'all' | TaskStatus)}
              aria-label="Lọc theo trạng thái"
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="todo">Chưa làm</option>
              <option value="in_progress">Đang làm</option>
              <option value="done">Hoàn thành</option>
            </select>
          </div>
        </div>

        {filteredTasks.length === 0 ? (
          <div className="py-12 text-center">
            <ListChecks className="h-8 w-8 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Không có công việc nào khớp với bộ lọc hiện tại.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 mt-2">
            {filteredTasks.map((task) => {
              const pInfo = priorityMeta(task.priority);
              const isExpanded = !!expandedIds[task.id];
              const completedSubCount = task.subtasks.filter((s) => s.completed).length;

              return (
                <div key={task.id} className="py-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateTask({
                            ...task,
                            status: task.status === 'done' ? 'todo' : 'done',
                          })
                        }
                        aria-label={`Đánh dấu hoàn thành ${task.title}`}
                        className="mt-0.5 text-emerald-600 dark:text-emerald-400 shrink-0"
                      >
                        {task.status === 'done' ? (
                          <CheckSquare className="h-5 w-5" />
                        ) : (
                          <Square className="h-5 w-5 text-slate-400 hover:text-emerald-600" />
                        )}
                      </button>

                      <div className="min-w-0">
                        <div
                          className={`text-sm font-bold ${
                            task.status === 'done'
                              ? 'line-through text-slate-400 dark:text-slate-500'
                              : 'text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {task.title}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className={`font-semibold ${pInfo.colorClass}`}>
                            {pInfo.label}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            Hạn: {formatDateVN(task.deadline)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            Trạng thái:{' '}
                            <strong className="text-slate-700 dark:text-slate-300">
                              {task.status === 'done'
                                ? 'Hoàn thành'
                                : task.status === 'in_progress'
                                ? 'Đang làm'
                                : 'Chưa làm'}
                            </strong>
                          </span>
                          {task.subtasks.length > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedIds((prev) => ({
                                    ...prev,
                                    [task.id]: !prev[task.id],
                                  }))
                                }
                                className="inline-flex items-center gap-1 font-mono tabular-nums font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-3.5 w-3.5" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5" />
                                )}
                                {completedSubCount}/{task.subtasks.length} bước nhỏ
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      <button
                        type="button"
                        onClick={() => handleExistingTaskAiBreakdown(task)}
                        disabled={loadingTaskId === task.id}
                        aria-label={`Chia nhỏ bằng AI cho công việc ${task.title}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/70 dark:bg-emerald-950/40 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors whitespace-nowrap shrink-0"
                      >
                        <Wand2 className="h-3.5 w-3.5" />
                        {loadingTaskId === task.id ? 'Đang tách...' : 'Chia nhỏ bằng AI'}
                      </button>

                      <select
                        value={task.status}
                        onChange={(e) =>
                          onUpdateTask({ ...task, status: e.target.value as TaskStatus })
                        }
                        aria-label={`Đổi trạng thái ${task.title}`}
                        className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200"
                      >
                        <option value="todo">Chưa làm</option>
                        <option value="in_progress">Đang làm</option>
                        <option value="done">Hoàn thành</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => handleStartEdit(task)}
                        aria-label={`Sửa công việc ${task.title}`}
                        className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRequestDeleteTask(task)}
                        aria-label={`Xóa công việc ${task.title}`}
                        className="p-1.5 rounded-lg text-slate-500 hover:bg-red-50 dark:hover:bg-red-950/50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Expandable Sub-tasks */}
                  {isExpanded && task.subtasks.length > 0 && (
                    <div className="mt-3 ml-8 pl-4 border-l border-slate-200 dark:border-slate-800 space-y-2">
                      {task.subtasks.map((st) => (
                        <div key={st.id} className="flex items-center gap-2.5 text-xs">
                          <button
                            type="button"
                            onClick={() => handleToggleSubtask(task, st.id)}
                            aria-label={`Đánh dấu bước nhỏ ${st.title}`}
                            className="text-emerald-600 dark:text-emerald-400 shrink-0"
                          >
                            {st.completed ? (
                              <CheckSquare className="h-4 w-4" />
                            ) : (
                              <Square className="h-4 w-4 text-slate-400" />
                            )}
                          </button>
                          <span
                            className={
                              st.completed
                                ? 'line-through text-slate-400 dark:text-slate-500'
                                : 'text-slate-700 dark:text-slate-300'
                            }
                          >
                            {st.title}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
