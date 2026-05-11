'use client';

import { useState, useEffect, useRef } from 'react';
import { WeChatMessage } from '@/types';
import { cn } from '@/lib/utils';
import { Copy, RotateCcw, Bookmark, X as XIcon } from 'lucide-react';

interface MessageBubbleProps {
  message: WeChatMessage;
  onRecall?: (id: string) => void;
  /** 2C 软提示:用户接受候选记忆,父组件负责入库 + 从 message.context.memoryCandidates 中移除该项 */
  onAddMemory?: (content: string, msgId: string, idx: number) => void;
  /** 2C 软提示:用户忽略候选记忆,父组件仅从 context 中移除 */
  onDismissMemory?: (msgId: string, idx: number) => void;
}

function useUserAvatar() {
  const [avatar, setAvatar] = useState<string>(() => {
    if (typeof window === 'undefined') return '/me-avatar.svg';
    return localStorage.getItem('digital-ex-user-avatar') || '/me-avatar.svg';
  });

  useEffect(() => {
    const update = () => {
      setAvatar(localStorage.getItem('digital-ex-user-avatar') || '/me-avatar.svg');
    };
    window.addEventListener('storage', update);
    window.addEventListener('digital-ex-avatar-changed', update);
    return () => {
      window.removeEventListener('storage', update);
      window.removeEventListener('digital-ex-avatar-changed', update);
    };
  }, []);

  return avatar;
}

function ContextMenu({
  x,
  y,
  onClose,
  items,
}: {
  x: number;
  y: number;
  onClose: () => void;
  items: Array<{ label: string; icon: React.ReactNode; action: () => void; danger?: boolean }>;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-[var(--wx-bg-secondary)] border border-[var(--wx-border)] rounded-lg shadow-xl py-1 min-w-[140px]"
      style={{ left: x, top: y }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => {
            item.action();
            onClose();
          }}
          className={cn(
            'w-full px-4 py-2 text-sm flex items-center gap-2 hover:bg-[var(--wx-bg-tertiary)] transition text-left',
            item.danger ? 'text-red-400' : 'text-white'
          )}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function MessageBubble({ message, onRecall, onAddMemory, onDismissMemory }: MessageBubbleProps) {
  const isMe = message.sender.id === 'me';
  const isSystem = message.sender.id === 'system';
  const userAvatar = useUserAvatar();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; canRecall: boolean } | null>(null);

  // 系统消息显示为居中灰色小字
  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-[var(--wx-text-secondary)] bg-[var(--wx-bg-tertiary)] px-3 py-1 rounded-full">
          {message.content.text}
        </span>
      </div>
    );
  }

  // 已撤回消息
  if (message.meta.isRecalled) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-[var(--wx-text-secondary)] px-3 py-1">
          {isMe ? '你' : message.sender.name} 撤回了一条消息
        </span>
      </div>
    );
  }

  const avatarSrc = isMe ? userAvatar : message.sender.avatar;

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    // 把 Date.now() 计算移到事件处理器中，避免 render 期间调用不纯函数
    const age = Date.now() - message.meta.timestamp;
    const canRecall = isMe && !isSystem && age < 2 * 60 * 1000;
    setContextMenu({ x: e.clientX, y: e.clientY, canRecall });
  };

  const handleCopy = async () => {
    const text = message.content.text || '';
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // fallback
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  };

  const menuItems: Array<{ label: string; icon: React.ReactNode; action: () => void; danger?: boolean }> = [
    {
      label: '复制',
      icon: <Copy className="w-4 h-4" />,
      action: handleCopy,
    },
  ];

  // 仅自己的消息且非系统消息可撤回（限制2分钟内，由 handleContextMenu 在打开菜单时计算）
  if (contextMenu?.canRecall) {
    menuItems.push({
      label: '撤回',
      icon: <RotateCcw className="w-4 h-4" />,
      action: () => onRecall?.(message.id),
      danger: true,
    });
  }

  return (
    <>
      <div
        className={cn(
          'flex w-full mb-4',
          isMe ? 'justify-end' : 'justify-start'
        )}
        onContextMenu={handleContextMenu}
      >
        {/* 头像 */}
        {!isMe && (
          <img
            src={avatarSrc}
            alt={message.sender.name}
            className="w-10 h-10 rounded-md mr-3 object-cover"
          />
        )}

        {/* 气泡或纯图片 */}
        {message.content.type === 'image' && message.content.imageUrl ? (
          <img
            src={message.content.imageUrl}
            alt="图片"
            className="max-w-[60%] max-h-72 rounded-lg object-cover cursor-pointer hover:opacity-90 transition mx-3"
            onClick={(e) => {
              e.stopPropagation();
              window.open(message.content.imageUrl, '_blank');
            }}
          />
        ) : (
          <div className={cn(
            'relative max-w-[70%] px-4 py-2.5 rounded-lg text-[15px] leading-relaxed select-text',
            isMe
              ? 'bg-[var(--wx-bubble-me)] text-black rounded-br-sm'
              : 'bg-[var(--wx-bubble-ex)] text-white rounded-bl-sm'
          )}>
            {/* 小尾巴 */}
            <div className={cn(
              'absolute top-3 w-2 h-2 rotate-45',
              isMe
                ? '-right-1 bg-[var(--wx-bubble-me)]'
                : '-left-1 bg-[var(--wx-bubble-ex)]'
            )} />

            {/* 内容 */}
            <span className="relative z-10 whitespace-pre-wrap">{message.content.text}</span>

            {/* 发送状态 */}
            {isMe && message.meta.sendStatus === 'sending' && (
              <span className="ml-2 text-xs opacity-50">发送中...</span>
            )}
          </div>
        )}

        {/* 自己头像在右侧 */}
        {isMe && (
          <img
            src={avatarSrc}
            alt="我"
            className="w-10 h-10 rounded-md ml-3 object-cover"
          />
        )}
      </div>

      {/* 2C: 记忆候选 chip(只在 ex 消息上展示) */}
      {!isMe && message.context?.memoryCandidates && message.context.memoryCandidates.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3 pl-[52px] -mt-2">
          {message.context.memoryCandidates.map((c, i) => (
            <div
              key={`${message.id}-mc-${i}`}
              className="group inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-[var(--wx-bg-secondary)] border border-[var(--wx-border)] rounded-full text-[var(--wx-text-secondary)] hover:border-[var(--wx-bubble-me)] transition"
            >
              <button
                type="button"
                onClick={() => onAddMemory?.(c, message.id, i)}
                className="flex items-center gap-1 hover:text-white"
                title="加入记忆库"
              >
                <Bookmark className="w-3 h-3" />
                <span>记住「{c}」</span>
              </button>
              <button
                type="button"
                onClick={() => onDismissMemory?.(message.id, i)}
                className="ml-0.5 opacity-60 hover:opacity-100 hover:text-red-300"
                title="忽略"
              >
                <XIcon className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={menuItems}
        />
      )}
    </>
  );
}
