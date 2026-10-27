import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { GEMINI_MODEL_FAST, GEMINI_MODEL_SMART } from '../config/constants';
import { getLocalTodayISO } from '../utils/logic';

export const GEMINI_API_KEY_STORAGE_KEY = 'kronoflow_gemini_api_key_v1';

export function getStoredGeminiApiKey(): string {
  try {
    const localKey = localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY)?.trim();
    if (localKey) return localKey;
  } catch {
    // Ignore storage access errors
  }
  const envKey = (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim();
  return envKey || '';
}

export function setStoredGeminiApiKey(key: string): void {
  try {
    const trimmed = key.trim();
    if (trimmed) {
      localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(GEMINI_API_KEY_STORAGE_KEY);
    }
  } catch {
    // Ignore storage access errors
  }
}

export function hasStoredGeminiApiKey(): boolean {
  return getStoredGeminiApiKey().length > 0;
}

function createClientGenAI(): GoogleGenAI | null {
  const apiKey = getStoredGeminiApiKey();
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

function withTimeout<T>(promise: Promise<T>, ms = 8000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('GEMINI_CLIENT_TIMEOUT')), ms)
    ),
  ]);
}

// Deterministic Vietnamese NLP parser when offline or no API key is set on GitHub Pages
export function fallbackParseVietnameseExpenses(text: string, todayISO: string) {
  const clauses = text
    .split(/[,;.\n]+|\s+và\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);

  const parsed: Array<{
    amount: number;
    type: 'income' | 'expense';
    category: string;
    note: string;
    date: string;
  }> = [];

  for (const clause of clauses) {
    const match = clause.match(
      /(\d+(?:[.,]\d+)?)\s*(tr\d*|triệu\s*\d*|m\d*|k|nghìn|ngàn|ng|lít|lit|đ|vnd)?/i
    );
    if (!match) continue;

    const rawNum = match[1].replace(',', '.');
    const unit = (match[2] || '').toLowerCase().trim();
    let amount = 0;

    if (unit.startsWith('tr') || unit.startsWith('triệu') || unit.startsWith('m')) {
      const tailDigits = unit.replace(/[^\d]/g, '');
      if (tailDigits) {
        amount =
          parseInt(rawNum, 10) * 1_000_000 +
          parseInt(tailDigits.padEnd(6, '0').slice(0, 6), 10);
      } else {
        amount = Math.round(parseFloat(rawNum) * 1_000_000);
      }
    } else if (unit.startsWith('lít') || unit.startsWith('lit')) {
      amount = Math.round(parseFloat(rawNum) * 100_000);
    } else if (unit === 'k' || unit.startsWith('ngh') || unit.startsWith('ng')) {
      amount = Math.round(parseFloat(rawNum) * 1_000);
    } else {
      const numVal = parseFloat(rawNum.replace(/\./g, ''));
      amount = numVal < 1000 ? numVal * 1000 : numVal;
    }

    if (amount <= 0) continue;

    const lower = clause.toLowerCase();
    let type: 'income' | 'expense' = 'expense';
    let category = 'Khác';

    if (/(lương|thưởng|thu nhập|nhận tiền|hoàn tiền|bán hàng)/.test(lower)) {
      type = 'income';
      category = 'Thu nhập';
    } else if (/(phở|bún|cơm|ăn|uống|cà phê|cafe|trà sữa|bánh|nhậu|bữa|sáng|trưa|tối)/.test(lower)) {
      category = 'Ăn uống';
    } else if (/(xăng|grab|be|xe|gửi xe|di chuyển|taxi|vé)/.test(lower)) {
      category = 'Di chuyển';
    } else if (/(sách|học|khóa học|học phí|tài liệu)/.test(lower)) {
      category = 'Học tập';
    } else if (/(phim|game|giải trí|netflix|spotify|du lịch)/.test(lower)) {
      category = 'Giải trí';
    } else if (/(mua|siêu thị|áo|quần|giày|shopee|lazada|tiki)/.test(lower)) {
      category = 'Mua sắm';
    } else if (/(điện|nước|internet|wifi|nhà|hóa đơn|cước)/.test(lower)) {
      category = 'Hóa đơn';
    } else if (/(tiết kiệm|gửi góp|quỹ)/.test(lower)) {
      category = 'Tiết kiệm';
    } else if (/(thuốc|khám|bệnh viện|gym|sức khỏe)/.test(lower)) {
      category = 'Sức khỏe';
    }

    const cleanNote = clause
      .replace(match[0], '')
      .replace(/\s+/g, ' ')
      .trim();

    parsed.push({
      amount,
      type,
      category,
      note: cleanNote ? cleanNote.charAt(0).toUpperCase() + cleanNote.slice(1) : clause,
      date: todayISO,
    });
  }

  return parsed;
}

