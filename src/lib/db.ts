import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { ExProfile, MemoryGroup, Memory, WeChatMessage } from '@/types';

const DB_NAME = 'digital-ex-db';
const DB_VERSION = 1;

interface DigitalExDB extends DBSchema {
  profiles: {
    key: string;
    value: ExProfile;
  };
  memoryGroups: {
    key: string;
    value: MemoryGroup;
    indexes: { byProfile: string };
  };
  memories: {
    key: string;
    value: Memory;
    indexes: { byProfile: string; byGroup: string };
  };
  messages: {
    key: string;
    value: WeChatMessage & { profileId: string };
    indexes: { byProfile: string };
  };
}

let dbPromise: Promise<IDBPDatabase<DigitalExDB>> | null = null;

export async function getDB(): Promise<IDBPDatabase<DigitalExDB>> {
  if (dbPromise) return dbPromise;

  dbPromise = openDB<DigitalExDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // profiles store
      if (!db.objectStoreNames.contains('profiles')) {
        db.createObjectStore('profiles', { keyPath: 'id' });
      }

      // memoryGroups store
      if (!db.objectStoreNames.contains('memoryGroups')) {
        const groupStore = db.createObjectStore('memoryGroups', { keyPath: 'id' });
        groupStore.createIndex('byProfile', 'profileId');
      }

      // memories store
      if (!db.objectStoreNames.contains('memories')) {
        const memStore = db.createObjectStore('memories', { keyPath: 'id' });
        memStore.createIndex('byProfile', 'profileId');
        memStore.createIndex('byGroup', 'groupId');
      }

      // messages store
      if (!db.objectStoreNames.contains('messages')) {
        const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
        msgStore.createIndex('byProfile', 'profileId');
      }
    },
  });

  return dbPromise;
}

// ============================================
// Profile CRUD
// ============================================
export async function createProfile(profile: ExProfile): Promise<void> {
  const db = await getDB();
  await db.put('profiles', profile);
}

export async function getProfile(id: string): Promise<ExProfile | undefined> {
  const db = await getDB();
  return db.get('profiles', id);
}

export async function getAllProfiles(): Promise<ExProfile[]> {
  const db = await getDB();
  return db.getAll('profiles');
}

export async function updateProfile(id: string, updates: Partial<ExProfile>): Promise<ExProfile> {
  const db = await getDB();
  const existing = await db.get('profiles', id);
  if (!existing) throw new Error(`Profile ${id} not found`);
  const updated = { ...existing, ...updates };
  await db.put('profiles', updated);
  return updated;
}

export async function deleteProfile(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('profiles', id);
  // cascade: delete related groups, memories, messages
  const tx = db.transaction(['memoryGroups', 'memories', 'messages'], 'readwrite');
  const groups = await tx.objectStore('memoryGroups').index('byProfile').getAll(id);
  for (const g of groups) {
    tx.objectStore('memoryGroups').delete(g.id);
  }
  const memories = await tx.objectStore('memories').index('byProfile').getAll(id);
  for (const m of memories) {
    tx.objectStore('memories').delete(m.id);
  }
  const messages = await tx.objectStore('messages').index('byProfile').getAll(id);
  for (const msg of messages) {
    tx.objectStore('messages').delete(msg.id);
  }
  await tx.done;
}

// ============================================
// Memory Group CRUD
// ============================================
const PRESET_GROUPS: Omit<MemoryGroup, 'id' | 'profileId'>[] = [
  { name: '喜好', type: 'preset', presetKey: 'favorites', sortOrder: 0 },
  { name: '习惯', type: 'preset', presetKey: 'habits', sortOrder: 1 },
  { name: '重要事件', type: 'preset', presetKey: 'events', sortOrder: 2 },
  { name: '糗事', type: 'preset', presetKey: 'embarrassing', sortOrder: 3 },
  { name: '其他', type: 'preset', presetKey: 'other', sortOrder: 4 },
];

