'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, User, FolderHeart, Trash2 } from 'lucide-react';
import { useProfileStore } from '@/stores/useProfileStore';
import { PersonalityTab } from '@/components/manage/PersonalityTab';
import { MemoryTab } from '@/components/manage/MemoryTab';

type TabKey = 'personality' | 'memory';

export default function ManagePage() {
  const router = useRouter();
  const { currentProfileId, getCurrentProfile, isLoading, deleteProfile, profiles } = useProfileStore();
  const [activeTab, setActiveTab] = useState<TabKey>('personality');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const profile = getCurrentProfile();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--wx-bg-primary)] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-[var(--wx-bubble-me)] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-[var(--wx-bg-primary)] flex flex-col items-center justify-center p-6">
        <p className="text-[var(--wx-text-secondary)] mb-4">还没有角色，先创建一个吧</p>
        <button
          onClick={() => router.push('/create-ex')}
          className="px-6 py-3 bg-[var(--wx-bubble-me)] text-black rounded-lg font-medium"
        >
          创建角色
        </button>
      </div>
    );
  }

  const tabs = [
    { key: 'personality' as TabKey, label: '角色设定', icon: User },
    { key: 'memory' as TabKey, label: '记忆与素材', icon: FolderHeart },
  ];

  return (
    <div className="min-h-screen bg-[var(--wx-bg-primary)]">
      {/* Header */}
      <header className="h-14 bg-[var(--wx-bg-secondary)] border-b border-[var(--wx-border)] flex items-center px-4 sticky top-0 z-10">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-1 text-[var(--wx-text-secondary)] hover:text-white transition"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm">返回聊天</span>
        </button>
        <h1 className="flex-1 text-center text-lg font-medium">{profile.identity.name}</h1>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="p-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition"
          title="删除角色"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </header>

      {/* Tab Bar */}
      <div className="flex border-b border-[var(--wx-border)] bg-[var(--wx-bg-secondary)]">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm transition relative ${
                activeTab === tab.key
                  ? 'text-white'
                  : 'text-[var(--wx-text-secondary)] hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {activeTab === tab.key && (
                <div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-[var(--wx-bubble-me)]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <main className="max-w-2xl mx-auto p-4 pb-20">
        {activeTab === 'personality' && <PersonalityTab profile={profile} />}
        {activeTab === 'memory' && <MemoryTab profile={profile} />}
      </main>

      {/* 删除确认对话框 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="bg-[var(--wx-bg-secondary)] border border-[var(--wx-border)] rounded-xl w-full max-w-sm p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-medium text-center">删除角色</h3>
            <p className="text-sm text-[var(--wx-text-secondary)] text-center">
              确定要删除「{profile.identity.name}」吗？<br/>
              所有聊天记录、记忆和设定都会被永久删除，不可恢复。
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-3 bg-[var(--wx-bg-tertiary)] rounded-lg text-sm hover:bg-[var(--wx-bg-secondary)] transition"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  await deleteProfile(profile.id);
                  if (profiles.length <= 1) {
                    router.push('/create-ex');
                  } else {
                    router.push('/');
                  }
                }}
                className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm transition"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
