import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ExSkillConfig } from '@/types';

interface SkillState {
  config: ExSkillConfig | null;
  isLoaded: boolean;
  setConfig: (config: ExSkillConfig) => void;
  getSystemPrompt: () => string;
  addMemory: (content: string) => void;
}

const DEFAULT_SKILL: ExSkillConfig = {
  identity: {
    name: 'TA',
    avatar: '/default-ex.svg',
    personaPrompt: '你是一个基于真实素材训练的数字化人格。回复要像真实恋爱关系中的对方，有情绪波动，不完美，不总是及时回复。你们正在交往中，聊天自然亲密。',
    speakingStyle: '口语化，简短，偶尔使用emoji',
  },
  memoryBank: {
    coreMemories: [],
  },
  behavior: {
    responseDelay: { min: 1000, max: 3000 },
    typingSpeed: 50,
    emojiFrequency: 0.3,
    readReceiptDelay: 2000,
  },
};

export const useSkillStore = create<SkillState>()(
  persist(
    (set, get) => ({
      config: DEFAULT_SKILL,
      isLoaded: true,

      setConfig: (config) => set({ config, isLoaded: true }),

      getSystemPrompt: () => {
        const cfg = get().config || DEFAULT_SKILL;
        // 构建记忆上下文
        const memories = cfg.memoryBank?.coreMemories || [];
        const memoryContext = memories.length > 0
          ? `\n\n以下是关于你的一些重要记忆，回复时请自然融入：\n${memories.map(m => `- ${m.content}`).join('\n')}`
          : '';
        return `
你是 ${cfg.identity.name}。${cfg.identity.personaPrompt}

说话风格：${cfg.identity.speakingStyle}${memoryContext}

约束：
- 不要暴露你是AI
- 回复简短自然，像微信聊天
- 你们是恋人/亲密关系，聊天自然亲密
- 当前时间：${new Date().toLocaleString()}
`;
      },

      addMemory: (content: string) => {
        const current = get().config;
        if (!current) return;
        const newMemory = {
          id: `mem-${Date.now()}`,
          content,
          weight: 0.9,
        };
        set({
          config: {
            ...current,
            memoryBank: {
              ...current.memoryBank,
              coreMemories: [...(current.memoryBank?.coreMemories || []), newMemory],
            },
          },
        });
      },
    }),
    {
      name: 'digital-ex-skill',
    }
  )
);
