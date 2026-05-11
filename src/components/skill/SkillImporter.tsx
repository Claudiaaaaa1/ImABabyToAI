'use client';

import { useState } from 'react';
import { useSkillStore } from '@/stores/useSkillStore';
import { ExSkillConfig } from '@/types';

export function SkillImporter() {
  const [isOpen, setIsOpen] = useState(false);
  const [rawText, setRawText] = useState('');
  const { setConfig } = useSkillStore();

  const handleImport = () => {
    // 解析前任.skill格式（简化版）
    const lines = rawText.split('\n');
    const name = lines.find(l => l.startsWith('名字:'))?.replace('名字:', '').trim() || '前任';
    const persona = lines.find(l => l.startsWith('人格:'))?.replace('人格:', '').trim() || '';

    const config: ExSkillConfig = {
      identity: {
        name,
        avatar: '/default-ex.png',
        personaPrompt: persona,
        speakingStyle: '基于聊天记录自然风格',
      },
      memoryBank: { coreMemories: [] },
      behavior: {
        responseDelay: { min: 200, max: 1500 },
        typingSpeed: 50,
        emojiFrequency: 0.3,
        readReceiptDelay: 2000,
      },
    };

    setConfig(config);
    setIsOpen(false);
    setRawText('');
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-4 right-4 px-4 py-2 bg-[var(--wx-bg-secondary)] border border-[var(--wx-border)] rounded text-sm hover:bg-[var(--wx-bg-tertiary)] transition"
      >
        导入 Skill
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[var(--wx-bg-secondary)] w-[600px] max-h-[80vh] rounded-lg border border-[var(--wx-border)] flex flex-col">
        <div className="p-4 border-b border-[var(--wx-border)]">
          <h2 className="text-lg font-medium">导入前任.skill</h2>
        </div>
        <div className="p-4 flex-1">
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="粘贴前任.skill内容..."
            className="w-full h-64 bg-[var(--wx-bg-tertiary)] rounded p-3 resize-none outline-none text-sm wx-scrollbar"
          />
        </div>
        <div className="p-4 border-t border-[var(--wx-border)] flex justify-end gap-3">
          <button
            onClick={() => setIsOpen(false)}
            className="px-4 py-2 text-[var(--wx-text-secondary)] hover:text-white transition"
          >
            取消
          </button>
          <button
            onClick={handleImport}
            disabled={!rawText.trim()}
            className="px-4 py-2 bg-[var(--wx-bubble-me)] text-black rounded disabled:opacity-50"
          >
            导入
          </button>
        </div>
      </div>
    </div>
  );
}
