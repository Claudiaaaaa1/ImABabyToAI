'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSkillStore } from '@/stores/useSkillStore';
import { ExSkillConfig } from '@/types';
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
  const { setConfig } = useSkillStore();
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const type: Material['type'] = file.type.startsWith('image/') ? 'photo' :
                                     file.type.startsWith('audio/') ? 'audio' : 'chat';
      setMaterials(prev => [...prev, {
        id: Date.now().toString() + Math.random(),
        type,
        name: file.name,
        file,
      }]);
    });
  };

  const removeMaterial = (id: string) => {
    setMaterials(materials.filter(m => m.id !== id));
  };

  const generatePersona = async () => {
    setIsGenerating(true);

    try {
      // 构建提示词
      const materialsDesc = materials.map(m => {
        if (m.type === 'chat') return `[聊天记录: ${m.name}]`;
        if (m.type === 'photo') return `[照片: ${m.name}]`;
        if (m.type === 'audio') return `[语音: ${m.name}]`;
        if (m.type === 'memory') return `[回忆: ${m.content}]`;
        return '';
      }).join('\n');

      const prompt = `基于以下信息，生成一个数字前任的角色设定：

## 基本信息
- 名字：${basicInfo.name}
- 交往时长：${basicInfo.relationshipDuration || '未说明'}
- 性格概述：${basicInfo.personality}

## 重要设定
这个角色不知道自己已经分手了，它还活在恋爱关系中。
聊天时要表现出：
- 自然的亲密关系（撒娇、关心、偶尔吃醋）
- 不知道分手这件事
- 像正常恋爱中那样聊天

## 素材
${materialsDesc || '无额外素材'}

请生成一个详细的角色设定，包括：
1. 完整的人格描述（背景、性格特点、与我的关系，强调你们正在恋爱中）
2. 说话风格（用词习惯、语气、表情使用、回复速度）
3. 3-5个经典语录或口头禅`;

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
              personaPrompt: '你是一个专业的角色设计师，擅长基于真实素材创建生动的数字人角色。输出格式清晰，内容真实自然。',
              speakingStyle: '专业、结构化',
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
      const config = parseGeneratedContent(fullContent, basicInfo.name);
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

  const parseGeneratedContent = (content: string, name: string): ExSkillConfig => {
    // 简化解析，实际应该更健壮
    const personaMatch = content.match(/人格描述[:：]([\s\S]*?)(?=说话风格|经典语录|$)/i);
    const styleMatch = content.match(/说话风格[:：]([\s\S]*?)(?=经典语录|$)/i);
    const quotesMatch = content.match(/经典语录[:：]([\s\S]*)/i);

    const persona = personaMatch?.[1]?.trim() || `${name}，前任`;
    const style = styleMatch?.[1]?.trim() || '自然、真实';
    const quotes = quotesMatch?.[1]?.split(/\n/).filter(q => q.trim()).slice(0, 5) || [];

    return {
      identity: {
        name,
        avatar: '/default-ex.png',
        personaPrompt: `${persona}\n\n说话风格：${style}\n\n你是${name}，正在和前任聊天。`,
        speakingStyle: style,
      },
      memoryBank: {
        coreMemories: quotes.map((q, i) => ({
          id: `quote-${i}`,
          content: q.replace(/^[\d\-\*•]\s*/, '').trim(),
          weight: 0.8,
        })),
      },
      behavior: {
        responseDelay: { min: 1000, max: 3000 },
        typingSpeed: 50,
        emojiFrequency: 0.3,
        readReceiptDelay: 2000,
      },
    };
  };

  const saveAndStart = () => {
    if (generatedConfig) {
      setConfig(generatedConfig);
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
              <div className="flex items-center gap-2">
                {m.type === 'chat' && <MessageSquare className="w-4 h-4" />}
                {m.type === 'photo' && <ImageIcon className="w-4 h-4" />}
                {m.type === 'audio' && <Mic className="w-4 h-4" />}
                {m.type === 'memory' && <FileText className="w-4 h-4" />}
                <span className="text-sm truncate max-w-[200px]">{m.name}</span>
              </div>
              <button
                onClick={() => removeMaterial(m.id)}
                className="p-1 hover:bg-[var(--wx-bg-tertiary)] rounded"
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
          <div className="bg-[var(--wx-bg-secondary)] border border-[var(--wx-border)] rounded-lg p-4">
            <h3 className="font-medium mb-3">角色预览</h3>
            <div className="space-y-2 text-sm">
              <p><span className="text-[var(--wx-text-secondary)]">名字：</span>{generatedConfig.identity.name}</p>
              <p><span className="text-[var(--wx-text-secondary)]">风格：</span>{generatedConfig.identity.speakingStyle}</p>
              <div className="pt-2 border-t border-[var(--wx-border)]">
                <p className="text-[var(--wx-text-secondary)] mb-1">人格设定：</p>
                <p className="text-white/80 text-sm line-clamp-4">{generatedConfig.identity.personaPrompt}</p>
              </div>
            </div>
          </div>

          <div className="bg-[var(--wx-bg-secondary)] border border-[var(--wx-border)] rounded-lg p-4">
            <h3 className="font-medium mb-3">对话预览</h3>
            <div className="space-y-3">
              {previewMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
                    msg.role === 'user'
                      ? 'bg-[var(--wx-bubble-me)] text-black'
                      : 'bg-[var(--wx-bg-tertiary)]'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
            </div>
          </div>

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
        <a href="/" className="text-sm text-[var(--wx-text-secondary)] hover:text-white">取消</a>
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
      <main className="max-w-lg mx-auto p-6">
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
