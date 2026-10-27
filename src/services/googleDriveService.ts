import {
  DRIVE_DB_DESCRIPTION,
  DRIVE_DB_FILENAME,
  DRIVE_FILE_SCOPE,
  DRIVE_FULL_ERROR_MESSAGE,
  DRIVE_NEAR_FULL_RATIO,
  DRIVE_REQUIRED_SCOPES,
  getConfiguredGoogleClientId,
} from '../config/constants';
import { DriveStorageQuota, KronoFlowDatabase, UserProfileInfo } from '../types';
import { normalizeDatabase } from './localDatabase';

/**
 * Dịch vụ đồng bộ Google Drive cho KronoFlow.
 * - Đăng nhập bằng Google Identity Services (token client, scope drive.file).
 * - Mỗi người dùng có MỘT tệp kronoflow_database.json trong Google Drive của chính họ.
 * - Mọi thao tác Đọc/Ghi đều kiểm tra: dung lượng Drive, tệp bị xóa / vào Thùng rác, lỗi 403 storageQuotaExceeded.
 */

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

export const DRIVE_FILE_ID_STORAGE_KEY = 'kronoflow_drive_file_id_v1';

// ───────────────────────────── Lỗi ─────────────────────────────

export type DriveErrorCode = 'CONFIG' | 'AUTH_REQUIRED' | 'QUOTA_EXCEEDED' | 'NETWORK' | 'API';

export class DriveError extends Error {
  code: DriveErrorCode;
  status?: number;

  constructor(code: DriveErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'DriveError';
    this.code = code;
    this.status = status;
  }
}

// ───────────────────────────── Google Identity Services ─────────────────────────────

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
}

interface GoogleOAuth2 {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: { type?: string; message?: string }) => void;
  }) => TokenClient;
  hasGrantedAllScopes?: (response: TokenResponse, ...scopes: string[]) => boolean;
}

function getGoogleOAuth2(): GoogleOAuth2 | null {
  const win = window as Window & { google?: { accounts?: { oauth2?: GoogleOAuth2 } } };
  return win.google?.accounts?.oauth2 ?? null;
}

async function loadGisScript(): Promise<void> {
  if (getGoogleOAuth2()) return;

  if (!document.querySelector(`script[src="${GIS_SCRIPT_SRC}"]`)) {
    const script = document.createElement('script');
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }

  const deadline = Date.now() + 10_000;
  while (!getGoogleOAuth2()) {
    if (Date.now() > deadline) {
      throw new DriveError(
        'NETWORK',
        'Không tải được thư viện đăng nhập Google. Vui lòng kiểm tra kết nối mạng hoặc tắt trình chặn quảng cáo rồi thử lại.'
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

// ───────────────────────────── Token trong bộ nhớ ─────────────────────────────

// Mã truy cập chỉ giữ trong bộ nhớ (không lưu LocalStorage) theo khuyến nghị bảo mật.
let accessToken: string | null = null;
let tokenExpiresAt = 0;

export function hasActiveDriveSession(): boolean {
  return Boolean(accessToken) && Date.now() < tokenExpiresAt;
}

export function clearDriveSession(): void {
  accessToken = null;
  tokenExpiresAt = 0;
}

export async function signInWithGoogleDrive(
  prompt: '' | 'consent' | 'select_account' = ''
): Promise<{ accessToken: string; profile: UserProfileInfo }> {
  const clientId = getConfiguredGoogleClientId();
  if (!clientId) {
    throw new DriveError(
      'CONFIG',
      'Chưa cấu hình GOOGLE_CLIENT_ID. Hãy dán OAuth Client ID (Web application) vào ô cấu hình bên dưới.'
    );
  }

  await loadGisScript();
  const oauth2 = getGoogleOAuth2();
  if (!oauth2) {
    throw new DriveError('NETWORK', 'Thư viện đăng nhập Google chưa sẵn sàng. Vui lòng thử lại.');
  }

  const response = await new Promise<TokenResponse>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_REQUIRED_SCOPES.join(' '),
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(
            new DriveError(
              'AUTH_REQUIRED',
              resp.error_description || resp.error || 'Không lấy được mã truy cập từ Google.'
            )
          );
          return;
        }
        resolve(resp);
      },
      error_callback: (err) => {
        reject(
          new DriveError(
            'AUTH_REQUIRED',
            err.type === 'popup_closed'
              ? 'Bạn đã đóng cửa sổ đăng nhập Google trước khi hoàn tất.'
              : err.type === 'popup_failed_to_open'
              ? 'Trình duyệt đã chặn cửa sổ đăng nhập Google. Hãy cho phép cửa sổ bật lên (pop-up) rồi thử lại.'
              : err.message || 'Không thể mở cửa sổ đăng nhập Google.'
          )
        );
      },
    });
    client.requestAccessToken({ prompt });
  });

  if (oauth2.hasGrantedAllScopes && !oauth2.hasGrantedAllScopes(response, DRIVE_FILE_SCOPE)) {
    throw new DriveError(
      'AUTH_REQUIRED',
      'Bạn chưa cấp quyền truy cập Google Drive. Hãy đăng nhập lại và tích chọn quyền "Xem và quản lý các tệp do ứng dụng này tạo".'
    );
  }

  const token = response.access_token as string;
  accessToken = token;
  const lifetimeSeconds = Number(response.expires_in) || 3600;
  tokenExpiresAt = Date.now() + Math.max(30, lifetimeSeconds - 60) * 1000; // trừ 60 giây dự phòng

  let profile: UserProfileInfo = { name: 'Người dùng Google', email: '' };
  try {
    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (userRes.ok) {
      const info = await userRes.json();
      profile = {
        name: info.name || info.given_name || 'Người dùng Google',
        email: info.email || '',
        picture: info.picture,
      };
    }
  } catch {
    // Không lấy được hồ sơ không ảnh hưởng đến việc dùng Drive
  }

  return { accessToken: token, profile };
}