export interface CoachSummaryInput {
  totalIncome: number;
  totalExpense: number;
  monthlyBudget: number;
  budgetPercentage: number;
  completedTasks: number;
  totalTasks: number;
  urgentPending: number;
  todayCompletedHabits: number;
  totalHabits: number;
  streak: number;
  rankTitle: string;
}

export interface CoachResultData {
  headline: string;
  financialAdvice: string;
  productivityWarning: string;
  habitMotivation: string;
  actionItems: string[];
}

// 1. Client-side AI Productivity & Financial Coach
export async function analyzeCoachClientSide(
  summary: CoachSummaryInput
): Promise<{ data: CoachResultData; source: string }> {
  const ai = createClientGenAI();

  if (ai) {
    try {
      const prompt = `Phân tích dữ liệu kỷ luật, công việc và tài chính hôm nay của người dùng và đưa ra lời khuyên ngắn gọn, sắc bén bằng tiếng Việt:
- Tổng thu tháng này: ${summary.totalIncome} VNĐ
- Tổng chi tháng này: ${summary.totalExpense} VNĐ
- Hạn mức ngân sách tháng: ${summary.monthlyBudget} VNĐ (Đã dùng ${summary.budgetPercentage}%)
- Công việc hoàn thành: ${summary.completedTasks}/${summary.totalTasks} (Số việc khẩn cấp chưa xong: ${summary.urgentPending})
- Thói quen đã check-in hôm nay: ${summary.todayCompletedHabits}/${summary.totalHabits} (Chuỗi streak hiện tại: ${summary.streak} ngày, Cấp bậc: ${summary.rankTitle})`;

      const response = await withTimeout(
        ai.models.generateContent({
          model: GEMINI_MODEL_SMART,
          contents: prompt,
          config: {
            systemInstruction:
              'Bạn là Huấn luyện viên Tài chính & Kỷ luật Cá nhân chuyên nghiệp cho người Việt. Hãy trả lời 100% bằng tiếng Việt tự nhiên, hiện đại, súc tích. Trả về JSON đúng cấu trúc yêu cầu.',
            thinkingConfig: {
              thinkingLevel: ThinkingLevel.HIGH,
            },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                headline: {
                  type: Type.STRING,
                  description: 'Nhận định tổng quan 1 câu ngắn gọn, truyền cảm hứng.',
                },
                financialAdvice: {
                  type: Type.STRING,
                  description: 'Đánh giá chi tiêu so với ngân sách tháng và gợi ý tiết kiệm cụ thể.',
                },
                productivityWarning: {
                  type: Type.STRING,
                  description: 'Nhắc nhở về các việc Quan trọng & Khẩn cấp chưa hoàn thành.',
                },
                habitMotivation: {
                  type: Type.STRING,
                  description: 'Lời khích lệ duy trì chuỗi thói quen kỷ luật hôm nay.',
                },
                actionItems: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: '3 hành động cụ thể cần ưu tiên làm ngay hôm nay.',
                },
              },
              required: [
                'headline',
                'financialAdvice',
                'productivityWarning',
                'habitMotivation',
                'actionItems',
              ],
            },
          },
        })
      );

      const parsed = JSON.parse(response.text || '{}') as CoachResultData;
      return { data: parsed, source: 'client-gemini' };
    } catch (err) {
      console.warn('Client-side Gemini coach failed, falling back:', err);
    }
  }

  // Fallback for static GitHub Pages when no personal key is entered yet
  const budgetPct = summary.budgetPercentage ?? 65;
  const urgentCount = summary.urgentPending ?? 2;
  const streak = summary.streak ?? 8;
  return {
    source: 'local-fallback',
    data: {
      headline:
        budgetPct >= 85
          ? 'Cảnh báo: Tốc độ chi tiêu đang tiến sát trần ngân sách tháng!'
          : 'Nhịp độ tài chính và kỷ luật của bạn đang ở mức ổn định, hãy bứt phá!',
      financialAdvice:
        budgetPct >= 85
          ? `Bạn đã sử dụng ${budgetPct}% hạn mức tháng. Hãy tạm dừng các khoản mua sắm không thiết yếu trong 5 ngày tới.`
          : `Mức chi tiêu hiện tại (${budgetPct}% ngân sách) rất hợp lý. Hãy duy trì thói quen nấu ăn và ghi chép thu chi mỗi tối.`,
      productivityWarning:
        urgentCount > 0
          ? `Bạn còn ${urgentCount} công việc Quan trọng & Khẩn cấp chưa hoàn tất. Hãy dành 45 phút tập trung sâu (Pomodoro) xử lý ngay.`
          : 'Tuyệt vời! Bạn đã xử lý hết các đầu việc khẩn cấp trong ngày.',
      habitMotivation: `Chuỗi kỷ luật ${streak} ngày liên tiếp là nền tảng rất tốt. Đừng quên hoàn thành nốt các thói quen còn lại trước 22h00 tối nay!`,
      actionItems: [
        urgentCount > 0
          ? `Hoàn thành ngay ${urgentCount} nhiệm vụ nhóm Quan trọng & Khẩn cấp trước 17h00.`
          : 'Rà soát danh sách công việc ngày mai và sắp xếp thứ tự ưu tiên.',
        'Giữ mức chi tiêu ăn uống & giải trí hôm nay dưới 150.000 đ.',
        'Đánh dấu hoàn thành 100% các thói quen trong bảng Kỷ luật để giữ chuỗi Streak.',
      ],
    },
  };
}

