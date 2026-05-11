// ============================================
// SPEC-004-1: 微信消息结构
// ============================================
export interface WeChatMessage {
  id: string;
  localId: string;
  sender: {
    id: 'me' | 'ex' | 'system';
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
    /** 记忆抽取候选(2C):AI 在 done 后抽取的待用户确认的记忆条目 */
    memoryCandidates?: string[];
  };
}

/** 真实聊天对(用于 few-shot 注入) */
export interface ExQAPair {
  user: string;
  ex: string;
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
  /** 聊天记录风格档案（可选） */
  styleProfile?: ChatStyleProfile;
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
  /** Few-shot 真实聊天样例(3A):前端按 query 检索后注入,作为 system prompt 中的"必须模仿的样例" */
  fewShotPairs?: ExQAPair[];
}

// ============================================
// SPEC-004-4: 聊天记录风格档案
// ============================================
export interface ChatStyleProfile {
  /** 高频词汇和口头禅 */
  vocabulary: string[];
  /** 断句模式描述 */
  sentencePattern: string;
  /** Emoji/表情使用习惯 */
  emojiStyle: string;
  /** 回复长度特征 */
  responseLength: string;
  /** 情感基调 */
  emotionalTone: string;
  /** 标志性短语/口头禅 */
  signaturePhrases: string[];
  /** 话题偏好 */
  topicPreferences: string[];
  /** 回复延迟习惯（秒） */
  replyDelaySeconds: number;
  /** 是否爱用反问句 */
  likesRhetoricalQuestions: boolean;
  /** 是否爱用语气词 */
  likesModalParticles: boolean;
  /** 标点使用习惯 */
  punctuationStyle: string;
}

// ============================================
// SPEC-004-5: 记忆库类型
// ============================================
export interface MemoryGroup {
  id: string;
  profileId: string;
  name: string;
  type: 'preset' | 'custom';
  presetKey: 'favorites' | 'habits' | 'events' | 'embarrassing' | 'other' | null;
  sortOrder: number;
}

export interface Memory {
  id: string;
  profileId: string;
  groupId: string;
  content: string;
  source: 'ai_extract' | 'hash_command' | 'manual';
  weight: number;
  createdAt: number;
  updatedAt: number;
}

// ============================================
// SPEC-004-6: 角色档案（IndexedDB 主模型）
// ============================================
export interface ExProfile {
  id: string;
  name: string;
  avatar: string;
  createdAt: number;
  lastChatAt: number;
  identity: ExSkillConfig['identity'];
  styleProfile?: ChatStyleProfile;
  behavior: ExSkillConfig['behavior'];
  memoryBank: ExSkillConfig['memoryBank'];
  /** 从聊天记录中提取的前任原话(3A 检索池) */
  exSamples?: string[];
  /** 从聊天记录提取的对话对(3A 主要检索池,优于单条样本) */
  exQAPairs?: ExQAPair[];
}

export type ChatStreamEvent =
  | { type: 'status'; data: { state: 'typing'; duration: number } }
  | { type: 'delta'; data: { content: string; isFirst: boolean } }
  | { type: 'emotion'; data: { tag: string } }
  | { type: 'done'; data: { fullContent: string } };