// ───────────────────────────── Tiện ích ─────────────────────────────

export function getKnownDriveFileId(): string | null {
  try {
    return localStorage.getItem(DRIVE_FILE_ID_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setKnownDriveFileId(fileId: string | null): void {
  try {
    if (fileId) {
      localStorage.setItem(DRIVE_FILE_ID_STORAGE_KEY, fileId);
    } else {
      localStorage.removeItem(DRIVE_FILE_ID_STORAGE_KEY);
    }
  } catch {
    // Bỏ qua lỗi truy cập storage
  }
}

export function formatBytesVN(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(2).replace('.', ',')} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1).replace('.', ',')} MB`;
}

export function computeQuotaMetrics(rawQuota?: {
  limit?: string | number;
  usage?: string | number;
  usageInDrive?: string | number;
  usageInDriveTrash?: string | number;
}): DriveStorageQuota {
  const limit = Number(rawQuota?.limit || 0); // Tài khoản không giới hạn dung lượng sẽ không có "limit"
  const usage = Number(rawQuota?.usage || 0);
  const usageInDrive = Number(rawQuota?.usageInDrive || 0);
  const usageInDriveTrash = Number(rawQuota?.usageInDriveTrash || 0);

  const percentage = limit > 0 ? Math.min(100, Math.round((usage / limit) * 1000) / 10) : 0;
  const isFull = limit > 0 && usage >= limit;
  const isNearFull = limit > 0 && (isFull || usage / limit >= DRIVE_NEAR_FULL_RATIO);

  return { limit, usage, usageInDrive, usageInDriveTrash, percentage, isNearFull, isFull };
}

// ───────────────────────────── Gọi Drive API ─────────────────────────────

async function driveRequest(url: string, init: RequestInit = {}): Promise<Response> {
  if (!accessToken || Date.now() >= tokenExpiresAt) {
    throw new DriveError(
      'AUTH_REQUIRED',
      'Phiên đăng nhập Google đã hết hạn. Vui lòng đăng nhập lại để tiếp tục đồng bộ.'
    );
  }

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { ...(init.headers || {}), Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new DriveError('NETWORK', 'Không thể kết nối tới Google Drive. Vui lòng kiểm tra mạng.');
  }

  if (res.status === 401) {
    clearDriveSession();
    throw new DriveError(
      'AUTH_REQUIRED',
      'Phiên đăng nhập Google đã hết hạn. Vui lòng đăng nhập lại để tiếp tục đồng bộ.',
      401
    );
  }
  return res;
}

/** Lỗi 403 với reason storageQuotaExceeded / quotaExceeded (hết dung lượng lưu trữ) */
export function isStorageQuotaError(status: number, reasons: string[], message: string): boolean {
  if (status !== 403 && status !== 507) return false;
  if (reasons.includes('storageQuotaExceeded')) return true;
  return reasons.includes('quotaExceeded') && /storage/i.test(message);
}

async function toDriveError(res: Response, fallbackMessage: string): Promise<DriveError> {
  const body = (await res.json().catch(() => null)) as {
    error?: { message?: string; errors?: Array<{ reason?: string }> };
  } | null;
  const message = body?.error?.message || fallbackMessage;
  const reasons = (body?.error?.errors ?? []).map((e) => e.reason ?? '');

  if (isStorageQuotaError(res.status, reasons, message)) {
    return new DriveError('QUOTA_EXCEEDED', DRIVE_FULL_ERROR_MESSAGE, res.status);
  }
  return new DriveError('API', message, res.status);
}

// GET https://www.googleapis.com/drive/v3/about?fields=storageQuota,user
export async function checkDriveQuota(): Promise<DriveStorageQuota> {
  const res = await driveRequest(`${DRIVE_API}/about?fields=storageQuota,user`);
  if (!res.ok) {
    throw await toDriveError(res, `Không thể kiểm tra dung lượng Google Drive (${res.status}).`);
  }
  const data = await res.json();
  return computeQuotaMetrics(data.storageQuota);
}

/** Kiểm tra dung lượng nhưng không làm hỏng thao tác Đọc/Ghi nếu chỉ riêng bước này lỗi */
async function safeCheckQuota(): Promise<DriveStorageQuota | null> {
  try {
    return await checkDriveQuota();
  } catch (err) {
    if (err instanceof DriveError && err.code === 'AUTH_REQUIRED') throw err;
    return null;
  }
}

// ───────────────────────────── Tìm tệp cơ sở dữ liệu ─────────────────────────────

interface DriveFileMeta {
  id: string;
  name?: string;
  trashed?: boolean;
  modifiedTime?: string;
}

type LocatedFile =
  | { state: 'active'; file: DriveFileMeta }
  | { state: 'trashed'; file: DriveFileMeta }
  | { state: 'missing'; wasKnown: boolean };

async function queryFiles(q: string): Promise<DriveFileMeta[]> {
  const params = new URLSearchParams({
    q,
    fields: 'files(id,name,trashed,modifiedTime)',
    orderBy: 'modifiedTime desc',
    pageSize: '10',
    spaces: 'drive',
  });
  const res = await driveRequest(`${DRIVE_API}/files?${params.toString()}`);
  if (!res.ok) throw await toDriveError(res, 'Không thể truy vấn danh sách tệp trên Google Drive.');
  const data = await res.json();
  return (data.files as DriveFileMeta[] | undefined) ?? [];
}

async function locateDatabaseFile(): Promise<LocatedFile> {
  const knownId = getKnownDriveFileId();

  // 1) Tệp đã biết ID: kiểm tra trực tiếp trạng thái trashed (kể cả khi người dùng lỡ đổi tên tệp)
  if (knownId) {
    const res = await driveRequest(
      `${DRIVE_API}/files/${encodeURIComponent(knownId)}?fields=id,name,trashed,modifiedTime`
    );
    if (res.ok) {
      const file = (await res.json()) as DriveFileMeta;
      return file.trashed ? { state: 'trashed', file } : { state: 'active', file };
    }
    if (res.status !== 404 && res.status !== 403) {
      throw await toDriveError(res, 'Không thể kiểm tra trạng thái tệp dữ liệu trên Google Drive.');
    }
    const err = await toDriveError(res, '');
    if (err.code === 'QUOTA_EXCEEDED') throw err;
  }

  // 2) Tìm theo tên: name = 'kronoflow_database.json' and trashed = false
  const nameQuery = `name = '${DRIVE_DB_FILENAME}'`;
  const active = (await queryFiles(`${nameQuery} and trashed = false`))[0];
  if (active) return { state: 'active', file: active };

  // 3) Không còn bản nào hoạt động: kiểm tra Thùng rác
  const trashed = (await queryFiles(`${nameQuery} and trashed = true`))[0];
  if (trashed) return { state: 'trashed', file: trashed };

  return { state: 'missing', wasKnown: Boolean(knownId) };
}

// ───────────────────────────── Tạo / cập nhật tệp ─────────────────────────────

function buildMultipartBody(metadata: object, payload: KronoFlowDatabase, boundary: string): string {
  return (
    `\r\n--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(payload, null, 2) +
    `\r\n--${boundary}--`
  );
}