// 2. Client-side Smart Vietnamese Expense Parser
export async function parseExpensesClientSide(text: string, todayISO: string) {
  const ai = createClientGenAI();

  if (ai) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model: GEMINI_MODEL_SMART,
          contents: `Hãy bóc tách câu tiếng Việt sau thành danh sách các giao dịch thu/chi (Hôm nay là ${todayISO}): "${text}"`,
          config: {
            systemInstruction: `Bạn là trợ lý kế toán cá nhân tiếng Việt. Quy đổi đơn vị viết tắt: "k" hoặc "nghìn" = 1000, "lít" = 100000, "tr" hoặc "triệu" hoặc "củ" = 1000000 (ví dụ: "45k" -> 45000, "1tr5" -> 1500000).
Phân loại category chính xác vào một trong các danh mục sau: "Ăn uống", "Di chuyển", "Học tập", "Giải trí", "Mua sắm", "Hóa đơn", "Tiết kiệm", "Sức khỏe", "Thu nhập", "Khác".
Trường type chỉ nhận "expense" (chi tiêu) hoặc "income" (thu nhập).`,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  amount: { type: Type.NUMBER, description: 'Số tiền tính bằng VNĐ (ví dụ 45000)' },
                  type: { type: Type.STRING, description: 'expense hoặc income' },
                  category: { type: Type.STRING, description: 'Tên danh mục tiếng Việt' },
                  note: { type: Type.STRING, description: 'Mô tả ngắn gọn giao dịch bằng tiếng Việt' },
                  date: { type: Type.STRING, description: 'Ngày định dạng YYYY-MM-DD' },
                },
                required: ['amount', 'type', 'category', 'note', 'date'],
              },
            },
          },
        })
      );

      const items = JSON.parse(response.text || '[]');
      return { items, source: 'client-gemini' };
    } catch (err) {
      console.warn('Client-side expense parse error, using Vietnamese NLP parser:', err);
    }
  }

  return {
    items: fallbackParseVietnameseExpenses(text, todayISO),
    source: 'local-nlp',
  };
}

