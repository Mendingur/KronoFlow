import {
  DRIVE_DB_FILENAME,
  DRIVE_DB_DESCRIPTION,
  DRIVE_REQUIRED_SCOPES,
  getConfiguredGoogleClientId,
  hasCustomGoogleClientId,
} from '../config/constants';
import {
  FinHabitDatabaseSchema,
  DriveStorageQuota,
  UserProfileInfo,
} from '../types';
import { googleSignIn } from './firebase';

export const DRIVE_FILE_ID_STORAGE_KEY = 'kronoflow_drive_file_id_v1';

// In-memory OAuth access token cache (never persisted to localStorage per security best practices)
let cachedDriveAccessToken: string | null = null;

// Optional simulation state for testing Drive Full (>98% / 403) and File Trashed/Deleted flows
let simulatedDriveCondition: 'none' | 'drive_full' | 'file_trashed' = 'none';

export function setSimulatedDriveCondition(
  condition: 'none' | 'drive_full' | 'file_trashed'
) {
  simulatedDriveCondition = condition;
}

export function getSimulatedDriveCondition() {
  return simulatedDriveCondition;
}

export function getDriveAccessToken(): string | null {
  return cachedDriveAccessToken;
}

export function setDriveAccessToken(token: string | null): void {
  cachedDriveAccessToken = token;
}

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
    // Ignore storage errors
  }
}

