'use client';

import { create } from 'zustand';
import { WeChatMessage } from '@/types';
import {
  getMessagesByProfile,
  addMessage as dbAddMessage,
  updateMessage as dbUpdateMessage,
  updateProfile as dbUpdateProfile,
} from '@/lib/db';

interface ChatState {
  messages: WeChatMessage[];
  isTyping: boolean;
  isLoaded: boolean;

  // Actions
  loadMessages: (profileId: string) => Promise<void>;
  addMessage: (profileId: string, msg: WeChatMessage) => Promise<void>;
  updateMessage: (profileId: string, id: string, updates: Partial<WeChatMessage>) => Promise<void>;
  appendToMessage: (profileId: string, id: string, text: string) => Promise<void>;
  setIsTyping: (value: boolean) => void;
  clearMessages: () => void;
  recallMessage: (profileId: string, id: string) => Promise<void>;
  updateLastChatAt: (profileId: string) => Promise<void>;
}

export const useChatStore = create<ChatState>()((set, get) => ({
  messages: [],
  isTyping: false,
  isLoaded: false,

  loadMessages: async (profileId: string) => {
    const dbMessages = await getMessagesByProfile(profileId);
    // 按时间排序
    const sorted = dbMessages
      .map((m) => ({
        id: m.id,
        localId: m.localId,
        sender: m.sender,
        content: m.content,
        meta: m.meta,
        context: m.context,
      }))
      .sort((a, b) => a.meta.timestamp - b.meta.timestamp);
    set({ messages: sorted, isLoaded: true });
  },

  addMessage: async (profileId: string, msg: WeChatMessage) => {
    // 写入 IndexedDB
    await dbAddMessage({ ...msg, profileId });
    // 更新内存
    set((state) => ({
      messages: [...state.messages, msg],
    }));
  },

  updateMessage: async (profileId: string, id: string, updates: Partial<WeChatMessage>) => {
    set((state) => {
      const updated = state.messages.map((m) =>
        m.id === id ? { ...m, ...updates } : m
      );
      return { messages: updated };
    });
    // 同步更新 IndexedDB
    await dbUpdateMessage(id, updates);
  },

  appendToMessage: async (profileId: string, id: string, text: string) => {
    set((state) => {
      const updated = state.messages.map((m) =>
        m.id === id && m.content.text !== undefined
          ? { ...m, content: { ...m.content, text: m.content.text + text } }
          : m
      );
      // 同步更新 IndexedDB（流式追加必须持久化，否则切页后消息会丢失/变短）
      const target = updated.find((m) => m.id === id);
      if (target) {
        dbUpdateMessage(id, { content: target.content }).catch(() => {});
      }
      return { messages: updated };
    });
  },

  setIsTyping: (value: boolean) => set({ isTyping: value }),

  clearMessages: () => set({ messages: [], isLoaded: false }),

  recallMessage: async (profileId: string, id: string) => {
    const target = get().messages.find((m) => m.id === id);
    if (!target) return;
    const updatedMeta = { ...target.meta, isRecalled: true };
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, meta: updatedMeta } : m
      ),
    }));
    await dbUpdateMessage(id, { meta: updatedMeta });
  },

  updateLastChatAt: async (profileId: string) => {
    await dbUpdateProfile(profileId, { lastChatAt: Date.now() });
  },
}));