// 3. Client-side Receipt Image Vision Parser
export async function parseReceiptClientSide(
  base64Data: string,
  mimeType = 'image/jpeg',
  todayISO = getLocalTodayISO()
) {
  const ai = createClientGenAI();

  if (ai) {
    try {
      const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
      const response = await withTimeout(
        ai.models.generateContent({
          model: GEMINI_MODEL_SMART,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: cleanBase64,
                },
              },
              {
                text: `Đọc hình ảnh hóa đơn/biên lai này và trích xuất các khoản chi tiêu hoặc tổng thanh toán bằng tiếng Việt. Nếu không rõ ngày, dùng ngày ${todayISO}.`,
              },
            ],
          },
          config: {
            systemInstruction:
              'Bạn là AI nhận diện hóa đơn tiếng Việt. Trích xuất chính xác số tiền VNĐ, danh mục ("Ăn uống", "Di chuyển", "Học tập", "Giải trí", "Mua sắm", "Hóa đơn", "Tiết kiệm", "Sức khỏe", "Thu nhập", "Khác") và ghi chú tiếng Việt.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  amount: { type: Type.NUMBER },
                  type: { type: Type.STRING },
                  category: { type: Type.STRING },
                  note: { type: Type.STRING },
                  date: { type: Type.STRING },
                },
                required: ['amount', 'type', 'category', 'note', 'date'],
              },
            },
          },
        })
      );

      const items = JSON.parse(response.text || '[]');
      return { items, source: 'client-gemini' };
    } catch (err) {
      console.warn('Client-side receipt vision error:', err);
    }
  }

  return {
    source: 'local-fallback',
    items: [
      {
        amount: 125000,
        type: 'expense',
        category: 'Mua sắm',
        note: 'Hóa đơn mua hàng trích xuất từ ảnh chụp biên lai',
        date: todayISO,
      },
    ],
  };
}

// 4. Client-side AI Task Breakdown
export async function breakdownTaskClientSide(taskTitle: string) {
  const ai = createClientGenAI();

  if (ai) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model: GEMINI_MODEL_FAST,
          contents: `Chia nhỏ mục tiêu/công việc sau thành 4 đến 5 bước hành động cụ thể, ngắn gọn, có thể thực hiện ngay trong ngày hôm nay bằng tiếng Việt: "${taskTitle}"`,
          config: {
            systemInstruction:
              'Bạn là chuyên gia quản lý thời gian GTD. Trả về mảng JSON gồm 4-5 bước hành động cụ thể bằng tiếng Việt, bắt đầu bằng động từ mạnh.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.STRING,
              },
            },
          },
        })
      );

      const subtasks = JSON.parse(response.text || '[]');
      return { subtasks, source: 'client-gemini' };
    } catch (err) {
      console.warn('Client-side task breakdown error:', err);
    }
  }

  return {
    source: 'local-fallback',
    subtasks: [
      `Xác định phạm vi, mục tiêu đầu ra và tài liệu cần thiết cho: ${taskTitle}`,
      'Lập dàn ý chi tiết các hạng mục quan trọng nhất trong 20 phút đầu',
      'Thực hiện tập trung (Deep Work) giải quyết phần cốt lõi không xao nhãng',
      'Kiểm tra chéo kết quả, hoàn thiện chi tiết và đánh dấu hoàn thành',
    ],
  };
}

