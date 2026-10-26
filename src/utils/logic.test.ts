import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatVND,
  parseVietnameseCurrencyInput,
  formatDateVN,
  calculateMonthlyFinance,
  calculateHabitStreak,
  calculateDisciplineMetrics,
  calculateTaskMetrics,
  validateBackupJson,
} from './logic';

test('formatVND formats Vietnamese currency with dot separators', () => {
  assert.equal(formatVND(45000), '45.000 đ');
  assert.equal(formatVND(1500000), '1.500.000 đ');
  assert.equal(formatVND(0), '0 đ');
  assert.equal(formatVND(-70000), '-70.000 đ');
});

test('parseVietnameseCurrencyInput parses Vietnamese shorthand notations accurately', () => {
  assert.equal(parseVietnameseCurrencyInput('45k'), 45000);
  assert.equal(parseVietnameseCurrencyInput('45K'), 45000);
  assert.equal(parseVietnameseCurrencyInput('70 nghìn'), 70000);
  assert.equal(parseVietnameseCurrencyInput('1tr5'), 1500000);
  assert.equal(parseVietnameseCurrencyInput('15tr250'), 15250000);
  assert.equal(parseVietnameseCurrencyInput('1.5tr'), 1500000);
  assert.equal(parseVietnameseCurrencyInput('2 triệu'), 2000000);
  assert.equal(parseVietnameseCurrencyInput('5 lít'), 500000);
  assert.equal(parseVietnameseCurrencyInput('45.000 đ'), 45000);
});

test('formatDateVN converts YYYY-MM-DD to DD/MM/YYYY', () => {
  assert.equal(formatDateVN('2026-10-26'), '26/10/2026');
  assert.equal(formatDateVN('2026-03-05 14:30'), '05/03/2026');
});

test('calculateMonthlyFinance calculates balance and budget thresholds', () => {
  const txs = [
    { id: '1', amount: 15000000, type: 'income' as const, category: 'Thu nhập' as const, date: '2026-10-01', note: 'Lương' },
    { id: '2', amount: 8000000, type: 'expense' as const, category: 'Hóa đơn' as const, date: '2026-10-05', note: 'Tiền nhà' },
  ];
  const res = calculateMonthlyFinance(txs, 10000000, '2026-10');
  assert.equal(res.totalIncome, 15000000);
  assert.equal(res.totalExpense, 8000000);
  assert.equal(res.balance, 7000000);
  assert.equal(res.budgetPercentage, 80);
  assert.equal(res.budgetStatus, 'warning');
});

test('calculateHabitStreak and calculateDisciplineMetrics compute streaks and ranks', () => {
  const dates = ['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26'];
  const streak = calculateHabitStreak(dates, '2026-10-26');
  assert.equal(streak.currentStreak, 4);
  assert.equal(streak.bestStreak, 4);

  const metrics = calculateDisciplineMetrics(
    [
      {
        id: 'h1',
        title: 'Đọc sách 30 phút',
        category: 'Học tập',
        targetDaysPerWeek: 7,
        completedDates: dates,
      },
    ],
    '2026-10-26'
  );
  assert.equal(metrics.overallStreak, 4);
  assert.ok(metrics.disciplineScore > 100);
});

test('calculateTaskMetrics computes completion percentage and urgent count', () => {
  const metrics = calculateTaskMetrics([
    { id: 't1', title: 'Task 1', priority: 'urgent', deadline: '2026-10-26', status: 'done', subtasks: [] },
    { id: 't2', title: 'Task 2', priority: 'urgent', deadline: '2026-10-26', status: 'todo', subtasks: [] },
  ]);
  assert.equal(metrics.completionRate, 50);
  assert.equal(metrics.urgentPending, 1);
});

test('validateBackupJson validates backup schema', () => {
  const invalid = validateBackupJson({ monthlyBudget: -10 });
  assert.equal(invalid.valid, false);

  const valid = validateBackupJson({
    monthlyBudget: 10000000,
    transactions: [],
    habits: [],
    tasks: [],
  });
  assert.equal(valid.valid, true);
});

import { computeQuotaMetrics, formatBytesVN } from '../services/driveDatabase';
import {
  DRIVE_DB_FILENAME,
  DRIVE_DB_DESCRIPTION,
  DRIVE_PROTECTION_REMINDER_TEXT,
  DRIVE_FULL_ERROR_MESSAGE,
} from '../config/constants';

test('computeQuotaMetrics accurately detects normal, near-full (>98%), and full (>=100%) Drive storage', () => {
  const fifteenGB = 15 * 1024 * 1024 * 1024;
  const normal = computeQuotaMetrics({ limit: fifteenGB, usage: 5 * 1024 * 1024 * 1024 });
  assert.equal(normal.isNearFull, false);
  assert.equal(normal.isFull, false);
  assert.ok(normal.percentage > 30 && normal.percentage < 35);

  const nearFull = computeQuotaMetrics({
    limit: fifteenGB,
    usage: Math.floor(fifteenGB * 0.985),
  });
  assert.equal(nearFull.isNearFull, true);
  assert.equal(nearFull.isFull, false);

  const full = computeQuotaMetrics({ limit: fifteenGB, usage: fifteenGB });
  assert.equal(full.isNearFull, true);
  assert.equal(full.isFull, true);
  assert.equal(full.percentage, 100);
});

test('formatBytesVN formats byte sizes into human-readable MB/GB', () => {
  assert.equal(formatBytesVN(0), '0 MB');
  assert.equal(formatBytesVN(15 * 1024 * 1024 * 1024), '15,00 GB');
});

test('Google Drive database constants match required file name, metadata description, and Vietnamese alert texts', () => {
  assert.equal(DRIVE_DB_FILENAME, 'finhabit_database.json');
  assert.equal(
    DRIVE_DB_DESCRIPTION,
    'Dữ liệu gốc của ứng dụng Quản lý Chi tiêu & Kỷ luật - Vui lòng không xóa!'
  );
  assert.ok(DRIVE_PROTECTION_REMINDER_TEXT.includes('finhabit_database.json'));
  assert.ok(DRIVE_FULL_ERROR_MESSAGE.includes('Bộ nhớ Google Drive của bạn đã đầy!'));
});