export function getDefaultGroups(profileId: string): MemoryGroup[] {
  return PRESET_GROUPS.map((preset) => ({
    ...preset,
    id: `${profileId}-group-${preset.presetKey}`,
    profileId,
  }));
}

export async function createMemoryGroup(group: MemoryGroup): Promise<void> {
  const db = await getDB();
  await db.put('memoryGroups', group);
}

export async function getMemoryGroupsByProfile(profileId: string): Promise<MemoryGroup[]> {
  const db = await getDB();
  return db.getAllFromIndex('memoryGroups', 'byProfile', profileId);
}

export async function deleteMemoryGroup(id: string): Promise<void> {
  const db = await getDB();
  // 把该分组下的记忆移到「其他」分组
  const tx = db.transaction(['memoryGroups', 'memories'], 'readwrite');
  const group = await tx.objectStore('memoryGroups').get(id);
  if (!group) return;

  const memories = await tx.objectStore('memories').index('byGroup').getAll(id);
  const otherGroup = await tx.objectStore('memoryGroups').get(`${group.profileId}-group-other`);

  for (const mem of memories) {
    mem.groupId = otherGroup?.id || `${group.profileId}-group-other`;
    tx.objectStore('memories').put(mem);
  }

  tx.objectStore('memoryGroups').delete(id);
  await tx.done;
}

// ============================================
// Memory CRUD
// ============================================
export async function createMemory(memory: Memory): Promise<void> {
  const db = await getDB();
  await db.put('memories', memory);
}

export async function getMemoriesByProfile(profileId: string): Promise<Memory[]> {
  const db = await getDB();
  return db.getAllFromIndex('memories', 'byProfile', profileId);
}

export async function getMemoriesByGroup(groupId: string): Promise<Memory[]> {
  const db = await getDB();
  return db.getAllFromIndex('memories', 'byGroup', groupId);
}

export async function updateMemory(id: string, updates: Partial<Memory>): Promise<void> {
  const db = await getDB();
  const existing = await db.get('memories', id);
  if (!existing) throw new Error(`Memory ${id} not found`);
  await db.put('memories', { ...existing, ...updates, updatedAt: Date.now() });
}

export async function deleteMemory(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('memories', id);
}

export async function moveMemoryToGroup(id: string, newGroupId: string): Promise<void> {
  const db = await getDB();
  const existing = await db.get('memories', id);
  if (!existing) throw new Error(`Memory ${id} not found`);
  await db.put('memories', { ...existing, groupId: newGroupId, updatedAt: Date.now() });
}

// ============================================
// Message CRUD
// ============================================
export async function addMessage(msg: WeChatMessage & { profileId: string }): Promise<void> {
  const db = await getDB();
  await db.put('messages', msg);
}

export async function getMessagesByProfile(profileId: string): Promise<(WeChatMessage & { profileId: string })[]> {
  const db = await getDB();
  return db.getAllFromIndex('messages', 'byProfile', profileId);
}

export async function updateMessage(id: string, updates: Partial<WeChatMessage>): Promise<void> {
  const db = await getDB();
  const existing = await db.get('messages', id);
  if (!existing) return;
  // 深合并 meta 和 content，避免覆盖子对象
  const merged = {
    ...existing,
    ...updates,
    meta: { ...existing.meta, ...(updates.meta || {}) },
    content: { ...existing.content, ...(updates.content || {}) },
    sender: updates.sender ? { ...existing.sender, ...updates.sender } : existing.sender,
    context: updates.context ? { ...existing.context, ...updates.context } : existing.context,
  };
  await db.put('messages', merged);
}

export async function deleteMessagesByProfile(profileId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('messages', 'readwrite');
  const msgs = await tx.store.index('byProfile').getAll(profileId);
  for (const m of msgs) {
    tx.store.delete(m.id);
  }
  await tx.done;
}
