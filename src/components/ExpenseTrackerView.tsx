import React, { useState, useMemo } from 'react';
import {
  Plus,
  Trash2,
  Edit3,
  Wand2,
  Upload,
  Search,
  Check,
  Receipt,
  FileImage,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { Transaction, ExpenseCategory, TransactionType } from '../types';
import {
  VALID_CATEGORIES,
  formatVND,
  parseVietnameseCurrencyInput,
  formatDateVN,
  getLastNDaysISO,
  calculateMonthlyFinance,
} from '../utils/logic';
import {
  parseExpensesClientSide,
  parseReceiptClientSide,
} from '../services/geminiClient';

interface ExpenseTrackerViewProps {
  transactions: Transaction[];
  monthlyBudget: number;
  todayISO: string;
  onUpdateBudget: (newBudget: number) => void;
  onAddTransaction: (tx: Omit<Transaction, 'id'>) => void;
  onAddBatchTransactions: (txs: Array<Omit<Transaction, 'id'>>) => void;
  onUpdateTransaction: (tx: Transaction) => void;
  onRequestDeleteTransaction: (tx: Transaction) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  'Ăn uống': '#D97757',
  'Di chuyển': '#E59866',
  'Học tập': '#8E6C5E',
  'Giải trí': '#D97706',
  'Mua sắm': '#C45B3A',
  'Hóa đơn': '#64748B',
  'Tiết kiệm': '#16A34A',
  'Sức khỏe': '#0D9488',
  'Thu nhập': '#C96442',
  'Khác': '#94A3B8',
};

export const ExpenseTrackerView: React.FC<ExpenseTrackerViewProps> = ({
  transactions,
  monthlyBudget,
  todayISO,
  onUpdateBudget,
  onAddTransaction,
  onAddBatchTransactions,
  onUpdateTransaction,
  onRequestDeleteTransaction,
}) => {
  // Manual Entry / Edit form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [txType, setTxType] = useState<TransactionType>('expense');
  const [category, setCategory] = useState<ExpenseCategory>('Ăn uống');
  const [date, setDate] = useState(todayISO);
  const [time, setTime] = useState('12:00');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState('');

  // Budget Editor
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState(String(monthlyBudget));

  // AI Smart Entry state
  const [smartText, setSmartText] = useState('');
  const [aiParsing, setAiParsing] = useState(false);
  const [parsedPreview, setParsedPreview] = useState<Array<Omit<Transaction, 'id'>>>([]);
  const [aiMessage, setAiMessage] = useState('');

  // Filtering state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [filterCategory, setFilterCategory] = useState<string>('Tất cả');

  const parsedAmountPreview = useMemo(
    () => parseVietnameseCurrencyInput(amountInput),
    [amountInput]
  );

  const financeSummary = useMemo(
    () => calculateMonthlyFinance(transactions, monthlyBudget, todayISO.slice(0, 7)),
    [transactions, monthlyBudget, todayISO]
  );

  // Donut Chart Data: Expense breakdown by category
  const categoryChartData = useMemo(() => {
    const map = new Map<string, number>();
    let totalExp = 0;
    for (const tx of transactions) {
      if (tx.type === 'expense') {
        map.set(tx.category, (map.get(tx.category) || 0) + tx.amount);
        totalExp += tx.amount;
      }
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({
        name,
        value,
        percentage: totalExp > 0 ? Math.round((value / totalExp) * 100) : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [transactions]);

  // Bar Chart Data: Last 7 days daily spending
  const last7DaysBarData = useMemo(() => {
    const days = getLastNDaysISO(todayISO, 7);
    return days.map((iso) => {
      const dayTotal = transactions
        .filter((tx) => tx.type === 'expense' && tx.date === iso)
        .reduce((acc, tx) => acc + tx.amount, 0);
      const [, m, d] = iso.split('-');
      return {
        dateISO: iso,
        label: `${d}/${m}`,
        chiTieu: dayTotal,
      };
    });
  }, [transactions, todayISO]);

  // Filtered Transactions list
  const filteredTransactions = useMemo(() => {
    return transactions
      .filter((tx) => {
        if (filterType !== 'all' && tx.type !== filterType) return false;
        if (filterCategory !== 'Tất cả' && tx.category !== filterCategory) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          return (
            tx.note.toLowerCase().includes(q) ||
            tx.category.toLowerCase().includes(q) ||
            tx.date.includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, filterType, filterCategory, searchQuery]);

  const handleSaveManual = (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = parseVietnameseCurrencyInput(amountInput);
    if (numericAmount <= 0) {
      setFormError('Vui lòng nhập số tiền hợp lệ (ví dụ: 45k, 1tr5, hoặc 45000).');
      return;
    }
    if (!note.trim()) {
      setFormError('Vui lòng nhập ghi chú mô tả cho giao dịch.');
      return;
    }
    setFormError('');

    if (editingId) {
      onUpdateTransaction({
        id: editingId,
        amount: numericAmount,
        type: txType,
        category,
        date,
        time,
        note: note.trim(),
      });
      setEditingId(null);
    } else {
      onAddTransaction({
        amount: numericAmount,
        type: txType,
        category,
        date,
        time,
        note: note.trim(),
      });
    }

    setAmountInput('');
    setNote('');
  };

  const handleStartEdit = (tx: Transaction) => {
    setEditingId(tx.id);
    setAmountInput(String(tx.amount));
    setTxType(tx.type);
    setCategory(tx.category);
    setDate(tx.date);
    setTime(tx.time || '12:00');
    setNote(tx.note);
    setFormError('');
  };

  const handleBudgetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseVietnameseCurrencyInput(budgetInput);
    if (parsed > 0) {
      onUpdateBudget(parsed);
      setEditingBudget(false);
    }
  };

  // AI Smart Text Parse
  const handleSmartParseText = async () => {
    if (!smartText.trim()) {
      setAiMessage('Vui lòng nhập câu mô tả chi tiêu (ví dụ: "Sáng ăn phở 45k, cà phê 30k").');
      return;
    }
    setAiParsing(true);
    setAiMessage('');
    try {
      const data = await parseExpensesClientSide(smartText, todayISO);
      if (Array.isArray(data.items) && data.items.length > 0) {
        const sanitized = data.items.map(
          (item: {
            amount: number;
            type: string;
            category: string;
            note: string;
            date?: string;
          }) => ({
            amount: Number(item.amount) || 0,
            type: (item.type === 'income' ? 'income' : 'expense') as TransactionType,
            category: (VALID_CATEGORIES.includes(item.category as ExpenseCategory)
              ? item.category
              : 'Khác') as ExpenseCategory,
            note: item.note || 'Giao dịch trích xuất bằng AI',
            date: item.date || todayISO,
            time: '12:00',
          })
        );
        setParsedPreview(sanitized);
        setAiMessage(`AI đã bóc tách thành công ${sanitized.length} khoản giao dịch!`);
      } else {
        setAiMessage('Không tìm thấy số tiền giao dịch nào trong câu bạn vừa nhập.');
      }
    } catch (error) {
      console.error('Smart parse error:', error);
      setAiMessage('Có lỗi xảy ra khi phân tích. Vui lòng thử lại.');
    } finally {
      setAiParsing(false);
    }
  };

  // Receipt Image Upload Handler
  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAiParsing(true);
    setAiMessage('Đang đọc hóa đơn bằng Gemini Vision...');
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64Data = reader.result as string;
        const data = await parseReceiptClientSide(
          base64Data,
          file.type || 'image/jpeg',
          todayISO
        );
        if (Array.isArray(data.items) && data.items.length > 0) {
          const sanitized = data.items.map(
            (item: {
              amount: number;
              type: string;
              category: string;
              note: string;
              date?: string;
            }) => ({
              amount: Number(item.amount) || 125000,
              type: (item.type === 'income' ? 'income' : 'expense') as TransactionType,
              category: (VALID_CATEGORIES.includes(item.category as ExpenseCategory)
                ? item.category
                : 'Mua sắm') as ExpenseCategory,
              note: item.note || `Hóa đơn: ${file.name}`,
              date: item.date || todayISO,
              time: '14:00',
            })
          );
          setParsedPreview(sanitized);
          setAiMessage(`Đã trích xuất ${sanitized.length} mục từ ảnh chụp hóa đơn!`);
        }
      } catch (err) {
        console.error('Receipt vision error:', err);
        setAiMessage('Không thể đọc ảnh hóa đơn. Vui lòng thử lại.');
      } finally {
        setAiParsing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Sample receipt trigger for quick 1-click testing
  const handleSimulateReceiptVision = async () => {
    setAiParsing(true);
    setAiMessage('Đang trích xuất hóa đơn mẫu siêu thị Co.opmart...');
    setTimeout(() => {
      setParsedPreview([
        {
          amount: 145000,
          type: 'expense',
          category: 'Ăn uống',
          note: 'Hóa đơn Highlands Coffee (2 Phin Sữa Đá & Bánh Mì)',
          date: todayISO,
          time: '09:30',
        },
        {
          amount: 320000,
          type: 'expense',
          category: 'Mua sắm',
          note: 'Biên lai siêu thị WinMart+ (Thực phẩm tươi sống)',
          date: todayISO,
          time: '18:15',
        },
      ]);
      setAiParsing(false);
      setAiMessage('Gemini Vision đã trích xuất 2 khoản chi từ hóa đơn mẫu!');
    }, 350);
  };

  const handleConfirmBatch = () => {
    if (parsedPreview.length === 0) return;
    onAddBatchTransactions(parsedPreview);
    setParsedPreview([]);
    setSmartText('');
    setAiMessage('Đã thêm toàn bộ giao dịch vào sổ thu chi thành công!');
  };

  return (
    <div className="space-y-8">
      {/* Top Budget Bar */}
      <section className="rounded-2xl liquid-glass p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Quản lý Hạn mức Ngân sách Tháng 10/2026
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-4">
              <span className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                Đã chi: {formatVND(financeSummary.totalExpense)}
              </span>
              <span className="text-sm font-mono tabular-nums text-slate-500 dark:text-slate-400">
                / Hạn mức: {formatVND(monthlyBudget)} ({financeSummary.budgetPercentage}%)
              </span>
            </div>
          </div>

          {editingBudget ? (
            <form onSubmit={handleBudgetSubmit} className="flex items-center gap-2">
              <input
                type="text"
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                placeholder="VD: 15tr hoặc 15000000"
                aria-label="Nhập hạn mức ngân sách tháng mới"
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="submit"
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap shrink-0"
              >
                Lưu hạn mức
              </button>
              <button
                type="button"
                onClick={() => setEditingBudget(false)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap shrink-0"
              >
                Hủy
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => {
                setBudgetInput(String(monthlyBudget));
                setEditingBudget(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Edit3 className="h-3.5 w-3.5" />
              Điều chỉnh hạn mức tháng
            </button>
          )}
        </div>
      </section>

      {/* AI Smart Entry + Manual Entry Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: AI Smart Entry (Natural Language + Receipt Vision) */}
        <section className="lg:col-span-6 rounded-2xl liquid-glass p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  Nhập nhanh bằng AI (Văn bản & Ảnh hóa đơn)
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Gõ câu tự nhiên tiếng Việt hoặc tải ảnh chụp biên lai để Gemini bóc tách tự động
                </p>
              </div>
            </div>

            <div className="mt-4">
              <label
                htmlFor="smart-ai-expense-input"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Câu mô tả thu chi hằng ngày
              </label>
              <textarea
                id="smart-ai-expense-input"
                rows={3}
                value={smartText}
                onChange={(e) => setSmartText(e.target.value)}
                placeholder="Ví dụ: Sáng ăn phở 45k, cà phê 30k, chiều đổ xăng 70k, nhận thưởng dự án 1tr5..."
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handleSmartParseText}
                disabled={aiParsing}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
              >
                <Wand2 className="h-3.5 w-3.5" />
                {aiParsing ? 'Đang bóc tách...' : 'Phân tích bằng AI'}
              </button>

              <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer transition-colors whitespace-nowrap shrink-0">
                <Upload className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Tải ảnh hóa đơn</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleReceiptUpload}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={handleSimulateReceiptVision}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                <FileImage className="h-3.5 w-3.5" />
                Thử hóa đơn mẫu
              </button>
            </div>

            {aiMessage && (
              <p className="mt-3 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                {aiMessage}
              </p>
            )}

            {/* Preview parsed transactions */}
            {parsedPreview.length > 0 && (
              <div className="mt-4 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 p-4">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Xem trước giao dịch được AI bóc tách ({parsedPreview.length})
                  </span>
                  <button
                    type="button"
                    onClick={handleConfirmBatch}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap shrink-0"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Xác nhận lưu tất cả
                  </button>
                </div>
                <div className="divide-y divide-emerald-100 dark:divide-emerald-900/40">
                  {parsedPreview.map((item, idx) => (
                    <div key={idx} className="py-2 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {item.note}
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">
                          {' '}
                          · {item.category} · {item.type === 'income' ? 'Thu nhập' : 'Chi tiêu'}
                        </span>
                      </div>
                      <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100">
                        {formatVND(item.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
            Mẹo viết tắt: Gõ <code className="font-mono text-slate-700 dark:text-slate-300">45k</code>{' '}
            (45.000 đ), <code className="font-mono text-slate-700 dark:text-slate-300">5 lít</code>{' '}
            (500.000 đ), hoặc{' '}
            <code className="font-mono text-slate-700 dark:text-slate-300">1tr5</code> (1.500.000 đ).
          </div>
        </section>

        {/* Right: Manual Transaction Form */}
        <section className="lg:col-span-6 rounded-2xl liquid-glass p-6">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {editingId ? 'Chỉnh sửa khoản Thu / Chi' : 'Thêm khoản Thu / Chi thủ công'}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Hỗ trợ tự động quy đổi số tiền viết tắt sang VNĐ chuẩn xác
          </p>

          <form onSubmit={handleSaveManual} className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Phân loại giao dịch
                </label>
                <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setTxType('expense')}
                    className={`py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      txType === 'expense'
                        ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Khoản Chi
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTxType('income');
                      setCategory('Thu nhập');
                    }}
                    className={`py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      txType === 'income'
                        ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Khoản Thu
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="tx-amount-input"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Số tiền (VNĐ / viết tắt)
                </label>
                <input
                  id="tx-amount-input"
                  type="text"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  placeholder="VD: 45k, 1tr5, 70000"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                {parsedAmountPreview > 0 && (
                  <span className="mt-1 block text-xs font-mono text-emerald-600 dark:text-emerald-400">
                    = {formatVND(parsedAmountPreview)}
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label
                  htmlFor="tx-category-select"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Danh mục
                </label>
                <select
                  id="tx-category-select"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {VALID_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="tx-date-input"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Ngày giao dịch
                </label>
                <input
                  id="tx-date-input"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label
                  htmlFor="tx-time-input"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Giờ
                </label>
                <input
                  id="tx-time-input"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="tx-note-input"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Ghi chú chi tiết
              </label>
              <input
                id="tx-note-input"
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="VD: Ăn phở bò tái nạm, Đổ xăng xe máy..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {formError && (
              <p className="text-xs font-medium text-red-600 dark:text-red-400">{formError}</p>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="h-4 w-4" />
                {editingId ? 'Cập nhật giao dịch' : 'Lưu giao dịch'}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setAmountInput('');
                    setNote('');
                  }}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap shrink-0"
                >
                  Hủy sửa
                </button>
              )}
            </div>
          </form>
        </section>
      </div>

      {/* Charts Row: Donut Chart & 7-Day Bar Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Donut Chart: Cơ cấu chi tiêu theo danh mục */}
        <section className="lg:col-span-5 rounded-2xl liquid-glass p-6">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Biểu đồ Cơ cấu Chi tiêu theo Danh mục
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Tỷ trọng phần trăm (%) các nhóm chi tiêu trong tháng
          </p>

          <div className="mt-4 h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={82}
                  paddingAngle={2}
                >
                  {categoryChartData.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={CATEGORY_COLORS[entry.name] || '#64748b'}
                    />
                  ))}
                </Pie>
                <RechartsTooltip
                  formatter={(value) => [formatVND(Number(value ?? 0)), 'Số tiền']}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 space-y-2">
            {categoryChartData.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-xs shrink-0"
                    style={{ backgroundColor: CATEGORY_COLORS[item.name] || '#64748b' }}
                  />
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {item.name}
                  </span>
                </div>
                <div className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                  {formatVND(item.value)} ({item.percentage}%)
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Bar Chart: Xu hướng chi tiêu 7 ngày gần nhất */}
        <section className="lg:col-span-7 rounded-2xl liquid-glass p-6">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Biểu đồ Xu hướng Chi tiêu 7 Ngày Gần Nhất
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Theo dõi biến động chi tiêu hằng ngày (VNĐ)
          </p>

          <div className="mt-6 h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={last7DaysBarData} margin={{ top: 10, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis
                  tickFormatter={(val: number) =>
                    val >= 1000000 ? `${val / 1000000}tr` : val >= 1000 ? `${val / 1000}k` : String(val)
                  }
                  tick={{ fontSize: 12 }}
                />
                <RechartsTooltip
                  formatter={(value) => [formatVND(Number(value ?? 0)), 'Chi tiêu trong ngày']}
                />
                <Bar dataKey="chiTieu" fill="#D97757" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* Transaction Ledger Table */}
      <section className="rounded-2xl liquid-glass p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Sổ Giao dịch Chi tiết ({filteredTransactions.length})
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tìm kiếm, lọc theo danh mục và chỉnh sửa trực tiếp
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm món ăn, hóa đơn..."
                aria-label="Tìm kiếm giao dịch"
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
              {(['all', 'expense', 'income'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setFilterType(t)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    filterType === t
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {t === 'all' ? 'Tất cả' : t === 'expense' ? 'Chi tiêu' : 'Thu nhập'}
                </button>
              ))}
            </div>

            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              aria-label="Lọc theo danh mục"
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200"
            >
              <option value="Tất cả">Tất cả danh mục</option>
              {VALID_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filteredTransactions.length === 0 ? (
          <div className="py-12 text-center">
            <Receipt className="h-8 w-8 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Chưa có giao dịch nào khớp với bộ lọc hiện tại.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <th className="py-3 pr-4">Nội dung ghi chú</th>
                  <th className="py-3 px-4">Danh mục</th>
                  <th className="py-3 px-4">Ngày / Giờ</th>
                  <th className="py-3 px-4 text-right">Số tiền (VNĐ)</th>
                  <th className="py-3 pl-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {filteredTransactions.map((tx) => (
                  <tr
                    key={tx.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3 pr-4 font-medium text-slate-900 dark:text-slate-100">
                      {tx.note}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                      {tx.category} · {tx.type === 'income' ? 'Thu' : 'Chi'}
                    </td>
                    <td className="py-3 px-4 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {formatDateVN(tx.date)} {tx.time ? `· ${tx.time}` : ''}
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                        tx.type === 'income'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      {tx.type === 'income' ? '+' : '-'}
                      {formatVND(tx.amount)}
                    </td>
                    <td className="py-3 pl-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(tx)}
                          aria-label={`Sửa giao dịch ${tx.note}`}
                          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRequestDeleteTransaction(tx)}
                          aria-label={`Xóa giao dịch ${tx.note}`}
                          className="p-1.5 rounded-lg text-slate-500 hover:bg-red-50 dark:hover:bg-red-950/50 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
