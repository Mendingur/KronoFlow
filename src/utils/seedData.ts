import { Transaction, Habit, TaskItem } from '../types';
import { addDaysISO, getLastNDaysISO, getLocalTodayISO } from './logic';

// Dữ liệu mẫu luôn tính theo ngày hiện tại của thiết bị (không còn cố định một ngày)
const TODAY_ISO = getLocalTodayISO();

export const INITIAL_MONTHLY_BUDGET = 12_000_000; // 12.000.000 đ

const recentDays = getLastNDaysISO(TODAY_ISO, 14);

export const INITIAL_TRANSACTIONS: Transaction[] = [
  {
    id: 'tx-1',
    amount: 22_500_000,
    type: 'income',
    category: 'Thu nhập',
    date: recentDays[0],
    time: '09:15',
    note: 'Lương tháng 10 & phụ cấp dự án',
  },
  {
    id: 'tx-2',
    amount: 3_500_000,
    type: 'income',
    category: 'Thu nhập',
    date: recentDays[5],
    time: '16:30',
    note: 'Thưởng hoàn thành dự án thiết kế UI/UX',
  },
  {
    id: 'tx-3',
    amount: 4_500_000,
    type: 'expense',
    category: 'Hóa đơn',
    date: recentDays[7],
    time: '10:00',
    note: 'Tiền thuê căn hộ studio & điện nước tháng 10',
  },
  {
    id: 'tx-4',
    amount: 2_000_000,
    type: 'expense',
    category: 'Tiết kiệm',
    date: recentDays[8],
    time: '11:20',
    note: 'Gửi tiết kiệm tích lũy quỹ dự phòng cá nhân',
  },
  {
    id: 'tx-5',
    amount: 450_000,
    type: 'expense',
    category: 'Học tập',
    date: recentDays[9],
    time: '20:15',
    note: 'Mua sách Kinh tế học & khóa học kỹ năng phân tích',
  },
  {
    id: 'tx-6',
    amount: 380_000,
    type: 'expense',
    category: 'Mua sắm',
    date: recentDays[10],
    time: '18:45',
    note: 'Đi siêu thị Co.opmart mua thực phẩm nấu ăn trong tuần',
  },
  {
    id: 'tx-7',
    amount: 290_000,
    type: 'expense',
    category: 'Giải trí',
    date: recentDays[11],
    time: '19:30',
    note: 'Xem phim cuối tuần và bắp nước tại CGV',
  },
  {
    id: 'tx-8',
    amount: 165_000,
    type: 'expense',
    category: 'Ăn uống',
    date: recentDays[12],
    time: '12:30',
    note: 'Ăn trưa cơm tấm sườn bì chả & trà đào cùng đồng nghiệp',
  },
  {
    id: 'tx-9',
    amount: 45_000,
    type: 'expense',
    category: 'Ăn uống',
    date: TODAY_ISO,
    time: '07:30',
    note: 'Ăn phở bò tái nạm buổi sáng',
  },
  {
    id: 'tx-10',
    amount: 70_000,
    type: 'expense',
    category: 'Di chuyển',
    date: TODAY_ISO,
    time: '08:10',
    note: 'Đổ xăng xe máy RON 95-III',
  },
  {
    id: 'tx-11',
    amount: 35_000,
    type: 'expense',
    category: 'Ăn uống',
    date: TODAY_ISO,
    time: '13:45',
    note: 'Cà phê muối làm việc buổi chiều',
  },
];

