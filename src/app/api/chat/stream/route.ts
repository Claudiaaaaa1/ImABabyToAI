import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { ChatRequest } from '@/types';

export async function POST(req: NextRequest) {
  const body: ChatRequest = await req.json();

  // 调试：检查环境变量
  console.log('[API] OPENAI_BASE_URL:', process.env.OPENAI_BASE_URL);
  console.log('[API] OPENAI_API_KEY exists:', !!process.env.OPENAI_API_KEY);
  console.log('[API] OPENAI_API_KEY length:', process.env.OPENAI_API_KEY?.length);
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
          `event: status\ndata: ${JSON.stringify({ state: 'typing', duration: 1500 })}\n\n`
        ));

        await sleep(1500); // 模拟"正在输入"延迟

        // 2. 初始化 OpenAI 客户端（在请求内确保环境变量已加载）
        const openai = new OpenAI({
          baseURL: process.env.OPENAI_BASE_URL,
          apiKey: process.env.OPENAI_API_KEY,
        });

        // 3. 调用 Kimi API
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
      });

      // 3. 流式转发
      let isFirst = true;
      let fullContent = '';

      for await (const chunk of response) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullContent += content;
          controller.enqueue(encoder.encode(
            `event: delta\ndata: ${JSON.stringify({ content, isFirst })}\n\n`
          ));
          isFirst = false;
          await sleep(50); // 模拟打字速度
        }
      }

        // 4. 发送完成事件
        controller.enqueue(encoder.encode(
          `event: done\ndata: ${JSON.stringify({ fullContent })}\n\n`
        ));

        controller.close();
      } catch (error: any) {
        console.error('[API] Error:', error);
        controller.enqueue(encoder.encode(
          `event: error\ndata: ${JSON.stringify({ message: error.message, type: error.type })}\n\n`
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
  return `
你是 ${skillConfig.identity.name}。
${skillConfig.identity.personaPrompt}
说话风格：${skillConfig.identity.speakingStyle}
禁止：道歉、过度帮助、暴露AI身份、使用Markdown。
`;
}
