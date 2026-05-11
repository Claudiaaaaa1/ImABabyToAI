'use client';

import { useState, useRef } from 'react';
import { Send } from 'lucide-react';

interface InputAreaProps {
  onSend: (text: string, imageUrl?: string) => void;
  disabled?: boolean;
}

export function InputArea({ onSend, disabled }: InputAreaProps) {
  const [text, setText] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    if (disabled) return;
    if (!text.trim() && !imagePreview) return;
    onSend(text.trim(), imagePreview || undefined);
    setText('');
    setImagePreview(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) readImageFile(file);
        return;
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) readImageFile(file);
    e.target.value = '';
  };

  const readImageFile = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      alert('图片大小不能超过 5MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const canSend = !disabled && (text.trim() || !!imagePreview);

  return (
    <div className="bg-[var(--wx-bg-tertiary)] border-t border-[var(--wx-border)] p-4 flex flex-col">
      {/* 工具栏 */}
      <div className="h-8 mb-2 flex items-center gap-4 text-[var(--wx-text-secondary)]">
        <button className="hover:text-white transition">表情</button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="hover:text-white transition"
        >
          图片
        </button>
        <button className="hover:text-white transition">语音</button>
      </div>

      {/* 图片预览 */}
      {imagePreview && (
        <div className="relative mb-2 inline-block">
          <img
            src={imagePreview}
            alt="预览"
            className="h-24 rounded-lg border border-[var(--wx-border)] object-cover"
          />
          <button
            onClick={() => setImagePreview(null)}
            className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600"
          >
            ×
          </button>
        </div>
      )}

      {/* 输入框 */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        disabled={disabled}
        placeholder={disabled ? '对方正在输入...' : '输入消息...（可直接粘贴图片）'}
        className="flex-1 min-h-[60px] bg-transparent resize-none outline-none text-[15px] leading-relaxed wx-scrollbar"
      />

      {/* 发送按钮 */}
      <div className="flex justify-end mt-2">
        <button
          onClick={handleSend}
          disabled={!canSend}
          className="px-6 py-1.5 bg-[#2a2a2a] hover:bg-[#3a3a3a] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded transition flex items-center gap-2"
        >
          <Send size={16} />
          发送
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}
