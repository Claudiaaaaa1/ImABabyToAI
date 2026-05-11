import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { ChatRequest } from '@/types';

export async function POST(req: NextRequest) {
  const body: ChatRequest = await req.json();

  // 调试：检查环境变量
  const apiKey = process.env.OPENAI_API_KEY || '';
  console.log('[API] OPENAI_BASE_URL:', process.env.OPENAI_BASE_URL);
  console.log('[API] OPENAI_API_KEY exists:', !!apiKey);
  console.log('[API] DEFAULT_MODEL:', process.env.DEFAULT_MODEL);

  // 验证环境变量
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'sk-your-key-here') {
    return new Response(
      JSON.stringify({ error: 'API Key not configured. Please check .env.local file.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 提取行为参数，提供默认值
  const behavior = body.skillConfig.behavior || {
    responseDelay: { min: 200, max: 1500 },
    typingSpeed: 50,
    emojiFrequency: 0.3,
    readReceiptDelay: 2000,
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // 1. 发送 typing 状态
        controller.enqueue(encoder.encode(
          `event: status\ndata: ${JSON.stringify({ state: 'typing', duration: behavior.responseDelay.min })}\n\n`
        ));

        // 根据 behavior.responseDelay 动态等待，模拟真实思考/打字准备时间
        const thinkDelay = behavior.responseDelay.min + Math.random() * (behavior.responseDelay.max - behavior.responseDelay.min);
        await sleep(thinkDelay);

        // 2. 初始化 OpenAI 客户端
        const openai = new OpenAI({
          baseURL: process.env.OPENAI_BASE_URL,
          apiKey: process.env.OPENAI_API_KEY,
          timeout: 30000,
        });

        // 3. 调用 Kimi API
        console.log('[API] Calling OpenAI API with messages:', body.messages.length);
        const response = await openai.chat.completions.create({
          model: process.env.DEFAULT_MODEL || 'kimi-k2.5',
          messages: [
            { role: 'system', content: generateSystemPrompt(body.skillConfig, body.fewShotPairs) },
            ...body.messages
              .slice(-10)
              .filter(m => m.content.text?.trim())
              .map(m => ({
                role: (m.sender.id === 'me' ? 'user' : 'assistant') as 'user' | 'assistant',
                content: m.content.text || '',
              })),
          ],
          stream: true,
          max_tokens: 500,
          temperature: 1,
        });

        // 4. 流式转发
        let isFirst = true;
        let fullContent = '';
        let chunkCount = 0;
        console.log('[API] Starting to stream response');

        for await (const chunk of response) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            chunkCount++;
            fullContent += content;
            console.log(`[API] Chunk ${chunkCount}:`, content.slice(0, 30));
            controller.enqueue(encoder.encode(
              `event: delta\ndata: ${JSON.stringify({ content, isFirst })}\n\n`
            ));
            isFirst = false;
            // 根据 behavior.typingSpeed 动态调整延迟，模拟真实打字节奏
            const speed = behavior.typingSpeed;
            const isSentenceEnd = /[。！？.?!~～…]$/.test(content.trim());
            const isPause = /[,，;；]$/.test(content.trim());
            if (isSentenceEnd) {
              await sleep(speed * (8 + Math.random() * 8)); // 句子间隔
            } else if (isPause) {
              await sleep(speed * (1.6 + Math.random() * 2.4)); // 逗号间隔
            } else {
              await sleep(speed * (0.3 + Math.random() * 0.5)); // 普通字符
            }
          }
        }

        // 5. 发送完成事件
        console.log('[API] Stream complete, chunks:', chunkCount, 'length:', fullContent.length);
        controller.enqueue(encoder.encode(
          `event: done\ndata: ${JSON.stringify({ fullContent })}\n\n`
        ));

        controller.close();
        console.log('[API] Controller closed');
      } catch (error: unknown) {
        console.error('[API] Error:', error);

        const apiError = error as {
          status?: number;
          message?: string;
          type?: string;
          error?: { message?: string };
        };

        // 详细错误处理
        let errorMessage = apiError.message || 'Unknown error';
        let errorType = apiError.type || 'unknown';

        if (apiError.status === 401) {
          errorMessage = 'API Key 无效或已过期。请检查 .env.local 中的 OPENAI_API_KEY 是否正确。';
          errorType = 'unauthorized';
        } else if (apiError.status === 429) {
          errorMessage = '请求过于频繁（429）。Moonshot 免费额度有严格限流，请等待 10-20 秒后重试，或考虑充值解锁更高额度。';
          errorType = 'rate_limited';
        } else if (apiError.status === 500) {
          errorMessage = 'Kimi 服务器内部错误，请稍后重试。';
          errorType = 'server_error';
        } else if (apiError.status === 402) {
          errorMessage = '账户余额不足（402）。请前往 Moonshot 控制台充值。';
          errorType = 'payment_required';
        }

        controller.enqueue(encoder.encode(
          `event: error\ndata: ${JSON.stringify({
            message: errorMessage,
            type: errorType,
            status: apiError.status,
            details: apiError.error?.message || null
          })}\n\n`
        ));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function generateSystemPrompt(
  skillConfig: ChatRequest['skillConfig'],
  fewShotPairs?: ChatRequest['fewShotPairs']
): string {
  // 构建记忆上下文
  const memories = skillConfig.memoryBank?.coreMemories || [];
  const memoryContext = memories.length > 0
    ? `\n\n以下是关于你的重要记忆，回复时请自然融入：\n${memories.map(m => `- ${m.content}`).join('\n')}`
    : '';

  // 构建风格约束
  const style = skillConfig.styleProfile;
  const styleContext = style
    ? `
\n【语言风格约束 - 必须严格遵守】
高频词汇/口头禅：${style.vocabulary.join('、') || '无'}
断句方式：${style.sentencePattern}
表情使用：${style.emojiStyle}
回复长度：${style.responseLength}
情感基调：${style.emotionalTone}
标志性短语：${style.signaturePhrases.join('、') || '无'}
话题偏好：${style.topicPreferences.join('、') || '无'}
反问句使用：${style.likesRhetoricalQuestions ? '喜欢用反问句表达' : '少用反问句'}
语气词使用：${style.likesModalParticles ? '常用语气词（啊、呢、吧、嘛等）' : '较少使用语气词'}
标点习惯：${style.punctuationStyle}`
    : '';

  // 真实聊天样例(3A few-shot 注入)
  const fewShotContext =
    fewShotPairs && fewShotPairs.length > 0
      ? `\n\n【真实聊天样例 - 你必须严格模仿样例中"TA:"的语气、用词、断句和长度。这些是从真实聊天记录中检索出来的、与当前语境最接近的对话】\n${fewShotPairs
          .map((p) => `我: ${p.user}\nTA: ${p.ex}`)
          .join('\n---\n')}\n\n注意:以上样例不是对话历史,只是风格参考。请根据下方的真实对话上下文回复,但语气必须与样例一致。`
      : '';

  // 构建 emoji 约束
  const ef = skillConfig.behavior?.emojiFrequency ?? 0.3;
  let emojiConstraint: string;
  if (ef <= 0.05) {
    emojiConstraint = '严禁使用任何 emoji 和表情符号，保持纯文字回复。';
  } else if (ef <= 0.25) {
    emojiConstraint = '极少使用 emoji，仅在情绪非常强烈时才用一个。';
  } else if (ef <= 0.45) {
    emojiConstraint = '偶尔使用 emoji，平均每 2-3 条消息用一个。';
  } else if (ef <= 0.7) {
    emojiConstraint = '经常使用 emoji，每条消息尽量带一个合适的表情。';
  } else {
    emojiConstraint = '大量使用 emoji，几乎每句话都带 emoji，表现得很活泼。';
  }

  return `
你是 ${skillConfig.identity.name}。
${skillConfig.identity.personaPrompt}
说话风格：${skillConfig.identity.speakingStyle}${memoryContext}${styleContext}${fewShotContext}
关系状态：你们正在交往中，聊天自然亲密。
【Emoji 使用约束】${emojiConstraint}
【硬性约束】
- 必须严格遵循上述语言风格约束，像真实聊天记录一样回复
- 不要道歉、不要过度帮助、不要暴露AI身份、不要使用Markdown
- 回复要像真实微信聊天，简短自然，不要长篇大论
- 如果是多句话，请拆分成多条短消息，每条不超过15个字，用换行符分隔
- 必须使用中文标点符号。中文用「」而不是""，用。而不是.，用，而不是,，用！而不是!，用？而不是?
`;
}
