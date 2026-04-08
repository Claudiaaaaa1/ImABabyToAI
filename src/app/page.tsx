'use client';

import { useCallback, useState } from 'react';
import { MessageBubble } from '@/components/wechat/MessageBubble';
import { InputArea } from '@/components/wechat/InputArea';
import { TypingIndicator } from '@/components/wechat/TypingIndicator';
import { useChatStore } from '@/stores/useChatStore';
import { useSkillStore } from '@/stores/useSkillStore';
import { WeChatMessage } from '@/types';
import { v4 as uuidv4 } from 'uuid';

export default function Home() {
  const { messages, isTyping, addMessage, appendToMessage, setIsTyping } = useChatStore();
  const { config, setConfig, getSystemPrompt, addMemory } = useSkillStore();
  const [errorInfo, setErrorInfo] = useState<{show: boolean, message: string, retryable: boolean}>({show: false, message: '', retryable: false});
  const [lastFailedText, setLastFailedText] = useState<string>('');

  const handleSend = useCallback(async (text: string, isRetry = false) => {
    if (!config) return;

    // 处理 # 开头的记忆指令（提示词）
    if (text.startsWith('#') && !isRetry) {
      const instruction = text.slice(1).trim();
      if (instruction) {
        // 添加到记忆库
        addMemory(instruction);

        // 显示一个轻量的系统提示（灰色小字）
        const systemMsg: WeChatMessage = {
          id: uuidv4(),
          localId: uuidv4(),
          sender: { id: 'system', name: '系统', avatar: '/system.svg' },
          content: { type: 'text', text: `💡 已学习：${instruction.slice(0, 30)}${instruction.length > 30 ? '...' : ''}` },
          meta: { timestamp: Date.now(), isRead: true, isRecalled: false, sendStatus: 'sent' },
        };
        addMessage(systemMsg);

        // 调用 API 让数字人自然回应
        setIsTyping(true);
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000);

          // 构建一个虚拟的用户消息，让 AI 回应设定
          const virtualUserMsg: WeChatMessage = {
            id: uuidv4(),
            localId: uuidv4(),
            sender: { id: 'me', name: '我', avatar: '/me-avatar.svg' },
            content: { type: 'text', text: instruction },
            meta: { timestamp: Date.now(), isRead: true, isRecalled: false, sendStatus: 'sent' },
          };

          const response = await fetch('/api/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: [virtualUserMsg],
              skillConfig: {
                ...config,
                identity: {
                  ...config.identity,
                  personaPrompt: `${config.identity.personaPrompt}\n\n【重要】用户刚给你一条设定/纠正：${instruction}\n请自然回应表示你接受了这个设定，不要复述指令内容，而是用你的人设自然回应。`,
                },
              },
              context: { timeOfDay: getTimeOfDay(), conversationTurn: messages.length },
            }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          let aiMsgId: string | null = null;

          if (reader) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value);
              const lines = chunk.split(/\n\n|\r\n\r\n/);

              for (const line of lines) {
                const cleanLine = line.replace(/\r/g, '').trim();
                if (!cleanLine || !cleanLine.startsWith('event:')) continue;

                try {
                  const eventLine = cleanLine.split('\n')[0];
                  const dataLine = cleanLine.split('\n')[1];
                  if (!dataLine) continue;

                  const eventType = eventLine.replace('event:', '').trim();
                  const data = JSON.parse(dataLine.replace('data:', '').trim());

                  if (eventType === 'delta') {
                    if (!aiMsgId) {
                      aiMsgId = uuidv4();
                      addMessage({
                        id: aiMsgId,
                        localId: uuidv4(),
                        sender: { id: 'ex', name: config.identity.name, avatar: config.identity.avatar },
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
                } catch (e) {
                  // ignore parse error
                }
              }
            }
          }
        } catch (err) {
          // 如果 API 失败，显示一个默认确认
          setIsTyping(false);
          addMessage({
            id: uuidv4(),
            localId: uuidv4(),
            sender: { id: 'ex', name: config.identity.name, avatar: config.identity.avatar },
            content: { type: 'text', text: '知道啦～' },
            meta: { timestamp: Date.now(), isRead: true, isRecalled: false, sendStatus: 'sent' },
          });
        }
        return;
      }
    }

    // 1. 添加用户消息（如果不是重试）
    const userMsg: WeChatMessage = {
      id: uuidv4(),
      localId: uuidv4(),
      sender: { id: 'me', name: '我', avatar: '/me-avatar.svg' },
      content: { type: 'text', text },
      meta: { timestamp: Date.now(), isRead: false, isRecalled: false, sendStatus: 'sent' },
    };
    if (!isRetry) {
      addMessage(userMsg);
    }

    // 2. 设置 typing 状态
    setIsTyping(true);
    setErrorInfo({show: false, message: '', retryable: false});
    setLastFailedText(text);

    let errorOccurred = false;
    let retryable = false;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60秒超时

    try {
      console.log('[Frontend] Sending request...');
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
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      console.log('[Frontend] Response received:', response.status, 'ok:', response.ok);

      // 检查响应状态
      if (!response.ok) {
        let errorMsg = `服务器错误 (${response.status})`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } catch {
          // 如果不是 JSON，使用状态文本
          errorMsg = response.statusText || errorMsg;
        }
        setErrorInfo({show: true, message: errorMsg, retryable: true});
        setIsTyping(false);
        return;
      }

      // 4. 处理流式响应
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let aiMsgId: string | null = null;
      let receivedAnyData = false;

      if (reader) {
        console.log('[Frontend] Starting to read stream...');
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log('[Frontend] Stream done, received data:', receivedAnyData);
            if (!receivedAnyData && !errorOccurred) {
              setErrorInfo({show: true, message: 'AI 未返回任何内容，请重试。', retryable: true});
              setIsTyping(false);
            }
            break;
          }

          const chunk = decoder.decode(value);
          console.log('[Frontend] Received chunk:', chunk.slice(0, 100));
          // 处理 Windows \r\n 和 \n\n 换行
          const lines = chunk.split(/\n\n|\r\n\r\n/);

          for (const line of lines) {
            const cleanLine = line.replace(/\r/g, '').trim();
            if (!cleanLine || !cleanLine.startsWith('event:')) continue;

            try {
              const eventLine = cleanLine.split('\n')[0];
              const dataLine = cleanLine.split('\n')[1];
              if (!dataLine) continue;

              const eventType = eventLine.replace('event:', '').trim();
              const data = JSON.parse(dataLine.replace('data:', '').trim());
              console.log('[Frontend] Event:', eventType, data);

              if (eventType === 'status' && data.state === 'typing') {
                // 保持 typing 状态
              } else if (eventType === 'delta') {
                receivedAnyData = true;
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
              } else if (eventType === 'error') {
                errorOccurred = true;
                receivedAnyData = true;
                retryable = data.status === 429;
                setErrorInfo({show: true, message: data.message, retryable});
                setIsTyping(false);
              } else if (eventType === 'done') {
                setIsTyping(false);
              }
            } catch (parseError) {
              console.error('[Frontend] Parse error:', parseError, 'Line:', line);
            }
          }
        }
      } else {
        console.error('[Frontend] No reader available');
        setErrorInfo({show: true, message: '无法读取响应', retryable: true});
        setIsTyping(false);
      }
    } catch (error: any) {
      console.error('[Frontend] Error:', error);
      errorOccurred = true;
      const isTimeout = error.name === 'AbortError';
      const errorMsg = isTimeout
        ? '⚠️ 请求超时：服务器响应时间过长，请稍后重试。'
        : `⚠️ 网络错误：${error.message}`;
      setErrorInfo({show: true, message: errorMsg, retryable: isTimeout});
      setIsTyping(false);
    } finally {
      clearTimeout(timeoutId);
    }
  }, [messages, config, addMessage, appendToMessage, setIsTyping]);

  const handleRetry = () => {
    if (lastFailedText) {
      handleSend(lastFailedText, true);
    }
  };

  // 如果没有配置，显示引导页
  if (!config) {
    return (
      <div className="min-h-screen bg-[var(--wx-bg-primary)] flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-6">
          <h1 className="text-3xl font-medium">Digital Ex</h1>
          <p className="text-[var(--wx-text-secondary)]">
            基于 AI 的数字前任对话体验<br/>
            上传聊天记录，让 TA "活"在还没分手的时间线里
          </p>

          <div className="space-y-3">
            <a
              href="/create-ex"
              className="block w-full py-4 bg-[var(--wx-bubble-me)] text-black font-medium rounded-lg hover:opacity-90 transition"
            >
              创建数字前任
            </a>

            <button
              onClick={() => {
                // 设置一个默认配置
                setConfig({
                  identity: {
                    name: '小雨',
                    avatar: '/default-ex.png',
                    personaPrompt: '你是一个温柔粘人的恋人，说话简洁，偶尔会撒娇关心对方。你们正在甜蜜的恋爱中，你完全不知道分手这件事。',
                    speakingStyle: '温柔、简洁、偶尔撒娇',
                  },
                  memoryBank: { coreMemories: [] },
                  behavior: {
                    responseDelay: { min: 1000, max: 3000 },
                    typingSpeed: 50,
                    emojiFrequency: 0.3,
                    readReceiptDelay: 2000,
                  },
                });
              }}
              className="block w-full py-4 bg-[var(--wx-bg-secondary)] text-white rounded-lg hover:bg-[var(--wx-bg-tertiary)] transition"
            >
              快速体验（默认角色）
            </button>
          </div>

          <p className="text-xs text-[var(--wx-text-secondary)]">
            支持微信/QQ 聊天记录、照片、语音、口述回忆
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[var(--wx-bg-primary)]">
      {/* 创建新角色按钮 */}
      <a
        href="/create-ex"
        className="fixed top-4 right-4 px-4 py-2 bg-[var(--wx-bg-secondary)] border border-[var(--wx-border)] rounded text-sm hover:bg-[var(--wx-bg-tertiary)] transition z-10"
      >
        创建新角色
      </a>

      {/* 顶部标题栏 */}
      <header className="h-16 bg-[var(--wx-bg-secondary)] border-b border-[var(--wx-border)] flex items-center justify-center px-4">
        <h1 className="text-lg font-medium">
          {config?.identity.name || 'Digital Ex'}
        </h1>
      </header>

      {/* 错误提示栏 */}
      {errorInfo.show && (
        <div className="bg-red-900/80 border-b border-red-700 px-4 py-2 flex items-center justify-between">
          <span className="text-red-200 text-sm">{errorInfo.message}</span>
          {errorInfo.retryable && (
            <button
              onClick={handleRetry}
              disabled={isTyping}
              className="ml-4 px-3 py-1 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-xs rounded transition"
            >
              {isTyping ? '重试中...' : '重试'}
            </button>
          )}
        </div>
      )}

      {/* 消息列表 */}
      <main className="flex-1 overflow-y-auto p-4 wx-scrollbar">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {isTyping && <TypingIndicator />}
      </main>

      {/* 输入区域 */}
      <InputArea onSend={(text) => handleSend(text)} disabled={isTyping} />
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
