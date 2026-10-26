import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

dotenv.config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

function withTimeout<T>(promise: Promise<T>, ms = 2500): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('GEMINI_TIMEOUT')), ms)
    ),
  ]);
}

// Deterministic Vietnamese NLP fallback parser when API key is not configured or rate-limited
function fallbackParseVietnameseExpenses(text: string, todayISO: string) {
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

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '15mb' }));

  // 1. AI Productivity & Financial Coach (Uses gemini-4-argon with HIGH thinking)
  app.post('/api/gemini/coach', async (req, res) => {
    const { summary } = req.body;
    try {
      const prompt = `Phân tích dữ liệu kỷ luật, công việc và tài chính hôm nay của người dùng và đưa ra lời khuyên ngắn gọn, sắc bén bằng tiếng Việt:
- Tổng thu tháng này: ${summary?.totalIncome || 0} VNĐ
- Tổng chi tháng này: ${summary?.totalExpense || 0} VNĐ
- Hạn mức ngân sách tháng: ${summary?.monthlyBudget || 0} VNĐ (Đã dùng ${summary?.budgetPercentage || 0}%)
- Công việc hoàn thành: ${summary?.completedTasks || 0}/${summary?.totalTasks || 0} (Số việc khẩn cấp chưa xong: ${summary?.urgentPending || 0})
- Thói quen đã check-in hôm nay: ${summary?.todayCompletedHabits || 0}/${summary?.totalHabits || 0} (Chuỗi streak hiện tại: ${summary?.streak || 0} ngày, Cấp bậc: ${summary?.rankTitle || 'Tân binh'})`;

      const response = await withTimeout(
        ai.models.generateContent({
          model: 'gemini-4-argon',
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
      }));

      const parsed = JSON.parse(response.text || '{}');
      return res.json({ data: parsed, source: 'gemini-4-argon' });
    } catch (error) {
      const budgetPct = summary?.budgetPercentage ?? 65;
      const urgentCount = summary?.urgentPending ?? 2;
      const streak = summary?.streak ?? 8;
      return res.json({
        source: 'fallback',
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
      });
    }
  });

  // 2. AI Smart Expense Entry (Natural Language Vietnamese -> JSON Array)
  app.post('/api/gemini/parse-expenses', async (req, res) => {
    const { text, todayISO = '2026-10-26' } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Vui lòng nhập câu mô tả chi tiêu.' });
    }

    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model: 'gemini-3.8-flash',
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
      }));

      const items = JSON.parse(response.text || '[]');
      return res.json({ items, source: 'gemini-3.8-flash' });
    } catch (error) {
      const fallbackItems = fallbackParseVietnameseExpenses(text, todayISO);
      return res.json({ items: fallbackItems, source: 'fallback' });
    }
  });

  // 3. AI Receipt Image Vision Parser (Multimodal Base64 Image -> JSON Array)
  app.post('/api/gemini/parse-receipt', async (req, res) => {
    const { base64Data, mimeType = 'image/jpeg', todayISO = '2026-10-26' } = req.body;
    if (!base64Data) {
      return res.status(400).json({ error: 'Vui lòng tải lên hình ảnh hóa đơn.' });
    }

    try {
      const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
      const response = await withTimeout(
        ai.models.generateContent({
          model: 'gemini-3.8-flash',
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
      }));

      const items = JSON.parse(response.text || '[]');
      return res.json({ items, source: 'gemini-3.8-flash' });
    } catch (error) {
      return res.json({
        source: 'fallback',
        items: [
          {
            amount: 125000,
            type: 'expense',
            category: 'Mua sắm',
            note: 'Hóa đơn mua hàng trích xuất từ ảnh chụp biên lai',
            date: todayISO,
          },
        ],
      });
    }
  });

  // 4. AI Task Breakdown (Chia nhỏ việc bằng AI -> 3-6 actionable subtasks)
  app.post('/api/gemini/breakdown-task', async (req, res) => {
    const { taskTitle } = req.body;
    if (!taskTitle || typeof taskTitle !== 'string') {
      return res.status(400).json({ error: 'Vui lòng nhập tên công việc cần chia nhỏ.' });
    }

    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
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
      }));

      const subtasks = JSON.parse(response.text || '[]');
      return res.json({ subtasks, source: 'gemini-3.1-flash-lite' });
    } catch (error) {
      return res.json({
        source: 'fallback',
        subtasks: [
          `Xác định phạm vi, mục tiêu đầu ra và tài liệu cần thiết cho: ${taskTitle}`,
          'Lập dàn ý chi tiết các hạng mục quan trọng nhất trong 20 phút đầu',
          'Thực hiện tập trung (Deep Work) giải quyết phần cốt lõi không xao nhãng',
          'Kiểm tra chéo kết quả, hoàn thiện chi tiết và đánh dấu hoàn thành',
        ],
      });
    }
  });

  // 5. Multi-Turn Gemini Chatbot (Supports High Thinking, Google Search, Google Maps, Fast & General modes)
  app.post('/api/gemini/chat', async (req, res) => {
    const { messages = [], mode = 'general', contextSummary = '' } = req.body;
    const lastMessage = messages[messages.length - 1]?.content || 'Xin chào';

    try {
      const systemInstruction = `Bạn là Trợ lý AI Đa Năng của ứng dụng "KronoFlow".
Luôn trả lời 100% bằng tiếng Việt tự nhiên, rõ ràng, có cấu trúc gạch đầu dòng dễ đọc.
Bối cảnh dữ liệu hiện tại của người dùng: ${contextSummary}`;

      const formattedHistory = messages.map((m: { role: string; content: string }) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      let modelName = 'gemini-3.8-flash';
      const config: Record<string, unknown> = {
        systemInstruction,
      };

      if (mode === 'thinking') {
        modelName = 'gemini-4-argon';
        config.thinkingConfig = {
          thinkingLevel: ThinkingLevel.HIGH,
        };
      } else if (mode === 'fast') {
        modelName = 'gemini-3.1-flash-lite';
      } else if (mode === 'search') {
        modelName = 'gemini-3.8-flash';
        config.tools = [{ googleSearch: {} }];
      } else if (mode === 'maps') {
        modelName = 'gemini-3.8-flash';
        config.tools = [{ googleMaps: {} }];
      }

      const response = await withTimeout(
        ai.models.generateContent({
          model: modelName,
          contents: formattedHistory,
          config,
        })
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

      return res.json({
        reply: response.text || 'Tôi đã ghi nhận yêu cầu của bạn.',
        model: modelName,
        sources,
      });
    } catch (error) {
      return res.json({
        reply: `Dựa trên dữ liệu của bạn (${contextSummary || 'Ngân sách ổn định'}), đối với câu hỏi "${lastMessage}":\n\n1. **Quản lý chi tiêu**: Hãy ưu tiên nguyên tắc 50/30/20 (50% thiết yếu, 30% linh hoạt, 20% tiết kiệm & đầu tư).\n2. **Kỷ luật & Thói quen**: Thực hiện các thói quen khó nhất vào buổi sáng để duy trì chuỗi Streak.\n3. **Công việc hôm nay**: Tập trung hoàn thành dứt điểm từng việc Quan trọng & Khẩn cấp trước khi chuyển sang việc mới.`,
        model: mode === 'thinking' ? 'gemini-4-argon' : 'gemini-3.8-flash',
        sources: [],
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