export function formatBytesVN(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${gb.toFixed(2).replace('.', ',')} GB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1).replace('.', ',')} MB`;
}

export function computeQuotaMetrics(rawQuota?: {
  limit?: string | number;
  usage?: string | number;
  usageInDrive?: string | number;
  usageInDriveTrash?: string | number;
}): DriveStorageQuota {
  const limit = Number(rawQuota?.limit || 0);
  const usage = Number(rawQuota?.usage || 0);
  const usageInDrive = Number(rawQuota?.usageInDrive || 0);
  const usageInDriveTrash = Number(rawQuota?.usageInDriveTrash || 0);

  const percentage =
    limit > 0 ? Math.min(100, Math.round((usage / limit) * 1000) / 10) : 0;
  const isFull = limit > 0 && usage >= limit;
  const isNearFull = limit > 0 && (usage / limit > 0.98 || isFull);

  return {
    limit,
    usage,
    usageInDrive,
    usageInDriveTrash,
    percentage,
    isNearFull,
    isFull,
  };
}

// Sign in using Google Identity Services (https://accounts.google.com/gsi/client)
// or fallback to provisioned Firebase Google OAuth popup if using default project config
export async function authenticateWithGoogleDrive(): Promise<{
  accessToken: string;
  profile: UserProfileInfo;
}> {
  const win = window as Window & {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: {
              access_token?: string;
              error?: string;
              error_description?: string;
            }) => void;
          }) => { requestAccessToken: (overrideConfig?: { prompt?: string }) => void };
        };
      };
    };
  };

  // If the user configured their own GOOGLE_CLIENT_ID and GIS is loaded, use GIS Token Client directly
  if (hasCustomGoogleClientId() && win.google?.accounts?.oauth2) {
    const clientId = getConfiguredGoogleClientId();
    const token = await new Promise<string>((resolve, reject) => {
      const tokenClient = win.google!.accounts!.oauth2!.initTokenClient({
        client_id: clientId,
        scope: DRIVE_REQUIRED_SCOPES.join(' '),
        callback: (resp) => {
          if (resp.error || !resp.access_token) {
            reject(
              new Error(
                resp.error_description || resp.error || 'Không lấy được Access Token từ Google.'
              )
            );
            return;
          }
          resolve(resp.access_token);
        },
      });
      tokenClient.requestAccessToken({ prompt: 'consent' });
    });

    cachedDriveAccessToken = token;

    // Fetch user profile via Google OAuth2 userinfo
    let profile: UserProfileInfo = {
      name: 'Người dùng Google Drive',
      email: '',
    };
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
      // Non-fatal profile fetch error
    }

    return { accessToken: token, profile };
  }

  // Otherwise use the provisioned Google OAuth popup (which includes drive.file scope)
  const result = await googleSignIn();
  if (!result || !result.accessToken) {
    throw new Error('Đăng nhập Google không thành công.');
  }
  cachedDriveAccessToken = result.accessToken;
  return {
    accessToken: result.accessToken,
    profile: {
      name: result.user.displayName || 'Người dùng Google',
      email: result.user.email || '',
      picture: result.user.photoURL || undefined,
    },
  };
}

// Fetch Google Drive storage quota via GET https://www.googleapis.com/drive/v3/about?fields=storageQuota
export async function fetchDriveStorageQuota(
  token?: string | null
): Promise<DriveStorageQuota> {
  if (simulatedDriveCondition === 'drive_full') {
    const limit = 15 * 1024 * 1024 * 1024; // 15 GB
    const usage = Math.round(limit * 0.992); // 99.2% (> 98%)
    return computeQuotaMetrics({
      limit,
      usage,
      usageInDrive: Math.round(limit * 0.94),
      usageInDriveTrash: Math.round(limit * 0.052),
    });
  }

  const activeToken = token || cachedDriveAccessToken;
  if (
    simulatedDriveCondition === 'file_trashed' ||
    activeToken === 'simulated-token'
  ) {
    const limit = 15 * 1024 * 1024 * 1024; // 15 GB
    const usage = Math.round(limit * 0.28); // 28% (4.2 GB)
    return computeQuotaMetrics({
      limit,
      usage,
      usageInDrive: Math.round(limit * 0.26),
      usageInDriveTrash: Math.round(limit * 0.02),
    });
  }

  if (!activeToken) {
    throw new Error('NEEDS_DRIVE_AUTH');
  }

  const res = await fetch(
    'https://www.googleapis.com/drive/v3/about?fields=storageQuota,user',
    {
      headers: {
        Authorization: `Bearer ${activeToken}`,
      },
    }
  );

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      errBody?.error?.message || `Không thể kiểm tra dung lượng Google Drive (${res.status})`
    );
  }

  const data = await res.json();
  return computeQuotaMetrics(data.storageQuota);
}

function isQuotaExceededError(status: number, errorBody: unknown): boolean {
  if (status !== 403 && status !== 507) return false;
  const serialized = JSON.stringify(errorBody || '').toLowerCase();
  return (
    serialized.includes('storagequotaexceeded') ||
    serialized.includes('quotaexceeded') ||
    serialized.includes('storage quota')
  );
}

export type DriveReadOutcome =
  | {
      status: 'loaded' | 'created';
      fileId: string;
      data: FinHabitDatabaseSchema;
      quota: DriveStorageQuota;
    }
  | {
      status: 'trashed_or_deleted';
      trashedFileId?: string;
      quota: DriveStorageQuota;
    }
  | {
      status: 'quota_exceeded';
      quota: DriveStorageQuota;
    };

// Find or create "finhabit_database.json" on user's Google Drive, checking quota & trash status
export async function readOrCreateFinHabitDatabase(
  token: string,
  initialLocalPayload: FinHabitDatabaseSchema
): Promise<DriveReadOutcome> {
  cachedDriveAccessToken = token;

  // 1. Check storage quota before reading/creating
  const quota = await fetchDriveStorageQuota(token);

  if (simulatedDriveCondition === 'file_trashed') {
    return {
      status: 'trashed_or_deleted',
      trashedFileId: getKnownDriveFileId() || 'simulated-trashed-id',
      quota,
    };
  }

  if (quota.isFull || quota.isNearFull) {
    return {
      status: 'quota_exceeded',
      quota,
    };
  }

  // 2. Search for finhabit_database.json (both active and trashed to detect accidental deletion)
  const query = encodeURIComponent(`name = '${DRIVE_DB_FILENAME}'`);
  const listUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,trashed,modifiedTime,description)&orderBy=modifiedTime desc&pageSize=10`;

  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!listRes.ok) {
    const errBody = await listRes.json().catch(() => ({}));
    if (isQuotaExceededError(listRes.status, errBody)) {
      return { status: 'quota_exceeded', quota };
    }
    throw new Error(
      errBody?.error?.message || 'Không thể truy vấn danh sách tệp trên Google Drive.'
    );
  }

  const listData = await listRes.json();
  const files: Array<{
    id: string;
    name: string;
    trashed?: boolean;
    modifiedTime?: string;
    description?: string;
  }> = listData.files || [];

  const activeFile = files.find((f) => !f.trashed);
  const trashedFile = files.find((f) => f.trashed);
  const previouslyKnownFileId = getKnownDriveFileId();

  // 3. If no active file exists, check if it was moved to Trash or deleted after having been synced before
  if (!activeFile) {
    if (trashedFile || previouslyKnownFileId) {
      return {
        status: 'trashed_or_deleted',
        trashedFileId: trashedFile?.id,
        quota,
      };
    }

    // First-time user: automatically create finhabit_database.json on Google Drive
    const createdFileId = await createDriveDatabaseFile(token, initialLocalPayload);
    setKnownDriveFileId(createdFileId);
    return {
      status: 'created',
      fileId: createdFileId,
      data: initialLocalPayload,
      quota,
    };
  }

  // 4. Active file found: read its JSON content
  const contentRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${activeFile.id}?alt=media`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (contentRes.status === 404) {
    return {
      status: 'trashed_or_deleted',
      quota,
    };
  }

  if (!contentRes.ok) {
    const errBody = await contentRes.json().catch(() => ({}));
    if (isQuotaExceededError(contentRes.status, errBody)) {
      return { status: 'quota_exceeded', quota };
    }
    throw new Error('Không thể đọc nội dung file finhabit_database.json từ Google Drive.');
  }

  const rawJson = await contentRes.json().catch(() => null);
  setKnownDriveFileId(activeFile.id);

  if (!rawJson || typeof rawJson !== 'object') {
    return {
      status: 'loaded',
      fileId: activeFile.id,
      data: initialLocalPayload,
      quota,
    };
  }

  const normalized: FinHabitDatabaseSchema = {
    version: rawJson.version || '2.0',
    updatedAt: rawJson.updatedAt || new Date().toISOString(),
    userProfile: rawJson.userProfile || initialLocalPayload.userProfile,
    settings: {
      darkMode:
        typeof rawJson.settings?.darkMode === 'boolean'
          ? rawJson.settings.darkMode
          : initialLocalPayload.settings.darkMode,
      monthlyBudget:
        typeof rawJson.settings?.monthlyBudget === 'number' &&
        rawJson.settings.monthlyBudget > 0
          ? rawJson.settings.monthlyBudget
          : initialLocalPayload.settings.monthlyBudget,
    },
    transactions: Array.isArray(rawJson.transactions)
      ? rawJson.transactions
      : initialLocalPayload.transactions,
    habits: Array.isArray(rawJson.habits)
      ? rawJson.habits
      : initialLocalPayload.habits,
    tasks: Array.isArray(rawJson.tasks)
      ? rawJson.tasks
      : initialLocalPayload.tasks,
  };

  return {
    status: 'loaded',
    fileId: activeFile.id,
    data: normalized,
    quota,
  };
}

// Helper to create a new finhabit_database.json with mandatory protective description
async function createDriveDatabaseFile(
  token: string,
  payload: FinHabitDatabaseSchema
): Promise<string> {
  const metadata = {
    name: DRIVE_DB_FILENAME,
    mimeType: 'application/json',
    description: DRIVE_DB_DESCRIPTION,
  };

  const boundary = '-------KronoFlowDriveBoundary314159265';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelim = `\r\n--${boundary}--`;

  const multipartBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(payload, null, 2) +
    closeDelim;

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,description',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    }
  );

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    if (isQuotaExceededError(res.status, errBody)) {
      throw new Error('DRIVE_QUOTA_EXCEEDED');
    }
    throw new Error(
      errBody?.error?.message || 'Không thể khởi tạo file finhabit_database.json trên Google Drive.'
    );
  }

  const created = await res.json();
  return created.id as string;
}

export type DriveWriteOutcome =
  | {
      status: 'synced';
      fileId: string;
      quota: DriveStorageQuota;
    }
  | {
      status: 'quota_exceeded';
      quota?: DriveStorageQuota;
    }
  | {
      status: 'trashed_or_deleted';
      quota?: DriveStorageQuota;
    };

// Auto-save database to finhabit_database.json on Google Drive, checking quota & trash status
export async function syncDatabaseToDrive(
  token: string,
  fileId: string | null,
  payload: FinHabitDatabaseSchema
): Promise<DriveWriteOutcome> {
  // 1. Check storage quota before writing
  const quota = await fetchDriveStorageQuota(token);

  if (simulatedDriveCondition === 'drive_full' || quota.isFull || quota.isNearFull) {
    return {
      status: 'quota_exceeded',
      quota,
    };
  }

  if (simulatedDriveCondition === 'file_trashed') {
    return {
      status: 'trashed_or_deleted',
      quota,
    };
  }

  const targetFileId = fileId || getKnownDriveFileId();
  if (!targetFileId) {
    try {
      const newId = await createDriveDatabaseFile(token, payload);
      setKnownDriveFileId(newId);
      return { status: 'synced', fileId: newId, quota };
    } catch (err) {
      if (err instanceof Error && err.message === 'DRIVE_QUOTA_EXCEEDED') {
        return { status: 'quota_exceeded', quota };
      }
      throw err;
    }
  }

  // 2. Check if the file on Drive was moved to Trash or deleted
  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${targetFileId}?fields=id,trashed`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (metaRes.status === 404) {
    return { status: 'trashed_or_deleted', quota };
  }

  if (metaRes.ok) {
    const meta = await metaRes.json();
    if (meta.trashed) {
      return { status: 'trashed_or_deleted', quota };
    }
  }

  // 3. Perform multipart PATCH to update finhabit_database.json content and preserve description
  const metadata = {
    name: DRIVE_DB_FILENAME,
    description: DRIVE_DB_DESCRIPTION,
  };

  const boundary = '-------KronoFlowDriveUpdateBoundary271828';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelim = `\r\n--${boundary}--`;

  const multipartBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(payload, null, 2) +
    closeDelim;

  const updateRes = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${targetFileId}?uploadType=multipart&fields=id,modifiedTime`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    }
  );

  if (updateRes.status === 404) {
    return { status: 'trashed_or_deleted', quota };
  }

  if (!updateRes.ok) {
    const errBody = await updateRes.json().catch(() => ({}));
    if (isQuotaExceededError(updateRes.status, errBody)) {
      return { status: 'quota_exceeded', quota };
    }
    throw new Error(
      errBody?.error?.message || 'Không thể đồng bộ dữ liệu lên file finhabit_database.json.'
    );
  }

  return {
    status: 'synced',
    fileId: targetFileId,
    quota,
  };
}

// Restore finhabit_database.json to Google Drive from LocalStorage backup
export async function restoreDatabaseToDriveFromLocal(
  token: string,
  payload: FinHabitDatabaseSchema
): Promise<DriveWriteOutcome> {
  if (simulatedDriveCondition === 'file_trashed') {
    setSimulatedDriveCondition('none');
  }

  const quota = await fetchDriveStorageQuota(token);
  if (quota.isFull || quota.isNearFull) {
    return {
      status: 'quota_exceeded',
      quota,
    };
  }

  try {
    const createdId = await createDriveDatabaseFile(token, payload);
    setKnownDriveFileId(createdId);
    return {
      status: 'synced',
      fileId: createdId,
      quota,
    };
  } catch (err) {
    if (err instanceof Error && err.message === 'DRIVE_QUOTA_EXCEEDED') {
      return { status: 'quota_exceeded', quota };
    }
    throw err;
  }
}
