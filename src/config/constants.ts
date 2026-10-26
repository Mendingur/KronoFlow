/**
 * Cấu hình hằng số cho ứng dụng Client-side SPA trên GitHub Pages.
 * Bạn có thể thay đổi DEFAULT_GOOGLE_CLIENT_ID bên dưới bằng OAuth 2.0 Client ID (Web application)
 * của riêng bạn trên Google Cloud Console, hoặc dán trực tiếp trong mục Cài đặt của ứng dụng.
 */

export const DEFAULT_GOOGLE_CLIENT_ID =
  (
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env
      ?.VITE_GOOGLE_CLIENT_ID || ''
  ).trim() ||
  '741223555834-kronoflow-google-drive-client.apps.googleusercontent.com';

export const CUSTOM_GOOGLE_CLIENT_ID_STORAGE_KEY = 'kronoflow_google_client_id_v1';

export const DRIVE_DB_FILENAME = 'finhabit_database.json';

export const DRIVE_DB_DESCRIPTION =
  'Dữ liệu gốc của ứng dụng Quản lý Chi tiêu & Kỷ luật - Vui lòng không xóa!';

export const DRIVE_REQUIRED_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
];

export const DRIVE_PROTECTION_REMINDER_TEXT =
  "Quan trọng: Toàn bộ dữ liệu của bạn được lưu trong file 'finhabit_database.json' trên Google Drive cá nhân. Tuyệt đối KHÔNG xóa hoặc chỉnh sửa file này trên Drive để tránh mất dữ liệu.";

export const DRIVE_FULL_ERROR_MESSAGE =
  'Bộ nhớ Google Drive của bạn đã đầy! Không thể đồng bộ dữ liệu lên đám mây. Vui lòng dọn dẹp Google Drive (và làm trống Thùng rác Drive) hoặc mua thêm bộ nhớ Google Drive rồi nhấn thử lại.';

export function getConfiguredGoogleClientId(): string {
  try {
    const saved = localStorage.getItem(CUSTOM_GOOGLE_CLIENT_ID_STORAGE_KEY)?.trim();
    if (saved) return saved;
  } catch {
    // Ignore storage errors
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
    // Ignore storage errors
  }
}

export function hasCustomGoogleClientId(): boolean {
  try {
    return Boolean(localStorage.getItem(CUSTOM_GOOGLE_CLIENT_ID_STORAGE_KEY)?.trim());
  } catch {
    return false;
  }
}
