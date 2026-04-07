'use client';

import { useCallback } from 'react';
import { MessageBubble } from '@/components/wechat/MessageBubble';
import { InputArea } from '@/components/wechat/InputArea';
import { TypingIndicator } from '@/components/wechat/TypingIndicator';
import { SkillImporter } from '@/components/skill/SkillImporter';
import { useChatStore } from '@/stores/useChatStore';
import { useSkillStore } from '@/stores/useSkillStore';
import { WeChatMessage } from '@/types';
import { v4 as uuidv4 } from 'uuid';

export default function Home() {
  const { messages, isTyping, addMessage, appendToMessage, setIsTyping } = useChatStore();
  const { config, getSystemPrompt } = useSkillStore();

  const handleSend = useCallback(async (text: string) => {
    if (!config) return;

    // 1. 添加用户消息
    const userMsg: WeChatMessage = {
      id: uuidv4(),
      localId: uuidv4(),
      sender: { id: 'me', name: '我', avatar: '/me-avatar.svg' },
      content: { type: 'text', text },
      meta: { timestamp: Date.now(), isRead: false, isRecalled: false, sendStatus: 'sent' },
    };
    addMessage(userMsg);

    // 2. 设置 typing 状态
    setIsTyping(true);

    // 3. 调用 API
    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [...messages, userMsg],
        skillConfig: config,
        context: {
          timeOfDay: getTimeOfDay(),
          conversationTurn: messages.length,
        },
      }),
    });

    // 4. 处理流式响应
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let aiMsgId: string | null = null;

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n\n');

        for (const line of lines) {
          if (!line.startsWith('event:')) continue;

          const eventLine = line.split('\n')[0];
          const dataLine = line.split('\n')[1];
          const eventType = eventLine.replace('event:', '').trim();
          const data = JSON.parse(dataLine.replace('data:', '').trim());

          if (eventType === 'status' && data.state === 'typing') {
            // 保持 typing 状态
          } else if (eventType === 'delta') {
            if (!aiMsgId) {
              // 首次收到内容，创建 AI 消息
              aiMsgId = uuidv4();
              addMessage({
                id: aiMsgId,
                localId: uuidv4(),
                sender: {
                  id: 'ex',
                  name: config.identity.name,
                  avatar: config.identity.avatar
                },
                content: { type: 'text', text: data.content },
                meta: { timestamp: Date.now(), isRead: true, isRecalled: false, sendStatus: 'sent' },
                context: { isStreaming: true },
              });
            } else {
              appendToMessage(aiMsgId, data.content);
            }
          } else if (eventType === 'done') {
            setIsTyping(false);
          }
        }
      }
    }
  }, [messages, config, addMessage, appendToMessage, setIsTyping]);

  return (
    <div className="h-screen flex flex-col bg-[var(--wx-bg-primary)]">
      {/* Skill 导入按钮 */}
      <SkillImporter />

      {/* 顶部标题栏 */}
      <header className="h-16 bg-[var(--wx-bg-secondary)] border-b border-[var(--wx-border)] flex items-center justify-center px-4">
        <h1 className="text-lg font-medium">
          {config?.identity.name || 'Digital Ex'}
        </h1>
      </header>

      {/* 消息列表 */}
      <main className="flex-1 overflow-y-auto p-4 wx-scrollbar">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {isTyping && <TypingIndicator />}
      </main>

      {/* 输入区域 */}
      <InputArea onSend={handleSend} disabled={isTyping} />
    </div>
  );
}

function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  if (hour < 22) return 'evening';
  return 'night';
}