async function createDatabaseFile(payload: KronoFlowDatabase): Promise<string> {
  const boundary = '-------KronoFlowCreateBoundary314159';
  const res = await driveRequest(
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,description`,
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: buildMultipartBody(
        { name: DRIVE_DB_FILENAME, mimeType: 'application/json', description: DRIVE_DB_DESCRIPTION },
        payload,
        boundary
      ),
    }
  );
  if (!res.ok) {
    throw await toDriveError(res, `Không thể khởi tạo tệp ${DRIVE_DB_FILENAME} trên Google Drive.`);
  }
  const created = (await res.json()) as { id: string };
  setKnownDriveFileId(created.id);
  return created.id;
}

/** Trả về false nếu tệp không còn (404) */
async function updateDatabaseFile(fileId: string, payload: KronoFlowDatabase): Promise<boolean> {
  const boundary = '-------KronoFlowUpdateBoundary271828';
  // Ghi lại name + description để giữ lời nhắc "không xóa" ngay cả khi người dùng lỡ đổi tên tệp
  const res = await driveRequest(
    `${DRIVE_UPLOAD_API}/files/${encodeURIComponent(fileId)}?uploadType=multipart&fields=id,modifiedTime`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: buildMultipartBody(
        { name: DRIVE_DB_FILENAME, description: DRIVE_DB_DESCRIPTION },
        payload,
        boundary
      ),
    }
  );
  if (res.status === 404) return false;
  if (!res.ok) {
    throw await toDriveError(res, `Không thể đồng bộ dữ liệu lên tệp ${DRIVE_DB_FILENAME}.`);
  }
  return true;
}

/** Đưa tệp dữ liệu ra khỏi Thùng rác Drive (không thay đổi nội dung) */
export async function untrashDatabaseFile(fileId: string): Promise<boolean> {
  const res = await driveRequest(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=id,trashed`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: false }),
  });
  if (res.ok) {
    setKnownDriveFileId(fileId);
    return true;
  }
  if (res.status === 404 || res.status === 403) return false;
  throw await toDriveError(res, 'Không thể khôi phục tệp từ Thùng rác Google Drive.');
}

