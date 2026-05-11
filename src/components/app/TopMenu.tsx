'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Menu, X, User, UserPlus, Users, Settings, ChevronRight,
} from 'lucide-react';
import { useProfileStore } from '@/stores/useProfileStore';

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  return new Date(timestamp).toLocaleDateString('zh-CN');
}

export function TopMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [panel, setPanel] = useState<'main' | 'switch' | 'me'>('main');
  const router = useRouter();
  const { profiles, currentProfileId, switchProfile, updateProfile } = useProfileStore();
  const fileRef = useRef<HTMLInputElement>(null);

  const currentProfile = profiles.find((p) => p.id === currentProfileId);
  const otherProfiles = profiles.filter((p) => p.id !== currentProfileId);

  const handleSwitch = async (id: string) => {
    await switchProfile(id);
    setPanel('main');
    setIsOpen(false);
  };

  const handleManage = () => {
    setIsOpen(false);
    router.push('/manage');
  };

  const handleCreate = () => {
    setIsOpen(false);
    router.push('/create-ex');
  };

  const handleUploadAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('请上传图片文件');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert('图片大小不能超过 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      // 保存到 localStorage 作为"我的头像"
      localStorage.setItem('digital-ex-user-avatar', base64);
      // 通知其他组件头像已更改
      window.dispatchEvent(new Event('digital-ex-avatar-changed'));
      // 触发重新渲染
      setPanel('me');
    };
    reader.readAsDataURL(file);
  };

  const getUserAvatar = () => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('digital-ex-user-avatar');
  };

  const getUserName = () => {
    if (typeof window === 'undefined') return '我';
    return localStorage.getItem('digital-ex-user-name') || '我';
  };

  const setUserName = (name: string) => {
    localStorage.setItem('digital-ex-user-name', name);
    setPanel('me');
  };

  return (
    <>
      {/* 三道杠按钮 */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-4 right-4 z-20 p-2 bg-[var(--wx-bg-secondary)] border border-[var(--wx-border)] rounded hover:bg-[var(--wx-bg-tertiary)] transition"
        aria-label="菜单"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* 遮罩层 */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30"
          onClick={() => {
            setIsOpen(false);
            setPanel('main');
          }}
        />
      )}

      {/* 右侧划出菜单 - 占屏幕 1/3 (移动端全宽) */}
      <div
        className={`fixed top-0 right-0 bottom-0 z-40 bg-[var(--wx-bg-secondary)] border-l border-[var(--wx-border)] w-full md:w-1/3 transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* 头部 */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-[var(--wx-border)]">
          {panel !== 'main' ? (
            <button
              onClick={() => setPanel('main')}
              className="flex items-center gap-1 text-sm text-[var(--wx-text-secondary)] hover:text-white transition"
            >
              <X className="w-4 h-4" />
              返回
            </button>
          ) : (
            <span className="text-sm font-medium">功能菜单</span>
          )}
          <button
            onClick={() => { setIsOpen(false); setPanel('main'); }}
            className="p-1 hover:bg-[var(--wx-bg-tertiary)] rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容区 */}
        <div className="overflow-y-auto h-[calc(100%-56px)] wx-scrollbar">
          {panel === 'main' && (
            <div className="p-4 space-y-1">
              {/* 我的 */}
              <button
                onClick={() => setPanel('me')}
                className="w-full flex items-center gap-3 px-3 py-3.5 hover:bg-[var(--wx-bg-tertiary)] rounded-lg transition text-left"
              >
                <div className="w-9 h-9 rounded-full bg-[var(--wx-bg-tertiary)] flex items-center justify-center overflow-hidden flex-shrink-0">
                  {getUserAvatar() ? (
                    <img src={getUserAvatar()!} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-5 h-5 text-[var(--wx-text-secondary)]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{getUserName()}</p>
                  <p className="text-xs text-[var(--wx-text-secondary)]">个人设置</p>
                </div>
                <ChevronRight className="w-4 h-4 text-[var(--wx-text-secondary)]" />
              </button>

              <div className="my-2 border-t border-[var(--wx-border)]" />

              {/* 当前角色管理 */}
              <button
                onClick={handleManage}
                className="w-full flex items-center gap-3 px-3 py-3.5 hover:bg-[var(--wx-bg-tertiary)] rounded-lg transition text-left"
              >
                <Settings className="w-5 h-5 text-[var(--wx-text-secondary)]" />
                <span>当前角色管理</span>
                <ChevronRight className="w-4 h-4 text-[var(--wx-text-secondary)] ml-auto" />
              </button>

              {/* 新建角色 */}
              <button
                onClick={handleCreate}
                className="w-full flex items-center gap-3 px-3 py-3.5 hover:bg-[var(--wx-bg-tertiary)] rounded-lg transition text-left"
              >
                <UserPlus className="w-5 h-5 text-[var(--wx-text-secondary)]" />
                <span>新建角色</span>
                <ChevronRight className="w-4 h-4 text-[var(--wx-text-secondary)] ml-auto" />
              </button>

              {/* 切换角色 */}
              <button
                onClick={() => setPanel('switch')}
                className="w-full flex items-center gap-3 px-3 py-3.5 hover:bg-[var(--wx-bg-tertiary)] rounded-lg transition text-left"
              >
                <Users className="w-5 h-5 text-[var(--wx-text-secondary)]" />
                <span>切换角色</span>
                <span className="ml-auto text-xs text-[var(--wx-text-secondary)] bg-[var(--wx-bg-tertiary)] px-2 py-0.5 rounded-full">
                  {profiles.length}
                </span>
                <ChevronRight className="w-4 h-4 text-[var(--wx-text-secondary)]" />
              </button>

              <div className="my-2 border-t border-[var(--wx-border)]" />

              {/* 当前角色信息 */}
              {currentProfile && (
                <div className="px-3 py-3">
                  <p className="text-xs text-[var(--wx-text-secondary)] mb-2">当前聊天</p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-md bg-[var(--wx-bg-tertiary)] flex items-center justify-center overflow-hidden">
                      {currentProfile.avatar?.startsWith('data:') || currentProfile.avatar?.startsWith('http') ? (
                        <img src={currentProfile.avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-lg">👤</span>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{currentProfile.identity.name}</p>
                      <p className="text-xs text-[var(--wx-text-secondary)]">
                        {formatTimeAgo(currentProfile.lastChatAt)}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {panel === 'switch' && (
            <div className="p-4 space-y-1">
              <h3 className="text-sm text-[var(--wx-text-secondary)] px-3 py-2">选择角色</h3>
              {profiles.map((profile) => (
                <button
                  key={profile.id}
                  onClick={() => handleSwitch(profile.id)}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition text-left ${
                    profile.id === currentProfileId
                      ? 'bg-[var(--wx-bg-tertiary)]'
                      : 'hover:bg-[var(--wx-bg-tertiary)]'
                  }`}
                >
                  <div className="w-10 h-10 rounded-md bg-[var(--wx-bg-tertiary)] flex items-center justify-center text-lg overflow-hidden flex-shrink-0">
                    {profile.avatar?.startsWith('data:') || profile.avatar?.startsWith('http') ? (
                      <img src={profile.avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-lg">👤</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{profile.identity.name}</p>
                    <p className="text-xs text-[var(--wx-text-secondary)]">
                      {profile.id === currentProfileId ? '当前聊天中' : formatTimeAgo(profile.lastChatAt)}
                    </p>
                  </div>
                  {profile.id === currentProfileId && (
                    <span className="text-xs px-2 py-0.5 bg-[var(--wx-bubble-me)] text-black rounded-full">
                      当前
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {panel === 'me' && (
            <div className="p-4 space-y-4">
              <h3 className="text-sm text-[var(--wx-text-secondary)] px-3 py-2">我的</h3>

              {/* 头像 */}
              <div className="flex flex-col items-center gap-3 py-4">
                <div
                  onClick={() => fileRef.current?.click()}
                  className="w-20 h-20 rounded-full bg-[var(--wx-bg-tertiary)] border-2 border-[var(--wx-border)] flex items-center justify-center cursor-pointer hover:border-[var(--wx-bubble-me)] transition overflow-hidden"
                >
                  {getUserAvatar() ? (
                    <img src={getUserAvatar()!} alt="avatar" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-8 h-8 text-[var(--wx-text-secondary)]" />
                  )}
                </div>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="text-sm text-[var(--wx-text-secondary)] hover:text-white transition"
                >
                  更换头像
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={handleUploadAvatar}
                  className="hidden"
                />
              </div>

              {/* 名字 */}
              <div className="px-3">
                <label className="block text-xs text-[var(--wx-text-secondary)] mb-1">昵称</label>
                <input
                  type="text"
                  defaultValue={getUserName()}
                  onBlur={(e) => setUserName(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--wx-bg-tertiary)] border border-[var(--wx-border)] rounded-lg outline-none focus:border-[var(--wx-bubble-me)] text-sm"
                />
              </div>

              <div className="my-2 border-t border-[var(--wx-border)]" />

              <div className="px-3 space-y-1 text-sm text-[var(--wx-text-secondary)]">
                <p>版本: 0.1.0</p>
                <p>Digital Ex - AI 数字前任</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