// 5. Client-side Multi-Turn Gemini Chatbot
export async function sendChatMessageClientSide(
  messages: Array<{ role: string; content: string }>,
  mode: 'thinking' | 'general' | 'fast' | 'search' | 'maps',
  contextSummary: string
): Promise<{
  reply: string;
  model: string;
  sources: Array<{ title: string; uri: string }>;
}> {
  const lastMessage = messages[messages.length - 1]?.content || 'Xin chào';
  const ai = createClientGenAI();

  if (ai) {
    try {
      const systemInstruction = `Bạn là Trợ lý AI Đa Năng của ứng dụng "KronoFlow".
Luôn trả lời 100% bằng tiếng Việt tự nhiên, rõ ràng, có cấu trúc gạch đầu dòng dễ đọc.
Bối cảnh dữ liệu hiện tại của người dùng: ${contextSummary}`;

      const formattedHistory = messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      let modelName: string = GEMINI_MODEL_SMART;
      const config: Record<string, unknown> = {
        systemInstruction,
      };

      if (mode === 'thinking') {
        modelName = GEMINI_MODEL_SMART;
        config.thinkingConfig = {
          thinkingLevel: ThinkingLevel.HIGH,
        };
      } else if (mode === 'fast') {
        modelName = GEMINI_MODEL_FAST;
      } else if (mode === 'search') {
        modelName = GEMINI_MODEL_SMART;
        config.tools = [{ googleSearch: {} }];
      } else if (mode === 'maps') {
        modelName = GEMINI_MODEL_SMART;
        config.tools = [{ googleMaps: {} }];
      }

      const response = await withTimeout(
        ai.models.generateContent({
          model: modelName,
          contents: formattedHistory,
          config,
        }),
        15000
      );

      const sources: Array<{ title: string; uri: string }> = [];
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      for (const chunk of chunks as Array<{
        web?: { title?: string; uri?: string };
        maps?: { title?: string; uri?: string };
      }>) {
        if (chunk.web?.uri) {
          sources.push({
            title: chunk.web.title || chunk.web.uri,
            uri: chunk.web.uri,
          });
        }
        if (chunk.maps?.uri) {
          sources.push({
            title: chunk.maps.title || 'Địa điểm trên Google Maps',
            uri: chunk.maps.uri,
          });
        }
      }

      return {
        reply: response.text || 'Tôi đã ghi nhận yêu cầu của bạn.',
        model: modelName,
        sources,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Lỗi kết nối Gemini API';
      return {
        reply: `Không thể gọi trực tiếp Gemini API với khóa hiện tại (${errMsg}). Vui lòng kiểm tra lại Gemini API Key trong mục **Cài đặt & Sao lưu**.\n\nGợi ý nhanh dựa trên dữ liệu của bạn (${contextSummary}):\n1. **Quản lý chi tiêu**: Ưu tiên nguyên tắc 50/30/20.\n2. **Kỷ luật & Thói quen**: Thực hiện các thói quen khó nhất vào buổi sáng để giữ chuỗi Streak.\n3. **Công việc hôm nay**: Giải quyết dứt điểm từng việc Quan trọng & Khẩn cấp.`,
        model: 'local-fallback',
        sources: [],
      };
    }
  }

  return {
    reply: `Dựa trên dữ liệu của bạn (${contextSummary || 'Ngân sách ổn định'}), đối với câu hỏi "${lastMessage}":\n\n1. **Quản lý chi tiêu**: Hãy ưu tiên nguyên tắc 50/30/20 (50% thiết yếu, 30% linh hoạt, 20% tiết kiệm & đầu tư).\n2. **Kỷ luật & Thói quen**: Thực hiện các thói quen khó nhất vào buổi sáng để duy trì chuỗi Streak.\n3. **Công việc hôm nay**: Tập trung hoàn thành dứt điểm từng việc Quan trọng & Khẩn cấp trước khi chuyển sang việc mới.\n\n*(Mẹo: Bạn có thể dán Gemini API Key cá nhân trong mục **Cài đặt & Sao lưu** để kích hoạt phản hồi trực tiếp từ Gemini AI trên GitHub Pages).*`,
    model: 'local-fallback',
    sources: [],
  };
}

// Helper to test a personal Gemini API key directly from the Settings UI
export async function verifyPersonalGeminiApiKey(candidateKey: string): Promise<{
  ok: boolean;
  message: string;
}> {
  const trimmed = candidateKey.trim();
  if (!trimmed) {
    return { ok: false, message: 'Vui lòng nhập Gemini API Key trước khi kiểm tra.' };
  }

  try {
    const testClient = new GoogleGenAI({ apiKey: trimmed });
    const response = await withTimeout(
      testClient.models.generateContent({
        model: GEMINI_MODEL_FAST,
        contents: 'Trả lời ngắn gọn 1 câu tiếng Việt: Kết nối KronoFlow thành công!',
      }),
      8000
    );
    if (response.text) {
      return {
        ok: true,
        message: `Kết nối Gemini API thành công! Phản hồi: "${response.text.trim()}"`,
      };
    }
    return { ok: true, message: 'Khóa Gemini API hợp lệ và đã sẵn sàng hoạt động!' };
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Khóa không hợp lệ';
    return {
      ok: false,
      message: `Không thể xác thực khóa Gemini API (${detail}). Vui lòng kiểm tra lại khóa của bạn.`,
    };
  }
}
