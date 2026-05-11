'use client';

import { create } from 'zustand';
import { ExProfile, ExSkillConfig } from '@/types';
import {
  getAllProfiles,
  createProfile as dbCreateProfile,
  updateProfile as dbUpdateProfile,
  deleteProfile as dbDeleteProfile,
  getDefaultGroups,
  createMemoryGroup,
  getMemoryGroupsByProfile,
  getMessagesByProfile,
  addMessage as dbAddMessage,
  createMemory,
} from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

interface ProfileState {
  profiles: ExProfile[];
  currentProfileId: string | null;
  isLoading: boolean;

  // Actions
  init: () => Promise<void>;
  createProfile: (
    config: ExSkillConfig,
    extras?: Partial<Pick<ExProfile, 'exSamples' | 'exQAPairs'>>
  ) => Promise<string>;
  switchProfile: (id: string) => Promise<void>;
  updateProfile: (id: string, updates: Partial<ExProfile>) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  getCurrentProfile: () => ExProfile | null;
  getProfileConfig: () => ExSkillConfig | null;
  addMemory: (content: string) => Promise<void>;
  refreshProfiles: () => Promise<void>;
}

export const useProfileStore = create<ProfileState>()((set, get) => ({
  profiles: [],
  currentProfileId: null,
  isLoading: true,

  init: async () => {
    const profiles = await getAllProfiles();
    // 按最后聊天时间排序，取最近活跃的角色
    const sorted = profiles.sort((a, b) => b.lastChatAt - a.lastChatAt);
    set({
      profiles: sorted,
      currentProfileId: sorted[0]?.id || null,
      isLoading: false,
    });
  },

  createProfile: async (config, extras) => {
    const profileId = uuidv4();
    const now = Date.now();

    const profile: ExProfile = {
      id: profileId,
      name: config.identity.name,
      avatar: config.identity.avatar,
      createdAt: now,
      lastChatAt: now,
      identity: config.identity,
      styleProfile: config.styleProfile,
      behavior: config.behavior,
      memoryBank: config.memoryBank,
      exSamples: extras?.exSamples,
      exQAPairs: extras?.exQAPairs,
    };

    await dbCreateProfile(profile);

    // 创建默认记忆分组
    const defaultGroups = getDefaultGroups(profileId);
    for (const group of defaultGroups) {
      await createMemoryGroup(group);
    }

    // 迁移旧版 memoryBank 中的 coreMemories 到新的 Memory 表
    if (config.memoryBank?.coreMemories?.length) {
      const otherGroup = defaultGroups.find((g) => g.presetKey === 'other')!;
      for (const mem of config.memoryBank.coreMemories) {
        await createMemory({
          id: mem.id || `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          profileId,
          groupId: otherGroup.id,
          content: mem.content,
          source: 'ai_extract',
          weight: mem.weight || 0.8,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    set((state) => ({
      profiles: [profile, ...state.profiles],
      currentProfileId: profileId,
    }));

    return profileId;
  },

  switchProfile: async (id) => {
    set({ currentProfileId: id });
  },

  updateProfile: async (id, updates) => {
    const updated = await dbUpdateProfile(id, updates);
    set((state) => ({
      profiles: state.profiles.map((p) => (p.id === id ? updated : p)),
    }));
  },

  deleteProfile: async (id) => {
    await dbDeleteProfile(id);
    set((state) => {
      const newProfiles = state.profiles.filter((p) => p.id !== id);
      return {
        profiles: newProfiles,
        currentProfileId:
          state.currentProfileId === id
            ? newProfiles[0]?.id || null
            : state.currentProfileId,
      };
    });
  },

  getCurrentProfile: () => {
    const { profiles, currentProfileId } = get();
    return profiles.find((p) => p.id === currentProfileId) || null;
  },

  getProfileConfig: () => {
    const profile = get().getCurrentProfile();
    if (!profile) return null;
    return {
      identity: profile.identity,
      memoryBank: profile.memoryBank,
      behavior: profile.behavior,
      styleProfile: profile.styleProfile,
    };
  },

  addMemory: async (content) => {
    const profile = get().getCurrentProfile();
    if (!profile) return;

    const groups = await getMemoryGroupsByProfile(profile.id);
    const otherGroup = groups.find((g) => g.presetKey === 'other') || groups[0];
    if (!otherGroup) return;

    await createMemory({
      id: `mem-${Date.now()}`,
      profileId: profile.id,
      groupId: otherGroup.id,
      content,
      source: 'hash_command',
      weight: 0.9,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // 同时更新 memoryBank 以保持向后兼容
    const newMemory = {
      id: `mem-${Date.now()}`,
      content,
      weight: 0.9,
    };
    await dbUpdateProfile(profile.id, {
      memoryBank: {
        ...profile.memoryBank,
        coreMemories: [...(profile.memoryBank?.coreMemories || []), newMemory],
      },
    });

    set((state) => ({
      profiles: state.profiles.map((p) =>
        p.id === profile.id
          ? {
              ...p,
              memoryBank: {
                ...p.memoryBank,
                coreMemories: [...(p.memoryBank?.coreMemories || []), newMemory],
              },
            }
          : p
      ),
    }));
  },

  refreshProfiles: async () => {
    const profiles = await getAllProfiles();
    set({ profiles: profiles.sort((a, b) => b.lastChatAt - a.lastChatAt) });
  },
}));
