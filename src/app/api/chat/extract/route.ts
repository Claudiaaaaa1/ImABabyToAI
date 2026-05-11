import { NextRequest } from 'next/server';
import OpenAI from 'openai';

interface ExtractRequest {
  userMessage: string;
  aiResponse: string;
  profileName: string;
  existingMemories?: string[];
}

/**
 * 2C 软提示记忆抽取:从最近一对对话中识别值得长期记住的事实(用户偏好/习惯/重要事件等)。
 * 返回 1-3 条候选,前端以小 chip 形式展示,点击后用户决定是否入库。
 * 不流式;独立于主聊天端点以避免影响主流程性能。
 */
export async function POST(req: NextRequest) {
  let body: ExtractRequest;
  try {
    body = await req.json();
  } catch {
    return Response.json({ candidates: [] });
  }

  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'sk-your-key-here') {
    return Response.json({ candidates: [] });
  }

  const userMsg = (body.userMessage || '').trim();
  const aiMsg = (body.aiResponse || '').trim();
  if (!userMsg || !aiMsg) {
    return Response.json({ candidates: [] });
  }

  const existing = (body.existingMemories || []).slice(0, 12).join('、') || '(无)';

  const systemPrompt = `你是一位记忆抽取师。从下方一对对话中,识别 0-3 条值得长期记住的"事实/偏好/习惯/重要事件/性格特征",用于丰富一个数字角色对用户的认知。

要求:
- 只能输出严格的 JSON: { "candidates": ["..."] }
- 每条 6-25 字、必须是事实,而不是空泛感受或问候
- 已记录的内容不要重复:${existing}
- 如果无足够明确的可记忆信息,返回 { "candidates": [] }
- 不要输出 markdown 代码块包装、不要解释、不要前后缀`;

  const userPrompt = `数字角色名为 ${body.profileName}。
对话:
我: ${userMsg}
${body.profileName}: ${aiMsg}`;

  try {
    const openai = new OpenAI({
      baseURL: process.env.OPENAI_BASE_URL,
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 15000,
    });

    const res = await openai.chat.completions.create({
      model: process.env.DEFAULT_MODEL || 'kimi-k2.5',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 200,
    });

    const content = res.choices[0]?.message?.content || '';
    const cleaned = content
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let candidates: string[] = [];
    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed.candidates)) {
        candidates = parsed.candidates
          .filter((c: unknown): c is string => typeof c === 'string')
          .map((c: string) => c.trim())
          .filter((c: string) => c.length > 0 && c.length <= 60)
          .slice(0, 3);
      }
    } catch {
      // 解析失败 -> 空数组
    }

    return Response.json({ candidates });
  } catch (err) {
    console.error('[Extract] error:', err);
    return Response.json({ candidates: [] });
  }
}
