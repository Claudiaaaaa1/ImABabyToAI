import { v4 as uuidv4 } from 'uuid';
import { ExProfile, ExSkillConfig, MemoryGroup, Memory } from '@/types';
import {
  getDB,
  createProfile,
  getAllProfiles,
  createMemoryGroup,
  getDefaultGroups,
  createMemory,
  addMessage,
} from './db';

const MIGRATION_KEY = 'digital-ex-migrated-v1';

interface OldChatState {
  messages: Array<{
    id: string;
    localId: string;
    sender: { id: string; name: string; avatar: string };
    content: { type: string; text?: string };
    meta: { timestamp: number; isRead: boolean; isRecalled: boolean; sendStatus: string };
  }>;
  currentSessionId: string;
}

interface OldSkillState {
  config: ExSkillConfig | null;
}

/**
 * 将旧版 Zustand persist (localStorage) 数据迁移到 IndexedDB
 * 只执行一次，完成后在 localStorage 标记
 */
export async function migrateFromLocalStorage(): Promise<void> {
  // 检查是否已迁移
  if (typeof window !== 'undefined' && localStorage.getItem(MIGRATION_KEY)) {
    console.log('[Migration] Already migrated, skipping.');
    return;
  }

  // 检查 IndexedDB 是否已有数据
  await getDB();
  const existingProfiles = await getAllProfiles();
  if (existingProfiles.length > 0) {
    console.log('[Migration] IndexedDB already has profiles, marking as migrated.');
    localStorage.setItem(MIGRATION_KEY, 'true');
    return;
  }

  // 读取旧数据
  const chatData = readLocalStorageItem<OldChatState>('digital-ex-chat');
  const skillData = readLocalStorageItem<OldSkillState>('digital-ex-skill');

  if (!skillData?.config) {
    console.log('[Migration] No old skill config found, nothing to migrate.');
    localStorage.setItem(MIGRATION_KEY, 'true');
    return;
  }

  console.log('[Migration] Starting migration from localStorage...');

  try {
    const config = skillData.config;
    const profileId = uuidv4();

    // 1. 创建角色档案
    const profile: ExProfile = {
      id: profileId,
      name: config.identity.name,
      avatar: config.identity.avatar,
      createdAt: Date.now(),
      lastChatAt: Date.now(),
      identity: config.identity,
      styleProfile: config.styleProfile,
      behavior: config.behavior,
      memoryBank: config.memoryBank,
    };

    await createProfile(profile);

    // 2. 创建默认记忆分组
    const defaultGroups = getDefaultGroups(profileId);
    for (const group of defaultGroups) {
      await createMemoryGroup(group);
    }

    // 3. 迁移旧记忆（coreMemories → 新的 Memory 表，放入「其他」分组）
    const otherGroup = defaultGroups.find((g) => g.presetKey === 'other')!;
    if (config.memoryBank?.coreMemories?.length) {
      for (const mem of config.memoryBank.coreMemories) {
        const memory: Memory = {
          id: mem.id || `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          profileId,
          groupId: otherGroup.id,
          content: mem.content,
          source: 'ai_extract',
          weight: mem.weight || 0.8,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await createMemory(memory);
      }
    }

    // 4. 迁移聊天记录
    if (chatData?.messages?.length) {
      for (const msg of chatData.messages) {
        await addMessage({
          id: msg.id,
          localId: msg.localId,
          profileId,
          sender: {
            id: msg.sender.id as 'me' | 'ex' | 'system',
            name: msg.sender.name,
            avatar: msg.sender.avatar,
          },
          content: {
            type: msg.content.type as 'text' | 'image' | 'voice',
            text: msg.content.text,
          },
          meta: {
            timestamp: msg.meta.timestamp,
            isRead: msg.meta.isRead,
            isRecalled: msg.meta.isRecalled,
            sendStatus: msg.meta.sendStatus as 'sending' | 'sent' | 'failed',
          },
        });
      }
    }

    // 5. 标记已迁移
    localStorage.setItem(MIGRATION_KEY, 'true');
    console.log('[Migration] Migration completed successfully.');
  } catch (err) {
    console.error('[Migration] Migration failed:', err);
    throw err;
  }
}

function readLocalStorageItem<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    // Zustand persist stores as JSON string
    const parsed = JSON.parse(raw);
    // zustand persist wraps state in { state: {...}, version: N }
    return parsed.state || parsed;
  } catch {
    return null;
  }
}

/**
 * 获取当前活跃角色 ID（从旧版 localStorage 中读取）
 */
export function getLegacyCurrentSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  const chatData = readLocalStorageItem<OldChatState>('digital-ex-chat');
  return chatData?.currentSessionId || null;
}