// ───────────────────────────── ĐỌC ─────────────────────────────

export type DriveReadOutcome =
  | {
      status: 'loaded' | 'created';
      fileId: string;
      data: KronoFlowDatabase;
      quota: DriveStorageQuota | null;
    }
  | { status: 'trashed_or_deleted'; trashedFileId?: string; quota: DriveStorageQuota | null }
  | { status: 'quota_exceeded'; quota: DriveStorageQuota | null };

/**
 * Đọc kronoflow_database.json từ Drive của người dùng (tự tạo nếu là lần đầu).
 * Việc ĐỌC không bao giờ bị chặn vì Drive đầy: người dùng luôn xem được dữ liệu của mình.
 */
export async function readOrCreateDatabase(
  initialPayload: KronoFlowDatabase
): Promise<DriveReadOutcome> {
  const [quota, located] = await Promise.all([safeCheckQuota(), locateDatabaseFile()]);

  if (located.state === 'trashed') {
    return { status: 'trashed_or_deleted', trashedFileId: located.file.id, quota };
  }

  if (located.state === 'missing') {
    // Từng đồng bộ nhưng nay không còn tệp → bị xóa hẳn. Cảnh báo, KHÔNG tự tạo đè.
    if (located.wasKnown) return { status: 'trashed_or_deleted', quota };

    if (quota?.isFull) return { status: 'quota_exceeded', quota };
    try {
      const fileId = await createDatabaseFile(initialPayload);
      return { status: 'created', fileId, data: initialPayload, quota };
    } catch (err) {
      if (err instanceof DriveError && err.code === 'QUOTA_EXCEEDED') {
        return { status: 'quota_exceeded', quota };
      }
      throw err;
    }
  }

  const res = await driveRequest(`${DRIVE_API}/files/${encodeURIComponent(located.file.id)}?alt=media`);
  if (res.status === 404) return { status: 'trashed_or_deleted', quota };
  if (!res.ok) throw await toDriveError(res, `Không thể đọc nội dung tệp ${DRIVE_DB_FILENAME}.`);

  const rawJson = await res.json().catch(() => null);
  setKnownDriveFileId(located.file.id);
  return {
    status: 'loaded',
    fileId: located.file.id,
    data: normalizeDatabase(rawJson, initialPayload),
    quota,
  };
}

