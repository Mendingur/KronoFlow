/**
 * Hằng số cấu hình cho KronoFlow (Single Page Application chạy 100% ở trình duyệt, host trên GitHub Pages).
 *
 * GOOGLE_CLIENT_ID (OAuth 2.0 Client ID, loại "Web application") KHÔNG phải là bí mật.
 * Có 2 cách cấu hình:
 *   1. Lúc build: đặt biến VITE_GOOGLE_CLIENT_ID (xem README, hoặc GitHub → Settings → Variables).
 *   2. Ngay trên giao diện: dán vào ô GOOGLE_CLIENT_ID ở màn hình đăng nhập hoặc mục Cài đặt.
 *
 * Tuyệt đối KHÔNG ghi khóa Gemini API (AIza...) vào mã nguồn: mỗi người dùng tự dán khóa của mình trong Cài đặt.
 */

const envClientId = ((import.meta.env?.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? '').trim();

export const DEFAULT_GOOGLE_CLIENT_ID = envClientId;

export const CUSTOM_GOOGLE_CLIENT_ID_STORAGE_KEY = 'kronoflow_google_client_id_v1';

export const DRIVE_DB_FILENAME = 'kronoflow_database.json';

export const DRIVE_DB_DESCRIPTION =
  'Cơ sở dữ liệu gốc của ứng dụng KronoFlow (Quản lý Chi tiêu, Kỷ luật & Công việc) - Tuyệt đối KHÔNG xóa hoặc chỉnh sửa file này!';

export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export const DRIVE_REQUIRED_SCOPES = [
  DRIVE_FILE_SCOPE,
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
];

/** Ngưỡng cảnh báo Drive sắp đầy (98% dung lượng) */
export const DRIVE_NEAR_FULL_RATIO = 0.98;

export const DRIVE_PROTECTION_REMINDER_TEXT = `⚠️ Lưu ý quan trọng: Toàn bộ dữ liệu của bạn đang được lưu trong tệp ${DRIVE_DB_FILENAME} trên Google Drive cá nhân. Vui lòng KHÔNG xóa, đổi tên hoặc di chuyển tệp này vào Thùng rác trên Drive.`;

export const DRIVE_FULL_ERROR_MESSAGE =
  "Bộ nhớ Google Drive của bạn đã đầy! Ứng dụng không thể ghi dữ liệu mới lên đám mây. Vui lòng xóa bớt tệp không cần thiết và làm trống Thùng rác trong Google Drive của bạn hoặc mua thêm bộ nhớ Google Drive, sau đó nhấn 'Đồng bộ lại'.";

export const DRIVE_NEAR_FULL_MESSAGE =
  'Bộ nhớ Google Drive của bạn sắp đầy (trên 98%). Hãy dọn bớt tệp và làm trống Thùng rác Drive để KronoFlow tiếp tục đồng bộ dữ liệu an toàn.';

/** Mô hình Gemini dùng trong ứng dụng — đổi tại đây nếu Google ngừng hỗ trợ mô hình cũ */
export const GEMINI_MODEL_SMART = 'gemini-3.8-flash';
export const GEMINI_MODEL_FAST = 'gemini-3.1-flash-lite';

export function getConfiguredGoogleClientId(): string {
  try {
    const saved = localStorage.getItem(CUSTOM_GOOGLE_CLIENT_ID_STORAGE_KEY)?.trim();
    if (saved) return saved;
  } catch {
    // Bỏ qua lỗi truy cập storage
  }
  return DEFAULT_GOOGLE_CLIENT_ID;
}

export function setConfiguredGoogleClientId(clientId: string): void {
  try {
    const trimmed = clientId.trim();
    if (trimmed) {
      localStorage.setItem(CUSTOM_GOOGLE_CLIENT_ID_STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(CUSTOM_GOOGLE_CLIENT_ID_STORAGE_KEY);
    }
  } catch {
    // Bỏ qua lỗi truy cập storage
  }
}
