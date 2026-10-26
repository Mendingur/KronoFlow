import { getAccessToken } from './firebase';
import { AppBackupData, TaskItem } from '../types';

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('NEEDS_AUTH');
  }
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (res.status === 401 || res.status === 403) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody?.error?.message || 'Phiên đăng nhập Google đã hết hạn hoặc thiếu quyền.');
  }
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody?.error?.message || `Lỗi gọi Google API (${res.status})`);
  }
  return res.json();
}

// 1. Google Drive: List backup files & upload backup JSON
export async function listDriveFiles() {
  const data = await fetchWithAuth(
    'https://www.googleapis.com/drive/v3/files?pageSize=10&fields=files(id,name,mimeType,modifiedTime,webViewLink)&orderBy=modifiedTime desc'
  );
  return data.files || [];
}

export async function backupToGoogleDrive(backupData: AppBackupData) {
  const token = await getAccessToken();
  if (!token) throw new Error('NEEDS_AUTH');

  const metadata = {
    name: `KronoFlow_Backup_${new Date().toISOString().slice(0, 10)}.json`,
    mimeType: 'application/json',
  };

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelim = `\r\n--${boundary}--`;

  const multipartBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    JSON.stringify(backupData, null, 2) +
    closeDelim;

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
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
    throw new Error('Không thể tải bản sao lưu lên Google Drive.');
  }
  return res.json();
}

// 2. Gmail: List recent emails (e.g. invoices, receipts)
export async function listRecentGmailMessages() {
  const list = await fetchWithAuth(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=6&q=hóa đơn OR biên lai OR thanh toán OR giao dịch'
  );
  const messages = list.messages || [];
  const details = await Promise.all(
    messages.slice(0, 5).map(async (m: { id: string }) => {
      const msg = await fetchWithAuth(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`
      );
      const headers = msg.payload?.headers || [];
      const getHeader = (name: string) =>
        headers.find((h: { name: string; value: string }) => h.name === name)?.value || '';
      return {
        id: m.id,
        subject: getHeader('Subject') || '(Không có tiêu đề)',
        from: getHeader('From'),
        date: getHeader('Date'),
        snippet: msg.snippet || '',
      };
    })
  );
  return details;
}

// 3. Google Tasks: List & Sync tasks
export async function listGoogleTasks() {
  const data = await fetchWithAuth(
    'https://tasks.googleapis.com/tasks/v1/lists/@default/tasks?maxResults=15'
  );
  return data.items || [];
}

export async function pushTaskToGoogleTasks(task: TaskItem) {
  return fetchWithAuth('https://tasks.googleapis.com/tasks/v1/lists/@default/tasks', {
    method: 'POST',
    body: JSON.stringify({
      title: `[${task.priority === 'urgent' ? 'KHẨN CẤP' : 'ƯU TIÊN'}] ${task.title}`,
      notes: task.subtasks.map((s) => `- ${s.title}`).join('\n'),
    }),
  });
}

// 4. Google Calendar: List upcoming events & create event from Task
export async function listCalendarEvents() {
  const timeMin = new Date(Date.now() - 86400000).toISOString();
  const data = await fetchWithAuth(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(
      timeMin
    )}&maxResults=10&singleEvents=true&orderBy=startTime`
  );
  return data.items || [];
}

export async function createCalendarEventFromTask(task: TaskItem) {
  const start = new Date();
  start.setHours(start.getHours() + 1, 0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  return fetchWithAuth('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    body: JSON.stringify({
      summary: `[KronoFlow] ${task.title}`,
      description: `Mức ưu tiên: ${task.priority}\nCác bước con:\n${task.subtasks
        .map((s) => `• ${s.title}`)
        .join('\n')}`,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
    }),
  });
}

// 5. Google Docs: Read document title & structure by ID
export async function inspectGoogleDoc(documentId: string) {
  return fetchWithAuth(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId.trim())}`);
}

// 6. Google Slides: Read presentation metadata by ID
export async function inspectGoogleSlides(presentationId: string) {
  return fetchWithAuth(
    `https://slides.googleapis.com/v1/presentations/${encodeURIComponent(presentationId.trim())}`
  );
}

// 7. Google Forms: Read form metadata by ID
export async function inspectGoogleForm(formId: string) {
  return fetchWithAuth(`https://forms.googleapis.com/v1/forms/${encodeURIComponent(formId.trim())}`);
}

// 8. Google Contacts (People API): List contacts
export async function listGoogleContacts() {
  const data = await fetchWithAuth(
    'https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers&pageSize=10'
  );
  return data.connections || [];
}

// 9. Google Meet: Create instant meeting space
export async function createGoogleMeetSpace() {
  return fetchWithAuth('https://meet.googleapis.com/v2/spaces', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

// 10. Google Chat: List chat spaces
export async function listGoogleChatSpaces() {
  const data = await fetchWithAuth('https://chat.googleapis.com/v1/spaces?pageSize=10');
  return data.spaces || [];
}

// 11. Google Keep: List Keep notes (with Enterprise Workspace handling)
export async function listGoogleKeepNotes() {
  const data = await fetchWithAuth('https://keep.googleapis.com/v1/notes?pageSize=10');
  return data.notes || [];
}
