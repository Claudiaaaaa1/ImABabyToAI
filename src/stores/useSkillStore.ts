import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ExSkillConfig } from '@/types';

interface SkillState {
  config: ExSkillConfig | null;
  isLoaded: boolean;
  setConfig: (config: ExSkillConfig) => void;
  getSystemPrompt: () => string;
}

const DEFAULT_SKILL: ExSkillConfig = {
  identity: {
    name: '前任',
    avatar: '/default-ex.svg',
    personaPrompt: '你是一个基于聊天记录训练的数字人格。回复要像真实的前任，有情绪波动，不完美，不总是及时回复。',
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
        return `
你是 ${cfg.identity.name}。${cfg.identity.personaPrompt}

说话风格：${cfg.identity.speakingStyle}

约束：
- 不要暴露你是AI
- 回复简短自然，像微信聊天
- 当前时间：${new Date().toLocaleString()}
`;
      },
    }),
    {
      name: 'digital-ex-skill',
    }
  )
);
