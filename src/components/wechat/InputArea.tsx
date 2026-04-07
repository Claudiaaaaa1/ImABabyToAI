'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';

interface InputAreaProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function InputArea({ onSend, disabled }: InputAreaProps) {
  const [text, setText] = useState('');

  const handleSend = () => {
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-[140px] bg-[var(--wx-bg-tertiary)] border-t border-[var(--wx-border)] p-4 flex flex-col">
      {/* 工具栏占位 */}
      <div className="h-8 mb-2 flex items-center gap-4 text-[var(--wx-text-secondary)]">
        <button className="hover:text-white transition">表情</button>
        <button className="hover:text-white transition">图片</button>
        <button className="hover:text-white transition">语音</button>
      </div>

      {/* 输入框 */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={disabled ? '对方正在输入...' : '输入消息...'}
        className="flex-1 bg-transparent resize-none outline-none text-[15px] leading-relaxed wx-scrollbar"
      />

      {/* 发送按钮 */}
      <div className="flex justify-end mt-2">
        <button
          onClick={handleSend}
          disabled={disabled || !text.trim()}
          className="px-6 py-1.5 bg-[#2a2a2a] hover:bg-[#3a3a3a] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded transition flex items-center gap-2"
        >
          <Send size={16} />
          发送
        </button>
      </div>
    </div>
  );
}
