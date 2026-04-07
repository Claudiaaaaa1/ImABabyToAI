import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { WeChatMessage } from '@/types';

interface ChatState {
  messages: WeChatMessage[];
  isTyping: boolean;
  currentSessionId: string;

  // Actions
  addMessage: (msg: WeChatMessage) => void;
  updateMessage: (id: string, updates: Partial<WeChatMessage>) => void;
  appendToMessage: (id: string, text: string) => void;
  setIsTyping: (value: boolean) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      messages: [],
      isTyping: false,
      currentSessionId: 'default-ex',

      addMessage: (msg) => set((state) => ({
        messages: [...state.messages, msg]
      })),

      updateMessage: (id, updates) => set((state) => ({
        messages: state.messages.map(m =>
          m.id === id ? { ...m, ...updates } : m
        )
      })),

      appendToMessage: (id, text) => set((state) => ({
        messages: state.messages.map(m =>
          m.id === id && m.content.text !== undefined
            ? { ...m, content: { ...m.content, text: m.content.text + text } }
            : m
        )
      })),

      setIsTyping: (value) => set({ isTyping: value }),
      clearMessages: () => set({ messages: [] }),
    }),
    {
      name: 'digital-ex-chat',
      partialize: (state) => ({
        messages: state.messages,
        currentSessionId: state.currentSessionId
      }),
    }
  )
);