// ───────────────────────────── GHI ─────────────────────────────

export type DriveWriteOutcome =
  | { status: 'synced'; fileId: string; quota: DriveStorageQuota | null }
  | { status: 'quota_exceeded'; quota: DriveStorageQuota | null }
  | { status: 'trashed_or_deleted'; trashedFileId?: string; quota: DriveStorageQuota | null };

/** Ghi toàn bộ cơ sở dữ liệu lên Drive (kiểm tra dung lượng + trạng thái Thùng rác trước khi ghi) */
export async function writeDatabase(payload: KronoFlowDatabase): Promise<DriveWriteOutcome> {
  const [quota, located] = await Promise.all([safeCheckQuota(), locateDatabaseFile()]);

  if (quota?.isFull) return { status: 'quota_exceeded', quota };

  if (located.state === 'trashed') {
    return { status: 'trashed_or_deleted', trashedFileId: located.file.id, quota };
  }

  try {
    if (located.state === 'missing') {
      if (located.wasKnown) return { status: 'trashed_or_deleted', quota };
      const fileId = await createDatabaseFile(payload);
      return { status: 'synced', fileId, quota };
    }

    const updated = await updateDatabaseFile(located.file.id, payload);
    if (!updated) return { status: 'trashed_or_deleted', quota };
    setKnownDriveFileId(located.file.id);
    return { status: 'synced', fileId: located.file.id, quota };
  } catch (err) {
    if (err instanceof DriveError && err.code === 'QUOTA_EXCEEDED') {
      return { status: 'quota_exceeded', quota };
    }
    throw err;
  }
}

/**
 * Khôi phục tệp lên Drive từ bản đệm LocalStorage:
 * nếu tệp cũ còn trong Thùng rác thì lấy ra khỏi Thùng rác rồi ghi đè nội dung mới nhất,
 * nếu đã bị xóa hẳn thì tạo lại tệp mới.
 */
export async function restoreDatabaseFromLocal(
  payload: KronoFlowDatabase,
  trashedFileId?: string
): Promise<DriveWriteOutcome> {
  const quota = await safeCheckQuota();
  if (quota?.isFull) return { status: 'quota_exceeded', quota };

  try {
    if (trashedFileId) {
      const res = await driveRequest(`${DRIVE_API}/files/${encodeURIComponent(trashedFileId)}?fields=id`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashed: false }),
      });
      if (res.ok) {
        const updated = await updateDatabaseFile(trashedFileId, payload);
        if (updated) {
          setKnownDriveFileId(trashedFileId);
          return { status: 'synced', fileId: trashedFileId, quota };
        }
      } else if (res.status !== 404 && res.status !== 403) {
        throw await toDriveError(res, 'Không thể khôi phục tệp từ Thùng rác Google Drive.');
      }
    }

    const fileId = await createDatabaseFile(payload);
    return { status: 'synced', fileId, quota };
  } catch (err) {
    if (err instanceof DriveError && err.code === 'QUOTA_EXCEEDED') {
      return { status: 'quota_exceeded', quota };
    }
    throw err;
  }
}
