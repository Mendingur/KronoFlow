import React, { useState } from 'react';
import {
  Send,
  Brain,
  Globe,
  MapPin,
  Zap,
  MessageSquare,
  ExternalLink,
} from 'lucide-react';
import { ChatMessage } from '../types';
import { sendChatMessageClientSide } from '../services/geminiClient';

interface AiChatViewProps {
  contextSummary: string;
}

export const AiChatView: React.FC<AiChatViewProps> = ({ contextSummary }) => {
  const [mode, setMode] = useState<'thinking' | 'general' | 'fast' | 'search' | 'maps'>('thinking');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-welcome',
      role: 'assistant',
      content:
        'Xin chào! Tôi là Trợ lý AI Đa Năng của KronoFlow. Bạn có thể chọn chế độ **Tư duy sâu** để lập kế hoạch tài chính dài hạn, **Tìm kiếm Google** để tra cứu giá cả thị trường, hoặc **Google Maps** để tìm địa điểm học tập, làm việc và mua sắm tiết kiệm quanh bạn.',
      timestamp: '08:00',
      mode: 'thinking',
    },
  ]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      mode,
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);

    try {
      const data = await sendChatMessageClientSide(
        nextMessages.map((m) => ({ role: m.role, content: m.content })),
        mode,
        contextSummary
      );
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: data.reply || 'Tôi đã xử lý yêu cầu của bạn.',
          timestamp: new Date().toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          mode,
          sources: data.sources || [],
        },
      ]);
    } catch (err) {
      console.error('Chat error:', err);
    } finally {
      setLoading(false);
    }
  };

  const quickPrompts = [
    'Lập kế hoạch trả nợ và tiết kiệm 50 triệu VNĐ trong 6 tháng tới',
    'Tìm quán cà phê yên tĩnh học bài hoặc làm việc tại Quận 1, TP.HCM',
    'Tra cứu lãi suất tiết kiệm ngân hàng kỳ hạn 6 tháng mới nhất hôm nay',
    'Thiết kế lịch trình rèn luyện kỷ luật buổi sáng từ 5h30 đến 7h30',
  ];

  return (
    <div className="rounded-2xl liquid-glass flex flex-col h-[680px]">
      {/* Header & Mode Selector */}
      <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            Trợ lý AI Cố vấn Tài chính & Kỷ luật Đa Năng
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Hỗ trợ hội thoại nhiều lượt (Multi-turn Chat), Tư duy sâu, Google Search & Google Maps Grounding
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setMode('thinking')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              mode === 'thinking'
                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Brain className="h-3.5 w-3.5" />
            Tư duy sâu (Argon High)
          </button>

          <button
            type="button"
            onClick={() => setMode('search')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              mode === 'search'
                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Globe className="h-3.5 w-3.5" />
            Google Search
          </button>

          <button
            type="button"
            onClick={() => setMode('maps')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              mode === 'maps'
                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <MapPin className="h-3.5 w-3.5" />
            Google Maps
          </button>

          <button
            type="button"
            onClick={() => setMode('fast')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              mode === 'fast'
                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Zap className="h-3.5 w-3.5" />
            Phản hồi nhanh (Flash Lite)
          </button>
        </div>
      </div>

      {/* Scrollable Chat Thread */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-2xl rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'claude-liquid-btn text-white'
                  : 'bg-white/75 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60 text-slate-800 dark:text-slate-200'
              }`}
            >
              <div className="whitespace-pre-line">{msg.content}</div>
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-700 space-y-1">
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Nguồn trích dẫn thực tế (Google Grounding):
                  </div>
                  {msg.sources.map((src, i) => (
                    <a
                      key={i}
                      href={src.uri}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 hover:underline truncate"
                    >
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      <span className="truncate">{src.title}</span>
                    </a>
                  ))}
                </div>
              )}
              <div
                className={`mt-1.5 text-[11px] font-mono ${
                  msg.role === 'user' ? 'text-slate-300' : 'text-slate-400'
                }`}
              >
                {msg.timestamp}
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-slate-100 dark:bg-slate-800 px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
              AI đang suy nghĩ và tổng hợp câu trả lời tiếng Việt...
            </div>
          </div>
        )}
      </div>

      {/* Quick Prompts & Input Form */}
      <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
        <div className="flex flex-wrap gap-2 mb-3">
          {quickPrompts.map((q, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setInput(q)}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs text-slate-600 dark:text-slate-300 hover:border-emerald-500 transition-colors truncate max-w-xs"
            >
              {q}
            </button>
          ))}
        </div>

        <form onSubmit={handleSend} className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Nhập câu hỏi về chi tiêu, kế hoạch làm việc, tìm kiếm địa điểm..."
            aria-label="Nhập tin nhắn trò chuyện với AI"
            className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl claude-liquid-btn px-5 py-2.5 text-xs font-semibold text-white disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Send className="h-4 w-4" />
            Gửi tin nhắn
          </button>
        </form>
      </div>
    </div>
  );
};