export const INITIAL_HABITS: Habit[] = [
  {
    id: 'hb-1',
    title: 'Dậy lúc 6h sáng & uống 300ml nước ấm',
    category: 'Sức khỏe',
    targetDaysPerWeek: 7,
    completedDates: [
      recentDays[4],
      recentDays[5],
      recentDays[6],
      recentDays[7],
      recentDays[8],
      recentDays[9],
      recentDays[10],
      recentDays[11],
      recentDays[12],
      TODAY_ISO,
    ],
  },
  {
    id: 'hb-2',
    title: 'Đọc sách chuyên ngành 30 phút',
    category: 'Học tập',
    targetDaysPerWeek: 6,
    completedDates: [
      recentDays[6],
      recentDays[7],
      recentDays[8],
      recentDays[9],
      recentDays[10],
      recentDays[11],
      recentDays[12],
      TODAY_ISO,
    ],
  },
  {
    id: 'hb-3',
    title: 'Không tiêu tiền hoang phí (No impulsive buy)',
    category: 'Tài chính',
    targetDaysPerWeek: 7,
    completedDates: [
      recentDays[5],
      recentDays[7],
      recentDays[8],
      recentDays[9],
      recentDays[10],
      recentDays[11],
      recentDays[12],
    ],
  },
  {
    id: 'hb-4',
    title: 'Tập thể dục / Chạy bộ 45 phút',
    category: 'Sức khỏe',
    targetDaysPerWeek: 5,
    completedDates: [
      recentDays[5],
      recentDays[7],
      recentDays[9],
      recentDays[11],
      recentDays[12],
      TODAY_ISO,
    ],
  },
  {
    id: 'hb-5',
    title: 'Tổng kết chi tiêu & kế hoạch ngày mai lúc 21h30',
    category: 'Công việc',
    targetDaysPerWeek: 7,
    completedDates: [
      recentDays[8],
      recentDays[9],
      recentDays[10],
      recentDays[11],
      recentDays[12],
    ],
  },
];

export const INITIAL_TASKS: TaskItem[] = [
  {
    id: 'tsk-1',
    title: 'Hoàn thành báo cáo dự án Quý 4 & gửi ban giám đốc',
    priority: 'urgent',
    deadline: `${TODAY_ISO} 17:00`,
    status: 'in_progress',
    subtasks: [
      { id: 'st-101', title: 'Tổng hợp số liệu doanh thu và chi phí vận hành tháng 10', completed: true },
      { id: 'st-102', title: 'Vẽ biểu đồ so sánh KPI trên Google Slides', completed: true },
      { id: 'st-103', title: 'Rà soát nhận xét rủi ro và gửi email xác nhận', completed: false },
    ],
  },
  {
    id: 'tsk-2',
    title: 'Ôn thi cuối kỳ môn Kinh tế vĩ mô (Chương 4 & 5)',
    priority: 'urgent',
    deadline: `${TODAY_ISO} 21:00`,
    status: 'todo',
    subtasks: [
      { id: 'st-201', title: 'Tóm tắt mô hình IS-LM và chính sách tài khóa - tiền tệ', completed: true },
      { id: 'st-202', title: 'Giải 15 câu bài tập tính GDP thực và tỷ lệ lạm phát', completed: false },
      { id: 'st-203', title: 'Hệ thống hóa flashcard các công thức trọng tâm', completed: false },
    ],
  },
  {
    id: 'tsk-3',
    title: 'Rà soát ngân sách cá nhân & thanh toán hóa đơn Internet',
    priority: 'important',
    deadline: `${TODAY_ISO} 19:30`,
    status: 'done',
    subtasks: [
      { id: 'st-301', title: 'Kiểm tra sao kê giao dịch ngân hàng tuần qua', completed: true },
      { id: 'st-302', title: 'Thanh toán cước cáp quang Viettel qua ứng dụng', completed: true },
    ],
  },
  {
    id: 'tsk-4',
    title: 'Lên kế hoạch du lịch Đà Lạt tự túc 3 ngày 2 đêm',
    priority: 'normal',
    deadline: `${addDaysISO(TODAY_ISO, 3)} 20:00`,
    status: 'todo',
    subtasks: [
      { id: 'st-401', title: 'Tìm hiểu homestay gần trung tâm với ngân sách dưới 600k/đêm', completed: false },
      { id: 'st-402', title: 'Lên danh sách quán ăn địa phương và quán cà phê view đồi thông', completed: false },
    ],
  },
];
