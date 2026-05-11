'use client';

import { useCallback, useEffect, useState } from 'react';
import { MessageBubble } from '@/components/wechat/MessageBubble';
import { InputArea } from '@/components/wechat/InputArea';
import { TypingIndicator } from '@/components/wechat/TypingIndicator';
import { TopMenu } from '@/components/app/TopMenu';
import { useChatStore } from '@/stores/useChatStore';
import { useProfileStore } from '@/stores/useProfileStore';
import { WeChatMessage } from '@/types';
import { retrieveFewShotPairs } from '@/lib/fewShotRetrieve';
import { v4 as uuidv4 } from 'uuid';

function getUserAvatar(): string {
  if (typeof window === 'undefined') return '/me-avatar.svg';
  return localStorage.getItem('digital-ex-user-avatar') || '/me-avatar.svg';
}

export default function Home() {
  const { messages, isTyping, loadMessages, addMessage, appendToMessage, setIsTyping, updateLastChatAt, recallMessage, clearMessages, updateMessage } = useChatStore();
  const { currentProfileId, profiles, isLoading: profileLoading, init: initProfiles, createProfile, addMemory } = useProfileStore();

  // 用户头像状态：监听 localStorage 变化
  const [userAvatar, setUserAvatar] = useState(getUserAvatar());

  useEffect(() => {
    const handleStorage = () => setUserAvatar(getUserAvatar());
    window.addEventListener('storage', handleStorage);
    window.addEventListener('digital-ex-avatar-changed', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('digital-ex-avatar-changed', handleStorage);
    };
  }, []);

  const [errorInfo, setErrorInfo] = useState<{show: boolean, message: string, retryable: boolean}>({show: false, message: '', retryable: false});
  const [lastFailedText, setLastFailedText] = useState<string>('');

  // 初始化：加载角色列表
  useEffect(() => {
    initProfiles();
  }, [initProfiles]);

  // 当前角色变化时，清除旧记录并加载新记录
  useEffect(() => {
    if (currentProfileId) {
      clearMessages();
      loadMessages(currentProfileId);
    }
  }, [currentProfileId, loadMessages, clearMessages]);

  const handleSend = useCallback(async (text: string, imageUrl?: string, isRetry = false) => {
    const profileStore = useProfileStore.getState();
    const chatStore = useChatStore.getState();
    const profile = profileStore.getCurrentProfile();
    const profileId = profileStore.currentProfileId;

    if (!profile || !profileId) return;

    // 发送图片消息（不触发 AI，当前 API 不支持 vision）
    if (imageUrl && !text) {
      const imageMsg: WeChatMessage = {
        id: uuidv4(),
        localId: uuidv4(),
        sender: { id: 'me', name: '我', avatar: userAvatar },
        content: { type: 'image', imageUrl },
        meta: { timestamp: Date.now(), isRead: false, isRecalled: false, sendStatus: 'sent' },
      };
      await chatStore.addMessage(profileId, imageMsg);
      return;
    }

    // 发送图文消息（文字触发 AI，图片仅展示）
    if (imageUrl && text) {
      const imageMsg: WeChatMessage = {
        id: uuidv4(),
        localId: uuidv4(),
        sender: { id: 'me', name: '我', avatar: userAvatar },
        content: { type: 'image', imageUrl },
        meta: { timestamp: Date.now(), isRead: false, isRecalled: false, sendStatus: 'sent' },
      };
      await chatStore.addMessage(profileId, imageMsg);
    }

    // 构建 SkillConfig
    const skillConfig = {
      identity: profile.identity,
      memoryBank: profile.memoryBank,
      behavior: profile.behavior,
      styleProfile: profile.styleProfile,
    };

    // 处理 # 开头的记忆指令（提示词）
    if (text.startsWith('#') && !isRetry) {
      const instruction = text.slice(1).trim();
      if (instruction) {
        // 1. 添加到记忆库
        await profileStore.addMemory(instruction);

        // 2. 【核心】永久更新 personaPrompt，让设定在后续所有对话中生效
        const constraintPrefix = '\n\n【用户设定 - 永久生效，必须严格遵守】';
        const existingPrompt = profile.identity.personaPrompt;
        // 避免重复追加相同的约束
        let updatedPrompt: string;
        if (existingPrompt.includes(instruction)) {
          updatedPrompt = existingPrompt;
        } else {
          updatedPrompt = existingPrompt + constraintPrefix + instruction;
        }
        await profileStore.updateProfile(profile.id, {
          identity: {
            ...profile.identity,
            personaPrompt: updatedPrompt,
          },
        });

        // 3. 显示系统提示
        const systemMsg: WeChatMessage = {
          id: uuidv4(),
          localId: uuidv4(),
          sender: { id: 'system', name: '系统', avatar: '/system.svg' },
          content: { type: 'text', text: `💡 已学习：${instruction.slice(0, 30)}${instruction.length > 30 ? '...' : ''}` },
          meta: { timestamp: Date.now(), isRead: true, isRecalled: false, sendStatus: 'sent' },
        };
        await chatStore.addMessage(profileId, systemMsg);

        // 4. 调用 API 让数字人自然回应（使用已更新的 prompt）
        chatStore.setIsTyping(true);
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000);

          const virtualUserMsg: WeChatMessage = {
            id: uuidv4(),
            localId: uuidv4(),
            sender: { id: 'me', name: '我', avatar: userAvatar },
            content: { type: 'text', text: instruction },
            meta: { timestamp: Date.now(), isRead: true, isRecalled: false, sendStatus: 'sent' },
          };

          const response = await fetch('/api/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: [virtualUserMsg],
              skillConfig: {
                ...skillConfig,
                identity: {
                  ...skillConfig.identity,
                  personaPrompt: updatedPrompt + `\n\n【当前情境】用户刚给你一条设定/纠正：${instruction}\n请自然回应表示你接受了这个设定，不要复述指令内容，而是用你的人设自然回应。`,
                },
              },
              context: { timeOfDay: getTimeOfDay(), conversationTurn: chatStore.messages.length },
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
                      await chatStore.addMessage(profileId, {
                        id: aiMsgId,
                        localId: uuidv4(),
                        sender: { id: 'ex', name: profile.identity.name, avatar: profile.identity.avatar },
                        content: { type: 'text', text: data.content },
                        meta: { timestamp: Date.now(), isRead: true, isRecalled: false, sendStatus: 'sent' },
                        context: { isStreaming: true },
                      });
                    } else {
                      await chatStore.appendToMessage(profileId, aiMsgId, data.content);
                    }
                  } else if (eventType === 'done') {
                    chatStore.setIsTyping(false);
                    await updateLastChatAt(profileId);
                  }
                } catch (e) {
                  // ignore parse error
                }
              }
            }
          }
        } catch (err) {
          chatStore.setIsTyping(false);
          await chatStore.addMessage(profileId, {
            id: uuidv4(),
            localId: uuidv4(),
            sender: { id: 'ex', name: profile.identity.name, avatar: profile.identity.avatar },
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
      sender: { id: 'me', name: '我', avatar: userAvatar },
      content: { type: 'text', text },
      meta: { timestamp: Date.now(), isRead: false, isRecalled: false, sendStatus: 'sent' },
    };
    if (!isRetry) {
      await chatStore.addMessage(profileId, userMsg);
    }

    // 2. 设置 typing 状态
    chatStore.setIsTyping(true);
    setErrorInfo({show: false, message: '', retryable: false});
    setLastFailedText(text);

    let errorOccurred = false;
    let retryable = false;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      console.log('[Frontend] Sending request...');
      // 3A: 按当前用户消息检索最相关的 few-shot 样例对,随请求注入
      const fewShotPairs = retrieveFewShotPairs(text, profile.exQAPairs, 5);

      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...chatStore.messages, userMsg],
          skillConfig,
          context: {
            timeOfDay: getTimeOfDay(),
            conversationTurn: chatStore.messages.length,
          },
          fewShotPairs,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      console.log('[Frontend] Response received:', response.status, 'ok:', response.ok);

      if (!response.ok) {
        let errorMsg = `服务器错误 (${response.status})`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } catch {
          errorMsg = response.statusText || errorMsg;
        }
        setErrorInfo({show: true, message: errorMsg, retryable: true});
        chatStore.setIsTyping(false);
        return;
      }

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
              chatStore.setIsTyping(false);
            }
            break;
          }

          const chunk = decoder.decode(value);
          console.log('[Frontend] Received chunk:', chunk.slice(0, 100));
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
                // 流式拆分:每遇到 \n 就把当前气泡封口、下一段开新气泡,
                // 避免"先合并到一个气泡再拆"的视觉闪烁
                let remaining: string = typeof data.content === 'string' ? data.content : '';
                while (remaining.length > 0) {
                  const nlIdx = remaining.indexOf('\n');
                  const segment = nlIdx >= 0 ? remaining.slice(0, nlIdx) : remaining;
                  const hasNewline = nlIdx >= 0;

                  if (segment) {
                    if (!aiMsgId) {
                      aiMsgId = uuidv4();
                      await chatStore.addMessage(profileId, {
                        id: aiMsgId,
                        localId: uuidv4(),
                        sender: {
                          id: 'ex',
                          name: profile.identity.name,
                          avatar: profile.identity.avatar,
                        },
                        content: { type: 'text', text: segment },
                        meta: { timestamp: Date.now(), isRead: true, isRecalled: false, sendStatus: 'sent' },
                        context: { isStreaming: true },
                      });
                    } else {
                      await chatStore.appendToMessage(profileId, aiMsgId, segment);
                    }
                  }

                  if (!hasNewline) break;

                  let justClosed = false;
                  if (aiMsgId) {
                    await chatStore.updateMessage(profileId, aiMsgId, {
                      context: { isStreaming: false },
                    });
                    aiMsgId = null;
                    justClosed = true;
                  }
                  remaining = remaining.slice(nlIdx + 1);

                  if (justClosed && remaining.length > 0) {
                    await new Promise((r) => setTimeout(r, 350 + Math.random() * 400));
                  }
                }
              } else if (eventType === 'error') {
                errorOccurred = true;
                receivedAnyData = true;
                retryable = data.status === 429;
                setErrorInfo({show: true, message: data.message, retryable});
                chatStore.setIsTyping(false);
              } else if (eventType === 'done') {
                chatStore.setIsTyping(false);
                await updateLastChatAt(profileId);

                // 流式期间已按 \n 实时拆分气泡,这里只需给最后一段封口
                if (aiMsgId) {
                  await chatStore.updateMessage(profileId, aiMsgId, {
                    context: { isStreaming: false },
                  });
                  aiMsgId = null;
                }

                // 2C: 异步抽取记忆候选,完成后挂到本轮最后一条 ex 气泡上(不阻塞 UI)
                const stateNow = useChatStore.getState();
                const lastEx = [...stateNow.messages].reverse().find((m) => m.sender.id === 'ex');
                if (lastEx) {
                  // 把同一轮回复中所有 ex 气泡的内容拼起来给抽取器看完整语境
                  const lastUserIdx = [...stateNow.messages]
                    .map((m, i) => ({ id: m.sender.id, i }))
                    .filter((x) => x.id === 'me')
                    .pop()?.i ?? -1;
                  const aiResponseText = stateNow.messages
                    .slice(lastUserIdx + 1)
                    .filter((m) => m.sender.id === 'ex')
                    .map((m) => m.content.text || '')
                    .join('\n');
                  const targetId = lastEx.id;
                  const existing = (profile.memoryBank?.coreMemories || []).map((m) => m.content);

                  void fetch('/api/chat/extract', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      userMessage: text,
                      aiResponse: aiResponseText,
                      profileName: profile.identity.name,
                      existingMemories: existing,
                    }),
                  })
                    .then((r) => r.json())
                    .then((data: { candidates?: string[] }) => {
                      const cands = (data?.candidates || []).filter((c) => typeof c === 'string' && c.trim());
                      if (cands.length > 0) {
                        chatStore.updateMessage(profileId, targetId, {
                          context: { isStreaming: false, memoryCandidates: cands },
                        });
                      }
                    })
                    .catch(() => {});
                }
              }
            } catch (parseError) {
              console.error('[Frontend] Parse error:', parseError, 'Line:', line);
            }
          }
        }
      } else {
        console.error('[Frontend] No reader available');
        setErrorInfo({show: true, message: '无法读取响应', retryable: true});
        chatStore.setIsTyping(false);
      }
    } catch (error: unknown) {
      console.error('[Frontend] Error:', error);
      errorOccurred = true;
      const isTimeout = error instanceof Error && error.name === 'AbortError';
      const errMsg = error instanceof Error ? error.message : String(error);
      const errorMsg = isTimeout
        ? '⚠️ 请求超时：服务器响应时间过长，请稍后重试。'
        : `⚠️ 网络错误：${errMsg}`;
      setErrorInfo({show: true, message: errorMsg, retryable: isTimeout});
      chatStore.setIsTyping(false);
    } finally {
      clearTimeout(timeoutId);
    }
  }, [updateLastChatAt]);

  const handleRetry = () => {
    if (lastFailedText) {
      handleSend(lastFailedText, undefined, true);
    }
  };

  // 2C: 用户在 chip 上点击"记住" -> 入库 + 从候选中移除
  const handleAddMemoryCandidate = useCallback(
    async (content: string, msgId: string, idx: number) => {
      if (!currentProfileId) return;
      await addMemory(content);
      const target = useChatStore.getState().messages.find((m) => m.id === msgId);
      if (!target) return;
      const remaining = (target.context?.memoryCandidates || []).filter((_, i) => i !== idx);
      await updateMessage(currentProfileId, msgId, {
        context: { ...target.context, memoryCandidates: remaining },
      });
    },
    [currentProfileId, addMemory, updateMessage]
  );

  // 2C: 用户在 chip 上点击"忽略" -> 仅从候选中移除
  const handleDismissMemoryCandidate = useCallback(
    async (msgId: string, idx: number) => {
      if (!currentProfileId) return;
      const target = useChatStore.getState().messages.find((m) => m.id === msgId);
      if (!target) return;
      const remaining = (target.context?.memoryCandidates || []).filter((_, i) => i !== idx);
      await updateMessage(currentProfileId, msgId, {
        context: { ...target.context, memoryCandidates: remaining },
      });
    },
    [currentProfileId, updateMessage]
  );

  // 加载中
  if (profileLoading) {
    return (
      <div className="min-h-screen bg-[var(--wx-bg-primary)] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-[var(--wx-bubble-me)] border-t-transparent rounded-full" />
      </div>
    );
  }

  // 如果没有角色，显示引导页
  if (!currentProfileId || profiles.length === 0) {
    return (
      <div className="min-h-screen bg-[var(--wx-bg-primary)] flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-6">
          <h1 className="text-3xl font-medium">Digital Ex</h1>
          <p className="text-[var(--wx-text-secondary)]">
            基于 AI 的数字前任对话体验<br/>
            上传聊天记录，让 TA &quot;活&quot;在还没分手的时间线里
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
                createProfile({
                  identity: {
                    name: '小雨',
                    avatar: '/default-ex.png',
                    personaPrompt: '你是一个温柔粘人的恋人，说话简洁，偶尔会撒娇关心对方。你们正在甜蜜的恋爱中，你完全不知道分手这件事。',
                    speakingStyle: '温柔、简洁、偶尔撒娇',
                  },
                  memoryBank: { coreMemories: [] },
                  behavior: {
                    responseDelay: { min: 200, max: 1500 },
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

  const currentProfile = useProfileStore.getState().getCurrentProfile();

  return (
    <div className="h-screen flex flex-col bg-[var(--wx-bg-primary)]">
      {/* 三道杠菜单 */}
      <TopMenu />

      {/* 顶部标题栏 */}
      <header className="h-16 bg-[var(--wx-bg-secondary)] border-b border-[var(--wx-border)] flex items-center justify-center px-4">
        <h1 className="text-lg font-medium">
          {currentProfile?.identity.name || 'Digital Ex'}
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
        {messages.length === 0 && !isTyping ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-full bg-[var(--wx-bg-tertiary)] flex items-center justify-center mb-4">
              <span className="text-2xl">👋</span>
            </div>
            <p className="text-[var(--wx-text-secondary)] text-sm">
              你和他/她已经成为朋友，现在开始聊天吧！
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg, index) => {
              // 时间分组：与上一条消息间隔超过 5 分钟显示时间戳
              const prev = messages[index - 1];
              const showTime = !prev || (msg.meta.timestamp - prev.meta.timestamp > 5 * 60 * 1000);
              return (
                <div key={msg.id}>
                  {showTime && (
                    <div className="flex justify-center my-3">
                      <span className="text-[11px] text-[var(--wx-text-secondary)] bg-[var(--wx-bg-tertiary)] px-2 py-0.5 rounded">
                        {formatChatTime(msg.meta.timestamp)}
                      </span>
                    </div>
                  )}
                  <MessageBubble
                    message={msg}
                    onRecall={(id) => recallMessage(currentProfileId!, id)}
                    onAddMemory={handleAddMemoryCandidate}
                    onDismissMemory={handleDismissMemoryCandidate}
                  />
                </div>
              );
            })}
            {isTyping && <TypingIndicator />}
          </>
        )}
      </main>

      {/* 输入区域 */}
      <InputArea onSend={(text, imageUrl) => handleSend(text, imageUrl)} disabled={isTyping} />
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

function formatChatTime(ts: number): string {
  const now = new Date();
  const date = new Date(ts);
  const isToday = date.toDateString() === now.toDateString();
  const isYesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toDateString() === date.toDateString();

  const hm = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

  if (isToday) return hm;
  if (isYesterday) return `昨天 ${hm}`;

  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const dayDiff = Math.floor((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));

  if (dayDiff < 7) return `${days[date.getDay()]} ${hm}`;

  return `${date.getMonth() + 1}月${date.getDate()}日 ${hm}`;
}
