// ============================================
// SPEC-004-1: 微信消息结构
// ============================================
export interface WeChatMessage {
  id: string;
  localId: string;
  sender: {
    id: 'me' | 'ex';
    name: string;
    avatar: string;
  };
  content: {
    type: 'text' | 'image' | 'voice';
    text?: string;
    imageUrl?: string;
    voiceDuration?: number;
  };
  meta: {
    timestamp: number;
    isRead: boolean;
    isRecalled: boolean;
    sendStatus: 'sending' | 'sent' | 'failed';
  };
  context?: {
    isStreaming?: boolean;
    emotionTag?: string;
  };
}

// ============================================
// SPEC-004-2: Skill 配置结构
// ============================================
export interface ExSkillConfig {
  identity: {
    name: string;
    avatar: string;
    personaPrompt: string;
    speakingStyle: string;
  };
  memoryBank: {
    coreMemories: Array<{
      id: string;
      content: string;
      weight: number;
    }>;
  };
  behavior: {
    responseDelay: { min: number; max: number };
    typingSpeed: number;
    emojiFrequency: number;
    readReceiptDelay: number;
  };
}

// ============================================
// SPEC-004-3: API 请求/响应类型
// ============================================
export interface ChatRequest {
  messages: WeChatMessage[];
  skillConfig: ExSkillConfig;
  context: {
    timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
    conversationTurn: number;
  };
}

export type ChatStreamEvent =
  | { type: 'status'; data: { state: 'typing'; duration: number } }
  | { type: 'delta'; data: { content: string; isFirst: boolean } }
  | { type: 'emotion'; data: { tag: string } }
  | { type: 'done'; data: { fullContent: string } };
