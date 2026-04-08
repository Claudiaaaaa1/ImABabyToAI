'use client';

import { WeChatMessage } from '@/types';
import { cn } from '@/lib/utils';

interface MessageBubbleProps {
  message: WeChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isMe = message.sender.id === 'me';
  const isSystem = message.sender.id === 'system';

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

  return (
    <div className={cn(
      'flex w-full mb-4',
      isMe ? 'justify-end' : 'justify-start'
    )}>
      {/* 头像 */}
      {!isMe && (
        <img
          src={message.sender.avatar}
          alt={message.sender.name}
          className="w-10 h-10 rounded-md mr-3 object-cover"
        />
      )}

      {/* 气泡 */}
      <div className={cn(
        'relative max-w-[70%] px-4 py-2.5 rounded-lg text-[15px] leading-relaxed',
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
        {message.content.type === 'text' && (
          <span className="relative z-10">{message.content.text}</span>
        )}

        {/* 发送状态 */}
        {isMe && message.meta.sendStatus === 'sending' && (
          <span className="ml-2 text-xs opacity-50">发送中...</span>
        )}
      </div>

      {/* 自己头像在右侧 */}
      {isMe && (
        <img
          src={message.sender.avatar}
          alt="我"
          className="w-10 h-10 rounded-md ml-3 object-cover"
        />
      )}
    </div>
  );
}
