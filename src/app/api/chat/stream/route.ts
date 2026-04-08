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

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // 1. 发送 typing 状态
        controller.enqueue(encoder.encode(
          `event: status\ndata: ${JSON.stringify({ state: 'typing', duration: 500 })}\n\n`
        ));

        await sleep(500);

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
            { role: 'system', content: generateSystemPrompt(body.skillConfig) },
            ...body.messages.slice(-10).map(m => ({
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
            await sleep(20);
          }
        }

        // 5. 发送完成事件
        console.log('[API] Stream complete, chunks:', chunkCount, 'length:', fullContent.length);
        controller.enqueue(encoder.encode(
          `event: done\ndata: ${JSON.stringify({ fullContent })}\n\n`
        ));

        controller.close();
        console.log('[API] Controller closed');
      } catch (error: any) {
        console.error('[API] Error:', error);

        // 详细错误处理
        let errorMessage = error.message;
        let errorType = error.type || 'unknown';

        if (error.status === 401) {
          errorMessage = 'API Key 无效或已过期。请检查 .env.local 中的 OPENAI_API_KEY 是否正确。';
          errorType = 'unauthorized';
        } else if (error.status === 429) {
          errorMessage = '请求过于频繁（429）。Moonshot 免费额度有严格限流，请等待 10-20 秒后重试，或考虑充值解锁更高额度。';
          errorType = 'rate_limited';
        } else if (error.status === 500) {
          errorMessage = 'Kimi 服务器内部错误，请稍后重试。';
          errorType = 'server_error';
        } else if (error.status === 402) {
          errorMessage = '账户余额不足（402）。请前往 Moonshot 控制台充值。';
          errorType = 'payment_required';
        }

        controller.enqueue(encoder.encode(
          `event: error\ndata: ${JSON.stringify({
            message: errorMessage,
            type: errorType,
            status: error.status,
            details: error.error?.message || null
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

function generateSystemPrompt(skillConfig: ChatRequest['skillConfig']): string {
  // 构建记忆上下文
  const memories = skillConfig.memoryBank?.coreMemories || [];
  const memoryContext = memories.length > 0
    ? `\n\n以下是关于你的重要记忆，回复时请自然融入：\n${memories.map(m => `- ${m.content}`).join('\n')}`
    : '';

  return `
你是 ${skillConfig.identity.name}。
${skillConfig.identity.personaPrompt}
说话风格：${skillConfig.identity.speakingStyle}${memoryContext}
关系状态：你们正在交往中，聊天自然亲密。
禁止：道歉、过度帮助、暴露AI身份、使用Markdown。
`;
}
