import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  DriveError,
  checkDriveQuota,
  clearDriveSession,
  readOrCreateDatabase,
  restoreDatabaseFromLocal,
  setKnownDriveFileId,
  signInWithGoogleDrive,
  writeDatabase,
} from './googleDriveService';
import { DRIVE_DB_DESCRIPTION, DRIVE_DB_FILENAME, setConfiguredGoogleClientId } from '../config/constants';
import { KronoFlowDatabase } from '../types';

/* ───────── Môi trường giả lập trình duyệt + Google Drive (trong bộ nhớ) ───────── */

const store = new Map<string, string>();
const g = globalThis as Record<string, unknown>;
g.window = globalThis;
g.localStorage = {
  getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
};
g.google = {
  accounts: {
    oauth2: {
      initTokenClient: (cfg: { callback: (r: unknown) => void }) => ({
        requestAccessToken: () => cfg.callback({ access_token: 'test-token', expires_in: 3600 }),
      }),
      hasGrantedAllScopes: () => true,
    },
  },
};

interface FakeFile {
  id: string;
  name: string;
  description?: string;
  trashed: boolean;
  content: string;
}

const drive = {
  files: new Map<string, FakeFile>(),
  quota: { limit: String(15 * 1024 ** 3), usage: String(1 * 1024 ** 3) } as Record<string, string | undefined>,
  failUpdateWithStorageQuota: false,
  nextId: 1,
  unauthorized: false,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function parseMultipart(body: string, contentType: string) {
  const boundary = contentType.split('boundary=')[1];
  const parts = body
    .split(`--${boundary}`)
    .filter((c) => c.includes('Content-Type'))
    .map((c) => JSON.parse(c.split('\r\n\r\n')[1].trim()));
  return { metadata: parts[0], content: parts[1] };
}

g.fetch = async (input: string, init: RequestInit = {}): Promise<Response> => {
  const url = new URL(input);
  const method = (init.method || 'GET').toUpperCase();
  const headers = (init.headers || {}) as Record<string, string>;

  if (url.pathname === '/oauth2/v3/userinfo') return json({ name: 'Test User', email: 'test@example.com' });
  if (drive.unauthorized) return json({ error: { message: 'Invalid Credentials' } }, 401);

  if (url.pathname === '/drive/v3/about') return json({ storageQuota: drive.quota });

  if (url.pathname === '/drive/v3/files' && method === 'GET') {
    const q = url.searchParams.get('q') || '';
    const trashed = q.includes('trashed = true');
    const list = [...drive.files.values()].filter(
      (f) => q.includes(`name = '${f.name}'`) && f.trashed === trashed
    );
    return json({ files: list.map(({ id, name, trashed: t }) => ({ id, name, trashed: t })) });
  }

  if (url.pathname === '/upload/drive/v3/files' && method === 'POST') {
    const { metadata, content } = parseMultipart(init.body as string, headers['Content-Type']);
    if (drive.failUpdateWithStorageQuota) {
      return json({ error: { message: 'quota', errors: [{ reason: 'storageQuotaExceeded' }] } }, 403);
    }
    const id = `file-${drive.nextId++}`;
    drive.files.set(id, {
      id,
      name: metadata.name,
      description: metadata.description,
      trashed: false,
      content: JSON.stringify(content),
    });
    return json({ id });
  }

  const idMatch = url.pathname.match(/\/(?:upload\/)?drive\/v3\/files\/([^/]+)$/);
  if (idMatch) {
    const file = drive.files.get(decodeURIComponent(idMatch[1]));
    if (!file) return json({ error: { message: 'File not found' } }, 404);

    if (method === 'GET' && url.searchParams.get('alt') === 'media') return new Response(file.content);
    if (method === 'GET') return json({ id: file.id, name: file.name, trashed: file.trashed });

    if (method === 'PATCH' && url.pathname.startsWith('/upload/')) {
      if (drive.failUpdateWithStorageQuota) {
        return json({ error: { message: 'quota', errors: [{ reason: 'storageQuotaExceeded' }] } }, 403);
      }
      const { metadata, content } = parseMultipart(init.body as string, headers['Content-Type']);
      file.name = metadata.name;
      file.description = metadata.description;
      file.content = JSON.stringify(content);
      return json({ id: file.id });
    }
    if (method === 'PATCH') {
      const body = JSON.parse(init.body as string);
      if (typeof body.trashed === 'boolean') file.trashed = body.trashed;
      return json({ id: file.id });
    }
  }
  return json({ error: { message: `Unhandled ${method} ${input}` } }, 500);
};

function sampleDb(label: string): KronoFlowDatabase {
  return {
    version: '2.0',
    lastUpdated: new Date().toISOString(),
    settings: { darkMode: false },
    budgets: { monthlyBudget: 10_000_000 },
    transactions: [
      { id: label, type: 'expense', amount: 50000, category: 'Ăn uống', note: label, date: '2026-10-26' },
    ],
    habits: [],
    todos: [],
  };
}

beforeEach(async () => {
  store.clear();
  drive.files.clear();
  drive.quota = { limit: String(15 * 1024 ** 3), usage: String(1 * 1024 ** 3) };
  drive.failUpdateWithStorageQuota = false;
  drive.unauthorized = false;
  clearDriveSession();
  setKnownDriveFileId(null);
  setConfiguredGoogleClientId('test-client.apps.googleusercontent.com');
  await signInWithGoogleDrive();
});

/* ───────── Các kịch bản ───────── */

test('lần đầu đăng nhập: tự tạo kronoflow_database.json kèm mô tả cảnh báo không xóa', async () => {
  const outcome = await readOrCreateDatabase(sampleDb('seed'));
  assert.equal(outcome.status, 'created');
  const file = [...drive.files.values()][0];
  assert.equal(file.name, DRIVE_DB_FILENAME);
  assert.equal(file.description, DRIVE_DB_DESCRIPTION);
});

test('lần sau: đọc lại đúng dữ liệu, và đọc được cả tên trường cũ (tasks / updatedAt)', async () => {
  await readOrCreateDatabase(sampleDb('first'));
  const file = [...drive.files.values()][0];
  file.content = JSON.stringify({ transactions: [], habits: [], tasks: [{ id: 't1' }], updatedAt: 'x', settings: { monthlyBudget: 7_000_000, darkMode: true } });

  const outcome = await readOrCreateDatabase(sampleDb('ignored'));
  assert.equal(outcome.status, 'loaded');
  if (outcome.status === 'loaded') {
    assert.equal(outcome.data.todos.length, 1);
    assert.equal(outcome.data.budgets.monthlyBudget, 7_000_000);
    assert.equal(outcome.data.settings.darkMode, true);
  }
});

test('ghi dữ liệu: cập nhật đúng tệp và giữ nguyên tên + mô tả', async () => {
  await readOrCreateDatabase(sampleDb('first'));
  const res = await writeDatabase(sampleDb('second'));
  assert.equal(res.status, 'synced');
  const file = [...drive.files.values()][0];
  assert.ok(file.content.includes('second'));
  assert.equal(drive.files.size, 1);
});

test('tệp bị chuyển vào Thùng rác: cả ĐỌC lẫn GHI đều báo trashed_or_deleted, không tự ghi đè', async () => {
  await readOrCreateDatabase(sampleDb('first'));
  const file = [...drive.files.values()][0];
  file.trashed = true;

  const read = await readOrCreateDatabase(sampleDb('x'));
  assert.equal(read.status, 'trashed_or_deleted');
  if (read.status === 'trashed_or_deleted') assert.equal(read.trashedFileId, file.id);

  const write = await writeDatabase(sampleDb('y'));
  assert.equal(write.status, 'trashed_or_deleted');
  assert.ok(!file.content.includes('"y"'));
});

test('tệp bị xóa vĩnh viễn (đã từng đồng bộ): cảnh báo thay vì lặng lẽ tạo tệp mới', async () => {
  await readOrCreateDatabase(sampleDb('first'));
  drive.files.clear();
  const read = await readOrCreateDatabase(sampleDb('x'));
  assert.equal(read.status, 'trashed_or_deleted');
  assert.equal(drive.files.size, 0);
});

test('khôi phục từ bản đệm: lấy tệp ra khỏi Thùng rác và ghi đè nội dung mới nhất', async () => {
  await readOrCreateDatabase(sampleDb('first'));
  const file = [...drive.files.values()][0];
  file.trashed = true;

  const res = await restoreDatabaseFromLocal(sampleDb('local-latest'), file.id);
  assert.equal(res.status, 'synced');
  assert.equal(file.trashed, false);
  assert.ok(file.content.includes('local-latest'));
  assert.equal(drive.files.size, 1);
});

test('khôi phục khi tệp đã bị xóa hẳn: tạo lại tệp mới', async () => {
  await readOrCreateDatabase(sampleDb('first'));
  drive.files.clear();
  const res = await restoreDatabaseFromLocal(sampleDb('local-latest'));
  assert.equal(res.status, 'synced');
  assert.equal(drive.files.size, 1);
});

test('Drive đầy 100%: GHI bị chặn (quota_exceeded) nhưng ĐỌC vẫn xem được dữ liệu', async () => {
  await readOrCreateDatabase(sampleDb('first'));
  drive.quota = { limit: String(15 * 1024 ** 3), usage: String(15 * 1024 ** 3) };

  const write = await writeDatabase(sampleDb('second'));
  assert.equal(write.status, 'quota_exceeded');

  const read = await readOrCreateDatabase(sampleDb('x'));
  assert.equal(read.status, 'loaded');
  if (read.status === 'loaded') assert.equal(read.quota?.isFull, true);
});

test('Drive sắp đầy (>=98%) vẫn ghi được nhưng báo isNearFull', async () => {
  await readOrCreateDatabase(sampleDb('first'));
  drive.quota = { limit: String(100), usage: String(99) };
  const write = await writeDatabase(sampleDb('second'));
  assert.equal(write.status, 'synced');
  assert.equal(write.quota?.isNearFull, true);
  assert.equal(write.quota?.isFull, false);
});

test('lỗi 403 storageQuotaExceeded khi ghi được bắt và báo quota_exceeded', async () => {
  await readOrCreateDatabase(sampleDb('first'));
  drive.failUpdateWithStorageQuota = true;
  const write = await writeDatabase(sampleDb('second'));
  assert.equal(write.status, 'quota_exceeded');
});

test('lần đầu đăng nhập nhưng Drive đầy: không tạo được tệp → quota_exceeded', async () => {
  drive.quota = { limit: String(100), usage: String(100) };
  const read = await readOrCreateDatabase(sampleDb('first'));
  assert.equal(read.status, 'quota_exceeded');
  assert.equal(drive.files.size, 0);
});

test('checkDriveQuota trả về thông tin dung lượng; mã 401 → DriveError AUTH_REQUIRED', async () => {
  const quota = await checkDriveQuota();
  assert.equal(quota.isFull, false);

  drive.unauthorized = true;
  await assert.rejects(checkDriveQuota(), (err: unknown) => err instanceof DriveError && err.code === 'AUTH_REQUIRED');
});
