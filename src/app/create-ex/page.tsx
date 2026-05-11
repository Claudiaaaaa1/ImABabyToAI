'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfileStore } from '@/stores/useProfileStore';
import { ExSkillConfig, ChatStyleProfile, ExQAPair } from '@/types';
import { parseAllChatRecords } from '@/lib/chatRecordParser';
import { Upload, MessageSquare, Image as ImageIcon, Mic, FileText, X, ChevronRight, ChevronLeft } from 'lucide-react';

type Step = 1 | 2 | 3 | 4;

interface Material {
  id: string;
  type: 'chat' | 'photo' | 'audio' | 'memory';
  name: string;
  content?: string;
  file?: File;
}

export default function CreateExPage() {
  const router = useRouter();
  const { createProfile } = useProfileStore();
  const [step, setStep] = useState<Step>(1);
  const [isGenerating, setIsGenerating] = useState(false);

  // Step 1: 基本信息
  const [basicInfo, setBasicInfo] = useState({
    name: '',
    relationshipDuration: '',
    breakupReason: '',
    personality: '',
  });

  // Step 2: 素材
  const [materials, setMaterials] = useState<Material[]>([]);
  const [memoryText, setMemoryText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 3: 生成预览
  const [generatedConfig, setGeneratedConfig] = useState<ExSkillConfig | null>(null);
  const [previewMessages, setPreviewMessages] = useState<Array<{role: 'user' | 'ex', content: string}>>([]);
  // 3A:从上传的聊天记录解析出的"前任原话"和对话对,在保存时附加到 profile
  const [extracted, setExtracted] = useState<{ samples: string[]; pairs: ExQAPair[] } | null>(null);

  const canProceed = () => {
    switch (step) {
      case 1:
        return basicInfo.name.trim() && basicInfo.personality.trim();
      case 2:
        return true; // 素材可选
      case 3:
        return generatedConfig !== null;
      default:
        return true;
    }
  };

  const handleAddMaterial = (type: Material['type']) => {
    if (type === 'memory') {
      if (memoryText.trim()) {
        setMaterials([...materials, {
          id: Date.now().toString(),
          type: 'memory',
          name: '口述回忆',
          content: memoryText,
        }]);
        setMemoryText('');
      }
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      const type: Material['type'] = file.type.startsWith('image/') ? 'photo' :
                                     file.type.startsWith('audio/') ? 'audio' : 'chat';

      let content: string | undefined;

      // 聊天记录文件：读取文本内容并解析
      if (type === 'chat' && (file.name.endsWith('.txt') || file.type === 'text/plain')) {
        try {
          content = await file.text();
          // 限制解析长度，避免超大文件
          if (content.length > 500000) {
            content = content.slice(0, 500000);
          }
        } catch {
          content = undefined;
        }
      }

      setMaterials(prev => [...prev, {
        id: Date.now().toString() + Math.random(),
        type,
        name: file.name,
        file,
        content,
      }]);
    }
  };

  const removeMaterial = (id: string) => {
    setMaterials(materials.filter(m => m.id !== id));
  };

  // 分析聊天记录/回忆素材的语言风格
  const analyzeChatStyle = async (): Promise<ChatStyleProfile | null> => {
    const textMaterials = materials
      .filter(m => m.type === 'chat' || m.type === 'memory')
      .map(m => {
        if (m.type === 'memory') return m.content;
        // chat 类型：如果有解析后的真实内容，用内容；否则用文件名
        if (m.content) {
          const excerpt = m.content.slice(0, 3000);
          return `\n[聊天记录: ${m.name}]\n${excerpt}${m.content.length > 3000 ? '\n...(已截断)' : ''}`;
        }
        return `\n[文件: ${m.name}]\n（请根据文件名推测可能的聊天内容风格）`;
      })
      .filter(Boolean)
      .join('\n---\n');

    if (!textMaterials.trim()) return null;

    const stylePrompt = `你是一位语言风格分析师。请仔细分析以下聊天记录/回忆素材，提取说话者的语言风格特征。

要求：输出必须是严格的 JSON 格式，不要有任何其他文字。

JSON 结构：
{
  "vocabulary": ["高频词1", "高频词2"],
  "sentencePattern": "短句为主/长句为主/混合",
  "emojiStyle": "微信自带表情/Emoji/不用表情/偶尔用",
  "responseLength": "极短(1-5字)/短(6-15字)/中等(16-40字)/较长",
  "emotionalTone": "平淡/热情/冷淡/撒娇/傲娇/温柔等",
  "signaturePhrases": ["口头禅1", "口头禅2"],
  "topicPreferences": ["话题1", "话题2"],
  "replyDelaySeconds": 120,
  "likesRhetoricalQuestions": true,
  "likesModalParticles": true,
  "punctuationStyle": "爱用句号/爱用省略号/不爱标点/混合"
}

分析素材：
${textMaterials}

注意：
- 如果素材是文件名而非内容，请根据常见聊天记录风格合理推断
- vocabulary 最多8个词
- signaturePhrases 最多5个
- 所有字符串值用中文
- 输出必须是可以直接 JSON.parse 的纯 JSON，不要加 markdown 代码块标记`;

    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{
          id: 'style',
          localId: 'style',
          sender: { id: 'me', name: '我', avatar: '/me-avatar.svg' },
          content: { type: 'text', text: stylePrompt },
          meta: { timestamp: Date.now(), isRead: true, isRecalled: false, sendStatus: 'sent' },
        }],
        skillConfig: {
          identity: {
            name: '风格分析师',
            avatar: '/analyst.png',
            personaPrompt: '你是一位专业的语言风格分析师，擅长从聊天记录中提取说话特征。你必须只输出 JSON 格式，不要有任何解释性文字。',
            speakingStyle: '结构化、JSON输出',
          },
          memoryBank: { coreMemories: [] },
          behavior: {
            responseDelay: { min: 500, max: 1000 },
            typingSpeed: 20,
            emojiFrequency: 0,
            readReceiptDelay: 500,
          },
        },
        context: { timeOfDay: 'afternoon', conversationTurn: 1 },
      }),
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n\n');
        for (const line of lines) {
          if (!line.startsWith('event:')) continue;
          const dataLine = line.split('\n')[1];
          if (!dataLine) continue;
          const eventType = line.split('\n')[0].replace('event:', '').trim();
          const data = JSON.parse(dataLine.replace('data:', '').trim());
          if (eventType === 'delta') fullContent += data.content;
        }
      }
    }

    // 清理 JSON，去除可能的 markdown 代码块标记
    const cleaned = fullContent
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      const parsed = JSON.parse(cleaned);
      return {
        vocabulary: Array.isArray(parsed.vocabulary) ? parsed.vocabulary : [],
        sentencePattern: parsed.sentencePattern || '自然表达',
        emojiStyle: parsed.emojiStyle || '偶尔使用表情',
        responseLength: parsed.responseLength || '中等',
        emotionalTone: parsed.emotionalTone || '温柔',
        signaturePhrases: Array.isArray(parsed.signaturePhrases) ? parsed.signaturePhrases : [],
        topicPreferences: Array.isArray(parsed.topicPreferences) ? parsed.topicPreferences : [],
        replyDelaySeconds: typeof parsed.replyDelaySeconds === 'number' ? parsed.replyDelaySeconds : 120,
        likesRhetoricalQuestions: !!parsed.likesRhetoricalQuestions,
        likesModalParticles: !!parsed.likesModalParticles,
        punctuationStyle: parsed.punctuationStyle || '自然',
      };
    } catch (e) {
      console.error('风格分析 JSON 解析失败:', e, '原始内容:', fullContent);
      return null;
    }
  };

  const generatePersona = async () => {
    setIsGenerating(true);

    try {
      // 3A 预处理:从已上传的聊天记录中解析出"前任原话"和对话对,稍后随 profile 一起保存
      const chatTexts = materials
        .filter((m) => m.type === 'chat' && m.content)
        .map((m) => m.content as string);
      const memoryTexts = materials
        .filter((m) => m.type === 'memory' && m.content)
        .map((m) => `TA: ${m.content}`);
      const allTextsForParsing = [...chatTexts, ...memoryTexts];
      const parsed = allTextsForParsing.length > 0
        ? parseAllChatRecords(allTextsForParsing)
        : { samples: [], pairs: [] };
      setExtracted(parsed);

      // Step 1: 如果有聊天记录/回忆素材，先分析语言风格
      const styleProfile = await analyzeChatStyle();

      // 构建提示词
      const materialsDesc = materials.map(m => {
        if (m.type === 'chat') {
          if (m.content) {
            const excerpt = m.content.slice(0, 5000);
            return `[聊天记录: ${m.name}]\n${excerpt}${m.content.length > 5000 ? '\n...(已截断)' : ''}`;
          }
          return `[聊天记录: ${m.name}]`;
        }
        if (m.type === 'photo') return `[照片: ${m.name}]`;
        if (m.type === 'audio') return `[语音: ${m.name}]`;
        if (m.type === 'memory') return `[回忆: ${m.content}]`;
        return '';
      }).join('\n');

      const styleDesc = styleProfile
        ? `
【已分析的语言风格档案】（生成角色时必须严格遵守）
- 高频词汇：${styleProfile.vocabulary.join('、')}
- 断句方式：${styleProfile.sentencePattern}
- 表情使用：${styleProfile.emojiStyle}
- 回复长度：${styleProfile.responseLength}
- 情感基调：${styleProfile.emotionalTone}
- 标志性短语：${styleProfile.signaturePhrases.join('、')}
- 话题偏好：${styleProfile.topicPreferences.join('、')}
- 反问句偏好：${styleProfile.likesRhetoricalQuestions ? '爱用反问' : '少用反问'}
- 语气词偏好：${styleProfile.likesModalParticles ? '爱用语气词' : '少用语气词'}
- 标点习惯：${styleProfile.punctuationStyle}`
        : '';

      const prompt = `你是专业的角色设计师，要基于用户提供的真实信息，生成一个鲜活的数字前任角色。

【用户提供的输入】（你必须深度反映，绝对不能用空泛的"前任"模板代替）
- 名字：${basicInfo.name}
- 交往时长：${basicInfo.relationshipDuration || '未说明'}
- 性格特点：${basicInfo.personality}
${basicInfo.breakupReason ? `- 分手原因（仅作背景，角色本人不知道）：${basicInfo.breakupReason}` : ''}

【重要设定】
这个角色不知道自己已经分手了，仍活在恋爱关系中。
${styleDesc}

【素材】
${materialsDesc || '无额外素材'}

【输出要求】
必须严格输出以下结构的 JSON，不要 markdown 代码块标记，不要任何解释文字。

JSON 结构：
{
  "personaPrompt": "完整的角色人格描述。要点：1) 必须把上面的'性格特点'融入文字（${basicInfo.personality}）；2) 包括背景、性格、与我的关系；3) 强调'你不知道你们已经分手'；4) 200-400字；5) 直接以'你是${basicInfo.name}'开头。",
  "speakingStyle": "用15-30字描述说话特征，要具体（例：'内向慢热，爱用句号收尾，偶尔会突然撒娇'），不要写'自然、真实'这种空话",
  "quotes": ["3-5条该角色风格的口头禅或短句"]
}

注意：
- 所有字符串值用中文
- personaPrompt 必须深度反映 "${basicInfo.personality}"，否则输出无效
- 输出必须是可以直接 JSON.parse 的纯 JSON，不要加任何前后缀`;

      // 调用 API 生成
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            id: 'gen',
            localId: 'gen',
            sender: { id: 'me', name: '我', avatar: '/me-avatar.svg' },
            content: { type: 'text', text: prompt },
            meta: { timestamp: Date.now(), isRead: true, isRecalled: false, sendStatus: 'sent' },
          }],
          skillConfig: {
            identity: {
              name: '角色设计师',
              avatar: '/designer.png',
              personaPrompt: '你是一个专业的角色设计师。你必须严格输出 JSON 格式，不要有任何解释性文字、markdown 代码块标记或前后缀。你设计的角色必须深度反映用户提供的性格特点，绝不能输出空泛模板。',
              speakingStyle: '结构化、JSON输出',
            },
            memoryBank: { coreMemories: [] },
            behavior: {
              responseDelay: { min: 500, max: 1000 },
              typingSpeed: 20,
              emojiFrequency: 0,
              readReceiptDelay: 500,
            },
          },
          context: { timeOfDay: 'afternoon', conversationTurn: 1 },
        }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n\n');
          for (const line of lines) {
            if (!line.startsWith('event:')) continue;
            const dataLine = line.split('\n')[1];
            if (!dataLine) continue;
            const eventType = line.split('\n')[0].replace('event:', '').trim();
            const data = JSON.parse(dataLine.replace('data:', '').trim());
            if (eventType === 'delta') fullContent += data.content;
          }
        }
      }

      // 解析生成的内容创建 SkillConfig
      console.log('[CreateEx] AI 原始返回:', fullContent);
      const config = parseGeneratedContent(fullContent, basicInfo, styleProfile);
      setGeneratedConfig(config);

      // 生成预览对话
      setPreviewMessages([
        { role: 'user', content: '在干嘛呢' },
        { role: 'ex', content: '刚下班，累死了。你呢？' },
      ]);

      setStep(3);
    } catch (err) {
      console.error('生成失败:', err);
      alert('生成失败，请重试');
    } finally {
      setIsGenerating(false);
    }
  };

  const parseGeneratedContent = (
    content: string,
    info: { name: string; relationshipDuration: string; breakupReason: string; personality: string },
    styleProfile: ChatStyleProfile | null
  ): ExSkillConfig => {
    let persona = '';
    let style = '';
    let quotes: string[] = [];

    // 1. 优先按 JSON 解析（提示词要求模型严格输出 JSON）
    const cleaned = content
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    try {
      const parsed = JSON.parse(cleaned);
      if (typeof parsed.personaPrompt === 'string') persona = parsed.personaPrompt.trim();
      if (typeof parsed.speakingStyle === 'string') style = parsed.speakingStyle.trim();
      if (Array.isArray(parsed.quotes)) {
        quotes = parsed.quotes
          .filter((q: unknown): q is string => typeof q === 'string')
          .map((q: string) => q.trim())
          .filter(Boolean)
          .slice(0, 5);
      }
    } catch {
      // JSON 解析失败，进入正则兜底
    }

    // 2. 兼容旧的中文小标题输出格式
    if (!persona) {
      const personaMatch = content.match(/人格描述[:：]([\s\S]*?)(?=说话风格|经典语录|$)/i);
      persona = personaMatch?.[1]?.trim() || '';
    }
    if (!style) {
      const styleMatch = content.match(/说话风格[:：]([\s\S]*?)(?=经典语录|$)/i);
      style = styleMatch?.[1]?.trim() || '';
    }
    if (quotes.length === 0) {
      const quotesMatch = content.match(/经典语录[:：]([\s\S]*)/i);
      quotes =
        quotesMatch?.[1]
          ?.split(/\n/)
          .map((q) => q.replace(/^[\d\-*•·.\s]+/, '').trim())
          .filter(Boolean)
          .slice(0, 5) || [];
    }

    // 3. 最终兜底：绝不使用空泛模板，把用户真实输入拼成有意义的人格设定
    if (!persona) {
      const durationLine = info.relationshipDuration ? `我们交往了 ${info.relationshipDuration}。` : '';
      persona = `你是${info.name}。${durationLine}你的性格特点：${info.personality}。你不知道我们已经分手了，仍然认为我们正在恋爱中，继续以日常恋人的语气和我聊天。`;
    }
    if (!style) {
      style = info.personality.length > 30 ? info.personality.slice(0, 30) + '…' : info.personality;
    }

    const config: ExSkillConfig = {
      identity: {
        name: info.name,
        avatar: '/default-ex.png',
        personaPrompt: persona,
        speakingStyle: style,
      },
      memoryBank: {
        coreMemories: quotes.map((q, i) => ({
          id: `quote-${i}`,
          content: q.replace(/^[\d\-*•·.\s]+/, '').trim(),
          weight: 0.8,
        })),
      },
      behavior: {
        responseDelay: { min: 200, max: 1500 },
        typingSpeed: 50,
        emojiFrequency: 0.3,
        readReceiptDelay: 2000,
      },
    };

    // 如果分析了风格档案，追加进去
    if (styleProfile) {
      config.styleProfile = styleProfile;
      // 同时把风格特征融入人格 prompt，形成双重约束
      config.identity.personaPrompt += `

【语言风格要求 - 这是根据真实聊天记录分析出的，必须严格遵守】
- 你的高频词汇：${styleProfile.vocabulary.join('、')}
- 你的断句方式：${styleProfile.sentencePattern}
- 你的表情使用习惯：${styleProfile.emojiStyle}
- 你的回复长度：${styleProfile.responseLength}
- 你的情感基调：${styleProfile.emotionalTone}
- 你的口头禅：${styleProfile.signaturePhrases.join('、')}
- 你偏好的话题：${styleProfile.topicPreferences.join('、')}
- 反问句：${styleProfile.likesRhetoricalQuestions ? '经常使用反问句' : '少用反问句'}
- 语气词：${styleProfile.likesModalParticles ? '经常使用语气词（啊、呢、吧、嘛）' : '少用语气词'}
- 标点习惯：${styleProfile.punctuationStyle}
`;
    }

    return config;
  };

  const saveAndStart = async () => {
    if (generatedConfig) {
      await createProfile(generatedConfig, {
        exSamples: extracted?.samples,
        exQAPairs: extracted?.pairs,
      });
      router.push('/');
    }
  };

  const renderStep1 = () => (
    <div className="space-y-6">
      <div>
        <label className="block text-sm text-[var(--wx-text-secondary)] mb-2">前任名字 *</label>
        <input
          type="text"
          value={basicInfo.name}
          onChange={(e) => setBasicInfo({...basicInfo, name: e.target.value})}
          placeholder="例如：小雨"
          className="w-full px-4 py-3 bg-[var(--wx-bg-secondary)] border border-[var(--wx-border)] rounded-lg outline-none focus:border-[var(--wx-bubble-me)]"
        />
      </div>

      <div>
        <label className="block text-sm text-[var(--wx-text-secondary)] mb-2">交往时长</label>
        <input
          type="text"
          value={basicInfo.relationshipDuration}
          onChange={(e) => setBasicInfo({...basicInfo, relationshipDuration: e.target.value})}
          placeholder="例如：3年"
          className="w-full px-4 py-3 bg-[var(--wx-bg-secondary)] border border-[var(--wx-border)] rounded-lg outline-none focus:border-[var(--wx-bubble-me)]"
        />
      </div>

      <div>
        <label className="block text-sm text-[var(--wx-text-secondary)] mb-2">分手原因（仅记录，不告诉 TA）</label>
        <input
          type="text"
          value={basicInfo.breakupReason}
          onChange={(e) => setBasicInfo({...basicInfo, breakupReason: e.target.value})}
          placeholder="例如：异地、性格不合..."
          className="w-full px-4 py-3 bg-[var(--wx-bg-secondary)] border border-[var(--wx-border)] rounded-lg outline-none focus:border-[var(--wx-bubble-me)]"
        />
        <p className="mt-1 text-xs text-[var(--wx-text-secondary)]">这个数字人不知道已经分手了，它还活在恋爱时间线里</p>
      </div>

      <div>
        <label className="block text-sm text-[var(--wx-text-secondary)] mb-2">性格特点 *</label>
        <textarea
          value={basicInfo.personality}
          onChange={(e) => setBasicInfo({...basicInfo, personality: e.target.value})}
          placeholder="例如：内向但粘人，爱吃醋，喜欢发emoji，说话比较直..."
          className="w-full h-32 px-4 py-3 bg-[var(--wx-bg-secondary)] border border-[var(--wx-border)] rounded-lg outline-none focus:border-[var(--wx-bubble-me)] resize-none"
        />
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <p className="text-sm text-[var(--wx-text-secondary)]">
        上传与前任相关的素材，AI 会学习 TA 的说话风格和记忆。此步骤可选。
      </p>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => handleAddMaterial('chat')}
          className="p-4 bg-[var(--wx-bg-secondary)] border border-[var(--wx-border)] rounded-lg hover:border-[var(--wx-bubble-me)] transition text-left"
        >
          <MessageSquare className="w-6 h-6 mb-2 text-[var(--wx-bubble-me)]" />
          <div className="font-medium">聊天记录</div>
          <div className="text-xs text-[var(--wx-text-secondary)]">微信/QQ 导出</div>
        </button>

        <button
          onClick={() => handleAddMaterial('photo')}
          className="p-4 bg-[var(--wx-bg-secondary)] border border-[var(--wx-border)] rounded-lg hover:border-[var(--wx-bubble-me)] transition text-left"
        >
          <ImageIcon className="w-6 h-6 mb-2 text-[var(--wx-bubble-me)]" />
          <div className="font-medium">照片</div>
          <div className="text-xs text-[var(--wx-text-secondary)]">朋友圈/合影</div>
        </button>

        <button
          onClick={() => handleAddMaterial('audio')}
          className="p-4 bg-[var(--wx-bg-secondary)] border border-[var(--wx-border)] rounded-lg hover:border-[var(--wx-bubble-me)] transition text-left"
        >
          <Mic className="w-6 h-6 mb-2 text-[var(--wx-bubble-me)]" />
          <div className="font-medium">语音</div>
          <div className="text-xs text-[var(--wx-text-secondary)]">语音消息</div>
        </button>

        <button
          onClick={() => handleAddMaterial('memory')}
          className="p-4 bg-[var(--wx-bg-secondary)] border border-[var(--wx-border)] rounded-lg hover:border-[var(--wx-bubble-me)] transition text-left"
        >
          <FileText className="w-6 h-6 mb-2 text-[var(--wx-bubble-me)]" />
          <div className="font-medium">口述回忆</div>
          <div className="text-xs text-[var(--wx-text-secondary)]">文字描述</div>
        </button>
      </div>

      {/* 口述输入 */}
      {materials.filter(m => m.type === 'memory').length === 0 && (
        <div className="bg-[var(--wx-bg-secondary)] border border-[var(--wx-border)] rounded-lg p-4">
          <label className="block text-sm text-[var(--wx-text-secondary)] mb-2">
            或者，直接描述 TA：
          </label>
          <textarea
            value={memoryText}
            onChange={(e) => setMemoryText(e.target.value)}
            placeholder="TA 最爱吃什么？口头禅是什么？吵架时会说什么？有什么特别的习惯？"
            className="w-full h-24 px-3 py-2 bg-[var(--wx-bg-tertiary)] rounded outline-none resize-none text-sm"
          />
          <button
            onClick={() => handleAddMaterial('memory')}
            disabled={!memoryText.trim()}
            className="mt-2 px-4 py-1.5 bg-[var(--wx-bubble-me)] text-black text-sm rounded disabled:opacity-50"
          >
            添加回忆
          </button>
        </div>
      )}

      {/* 已添加素材列表 */}
      {materials.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">已添加素材</h3>
          {materials.map(m => (
            <div key={m.id} className="flex items-center justify-between p-3 bg-[var(--wx-bg-secondary)] rounded-lg">
              <div className="flex items-center gap-2 min-w-0">
                {m.type === 'chat' && <MessageSquare className="w-4 h-4 flex-shrink-0" />}
                {m.type === 'photo' && <ImageIcon className="w-4 h-4 flex-shrink-0" />}
                {m.type === 'audio' && <Mic className="w-4 h-4 flex-shrink-0" />}
                {m.type === 'memory' && <FileText className="w-4 h-4 flex-shrink-0" />}
                <div className="min-w-0">
                  <span className="text-sm truncate block">{m.name}</span>
                  {m.type === 'chat' && m.content && (
                    <span className="text-[11px] text-green-400">
                      已解析 {Math.ceil(m.content.length / 2)} 字符
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => removeMaterial(m.id)}
                className="p-1 hover:bg-[var(--wx-bg-tertiary)] rounded flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".txt,.html,.json,image/*,audio/*"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      {!generatedConfig ? (
        <div className="text-center py-12">
          <div className="animate-spin w-8 h-8 border-2 border-[var(--wx-bubble-me)] border-t-transparent rounded-full mx-auto mb-4" />
          <p>AI 正在分析素材，生成角色设定...</p>
        </div>
      ) : (
        <>
          {/* 可编辑角色预览 */}
          <div className="bg-[var(--wx-bg-secondary)] border border-[var(--wx-border)] rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">角色设定</h3>
              <span className="text-xs text-[var(--wx-text-secondary)]">可手动调整</span>
            </div>

            <div>
              <label className="block text-xs text-[var(--wx-text-secondary)] mb-1">名字</label>
              <input
                type="text"
                value={generatedConfig.identity.name}
                onChange={(e) => setGeneratedConfig({
                  ...generatedConfig,
                  identity: { ...generatedConfig.identity, name: e.target.value }
                })}
                className="w-full px-3 py-2 bg-[var(--wx-bg-tertiary)] border border-[var(--wx-border)] rounded-lg outline-none focus:border-[var(--wx-bubble-me)] text-sm"
              />
            </div>

            <div>
              <label className="block text-xs text-[var(--wx-text-secondary)] mb-1">说话风格</label>
              <input
                type="text"
                value={generatedConfig.identity.speakingStyle}
                onChange={(e) => setGeneratedConfig({
                  ...generatedConfig,
                  identity: { ...generatedConfig.identity, speakingStyle: e.target.value }
                })}
                className="w-full px-3 py-2 bg-[var(--wx-bg-tertiary)] border border-[var(--wx-border)] rounded-lg outline-none focus:border-[var(--wx-bubble-me)] text-sm"
              />
            </div>

            <div>
              <label className="block text-xs text-[var(--wx-text-secondary)] mb-1">人格设定</label>
              <textarea
                value={generatedConfig.identity.personaPrompt}
                onChange={(e) => setGeneratedConfig({
                  ...generatedConfig,
                  identity: { ...generatedConfig.identity, personaPrompt: e.target.value }
                })}
                rows={6}
                className="w-full px-3 py-2 bg-[var(--wx-bg-tertiary)] border border-[var(--wx-border)] rounded-lg outline-none focus:border-[var(--wx-bubble-me)] text-sm resize-none"
              />
            </div>
          </div>

          {/* 3A 检索池预览 */}
          {extracted && (extracted.samples.length > 0 || extracted.pairs.length > 0) && (
            <div className="bg-[var(--wx-bg-secondary)] border border-[var(--wx-border)] rounded-lg p-4 text-sm">
              <h3 className="font-medium mb-2 flex items-center gap-2">
                <span>🎯 真实样例库</span>
                <span className="text-xs px-2 py-0.5 bg-[var(--wx-bubble-me)] text-black rounded-full">Few-shot</span>
              </h3>
              <p className="text-[var(--wx-text-secondary)] mb-2">
                已从聊天记录提取 <span className="text-white">{extracted.pairs.length}</span> 条对话对、
                <span className="text-white">{extracted.samples.length}</span> 条 TA 原话。
                聊天时会按语境自动检索 5 条最贴近的样例,作为 Few-shot 注入,让说话方式更像 TA。
              </p>
              {extracted.samples.slice(0, 3).map((s, i) => (
                <p key={i} className="text-[var(--wx-text-secondary)] mt-1 text-xs italic">「…{s}」</p>
              ))}
            </div>
          )}

          {/* 风格档案 - 只读展示 */}
          {generatedConfig.styleProfile && (
            <div className="bg-[var(--wx-bg-secondary)] border border-[var(--wx-border)] rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium flex items-center gap-2">
                  <span>📋 已分析的语言风格档案</span>
                  <span className="text-xs px-2 py-0.5 bg-[var(--wx-bubble-me)] text-black rounded-full">AI 分析</span>
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <p><span className="text-[var(--wx-text-secondary)]">口头禅：</span>{generatedConfig.styleProfile.signaturePhrases.join('、') || '无'}</p>
                <p><span className="text-[var(--wx-text-secondary)]">情感基调：</span>{generatedConfig.styleProfile.emotionalTone}</p>
                <p><span className="text-[var(--wx-text-secondary)]">断句方式：</span>{generatedConfig.styleProfile.sentencePattern}</p>
                <p><span className="text-[var(--wx-text-secondary)]">回复长度：</span>{generatedConfig.styleProfile.responseLength}</p>
                <p><span className="text-[var(--wx-text-secondary)]">表情使用：</span>{generatedConfig.styleProfile.emojiStyle}</p>
                <p><span className="text-[var(--wx-text-secondary)]">语气词：</span>{generatedConfig.styleProfile.likesModalParticles ? '常用' : '少用'}</p>
                <p><span className="text-[var(--wx-text-secondary)]">反问句：</span>{generatedConfig.styleProfile.likesRhetoricalQuestions ? '常用' : '少用'}</p>
                <p><span className="text-[var(--wx-text-secondary)]">标点习惯：</span>{generatedConfig.styleProfile.punctuationStyle}</p>
              </div>
              {generatedConfig.styleProfile.topicPreferences.length > 0 && (
                <p className="mt-2 text-sm">
                  <span className="text-[var(--wx-text-secondary)]">话题偏好：</span>
                  {generatedConfig.styleProfile.topicPreferences.join('、')}
                </p>
              )}
              {generatedConfig.styleProfile.vocabulary.length > 0 && (
                <p className="mt-1 text-sm">
                  <span className="text-[var(--wx-text-secondary)]">高频词：</span>
                  {generatedConfig.styleProfile.vocabulary.join('、')}
                </p>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={generatePersona}
              className="flex-1 py-3 bg-[var(--wx-bg-tertiary)] text-white rounded-lg hover:bg-[var(--wx-bg-secondary)] transition"
            >
              重新生成
            </button>
            <button
              onClick={saveAndStart}
              className="flex-1 py-3 bg-[var(--wx-bubble-me)] text-black font-medium rounded-lg hover:opacity-90 transition"
            >
              开始聊天
            </button>
          </div>
        </>
      )}
    </div>
  );

  const steps = [
    { num: 1, title: '基本信息' },
    { num: 2, title: '上传素材' },
    { num: 3, title: '生成预览' },
  ];

  return (
    <div className="min-h-screen bg-[var(--wx-bg-primary)]">
      {/* Header */}
      <header className="h-16 bg-[var(--wx-bg-secondary)] border-b border-[var(--wx-border)] flex items-center justify-between px-4">
        <h1 className="text-lg font-medium">创建数字前任</h1>
        <Link href="/" className="text-sm text-[var(--wx-text-secondary)] hover:text-white">取消</Link>
      </header>

      {/* Progress */}
      <div className="flex items-center justify-center gap-2 py-4 border-b border-[var(--wx-border)]">
        {steps.map((s, i) => (
          <div key={s.num} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
              step >= s.num ? 'bg-[var(--wx-bubble-me)] text-black' : 'bg-[var(--wx-bg-tertiary)] text-[var(--wx-text-secondary)]'
            }`}>
              {s.num}
            </div>
            <span className={`text-sm ${step >= s.num ? 'text-white' : 'text-[var(--wx-text-secondary)]'}`}>
              {s.title}
            </span>
            {i < steps.length - 1 && <ChevronRight className="w-4 h-4 text-[var(--wx-text-secondary)]" />}
          </div>
        ))}
      </div>

      {/* Content */}
      <main className="max-w-lg mx-auto p-6 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 128px)' }}>
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}

        {/* Navigation */}
        {step < 3 && (
          <div className="flex gap-3 mt-8">
            {step > 1 && (
              <button
                onClick={() => setStep((s) => (s - 1) as Step)}
                className="px-6 py-3 bg-[var(--wx-bg-tertiary)] text-white rounded-lg hover:bg-[var(--wx-bg-secondary)] transition"
              >
                上一步
              </button>
            )}
            <button
              onClick={() => {
                if (step === 2) {
                  generatePersona();
                } else {
                  setStep((s) => (s + 1) as Step);
                }
              }}
              disabled={!canProceed() || isGenerating}
              className="flex-1 py-3 bg-[var(--wx-bubble-me)] text-black font-medium rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {isGenerating ? '生成中...' : step === 2 ? 'AI 生成角色' : '下一步'}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
