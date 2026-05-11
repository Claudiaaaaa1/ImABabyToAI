'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Trash2, Edit3, MoveRight, Clock, Hash, Sparkles, User,
  List, LayoutGrid, ChevronDown, ChevronUp, X, Check
} from 'lucide-react';
import { ExProfile, Memory, MemoryGroup } from '@/types';
import {
  getMemoryGroupsByProfile,
  getMemoriesByProfile,
  createMemoryGroup,
  createMemory,
  updateMemory,
  deleteMemory,
  moveMemoryToGroup,
  deleteMemoryGroup,
} from '@/lib/db';
import { useProfileStore } from '@/stores/useProfileStore';

interface MemoryTabProps {
  profile: ExProfile;
}

export function MemoryTab({ profile }: MemoryTabProps) {
  const [groups, setGroups] = useState<MemoryGroup[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeGroup, setActiveGroup] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'timeline' | 'group'>('timeline');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [movingId, setMovingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newMemoryContent, setNewMemoryContent] = useState('');
  const [newMemoryGroup, setNewMemoryGroup] = useState('');
  const [showNewGroupForm, setShowNewGroupForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [materialCollapsed, setMaterialCollapsed] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [materialFiles, setMaterialFiles] = useState<Array<{ name: string; content: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { refreshProfiles, updateProfile } = useProfileStore();

  const loadData = useCallback(async () => {
    setLoading(true);
    const [g, m] = await Promise.all([
      getMemoryGroupsByProfile(profile.id),
      getMemoriesByProfile(profile.id),
    ]);
    setGroups(g.sort((a, b) => a.sortOrder - b.sortOrder));
    setMemories(m.sort((a, b) => b.createdAt - a.createdAt));
    setLoading(false);
  }, [profile.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddMemory = async () => {
    if (!newMemoryContent.trim()) return;
    const groupId = newMemoryGroup || groups.find(g => g.presetKey === 'other')?.id || groups[0]?.id;
    if (!groupId) return;

    await createMemory({
      id: `mem-${Date.now()}`,
      profileId: profile.id,
      groupId,
      content: newMemoryContent.trim(),
      source: 'manual',
      weight: 0.9,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // 同步更新 memoryBank
    const newMem = { id: `mem-${Date.now()}`, content: newMemoryContent.trim(), weight: 0.9 };
    await refreshProfiles();

    setNewMemoryContent('');
    setShowAddForm(false);
    loadData();
  };

  const handleDeleteMemory = async (id: string) => {
    await deleteMemory(id);
    loadData();
  };

  const handleStartEdit = (memory: Memory) => {
    setEditingId(memory.id);
    setEditContent(memory.content);
  };

  const handleSaveEdit = async (id: string) => {
    if (!editContent.trim()) return;
    await updateMemory(id, { content: editContent.trim() });
    setEditingId(null);
    loadData();
  };

  const handleMove = async (memoryId: string, groupId: string) => {
    await moveMemoryToGroup(memoryId, groupId);
    setMovingId(null);
    loadData();
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    const maxOrder = Math.max(...groups.map(g => g.sortOrder), 0);
    await createMemoryGroup({
      id: `group-${Date.now()}`,
      profileId: profile.id,
      name: newGroupName.trim(),
      type: 'custom',
      presetKey: null,
      sortOrder: maxOrder + 1,
    });
    setNewGroupName('');
    setShowNewGroupForm(false);
    loadData();
  };

  const handleDeleteGroup = async (groupId: string) => {
    const group = groups.find(g => g.id === groupId);
    if (!group || group.type === 'preset') return; // 预设分组不能删
    await deleteMemoryGroup(groupId);
    loadData();
  };

  // 上传素材文件
  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      if (!file.name.endsWith('.txt') && !file.name.endsWith('.json') && !file.name.endsWith('.html')) {
        alert(`暂不支持的文件格式: ${file.name}，请上传 .txt 聊天记录文件`);
        continue;
      }

      const text = await file.text();
      if (!text.trim()) continue;

      // 保存为 memory
      const groupId = groups.find(g => g.presetKey === 'other')?.id || groups[0]?.id;
      if (groupId) {
        await createMemory({
          id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          profileId: profile.id,
          groupId,
          content: `【素材: ${file.name}】\n${text.slice(0, 2000)}${text.length > 2000 ? '...' : ''}`,
          source: 'manual',
          weight: 0.9,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }

      setMaterialFiles(prev => [...prev, { name: file.name, content: text }]);
    }

    loadData();
    e.target.value = '';
  };

  // 重新分析素材
  const handleReanalyze = async () => {
    const textMaterials = memories
      .filter(m => m.source === 'manual' || m.source === 'ai_extract')
      .map(m => m.content)
      .join('\n---\n');

    if (!textMaterials.trim()) {
      alert('暂无素材可分析，请先上传聊天记录或添加口述回忆。');
      return;
    }

    setAnalyzing(true);
    try {
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
${textMaterials.slice(0, 4000)}

注意：
- vocabulary 最多8个词
- signaturePhrases 最多5个
- 所有字符串值用中文
- 输出必须是可以直接 JSON.parse 的纯 JSON，不要加 markdown 代码块标记`;

      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            id: 'reanalyze',
            localId: 'reanalyze',
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

      const cleaned = fullContent
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      const parsed = JSON.parse(cleaned);
      const styleProfile = {
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

      // 更新 profile 的 styleProfile
      await updateProfile(profile.id, { styleProfile });
      alert('风格分析完成！风格档案已更新。');
    } catch (err) {
      console.error('重新分析失败:', err);
      alert('分析失败，请检查网络或稍后重试。');
    } finally {
      setAnalyzing(false);
    }
  };

  const filteredMemories = activeGroup === 'all'
    ? memories
    : memories.filter(m => m.groupId === activeGroup);

  const getGroupName = (groupId: string) =>
    groups.find(g => g.id === groupId)?.name || '未分组';

  const getSourceLabel = (source: Memory['source']) => {
    switch (source) {
      case 'ai_extract': return { text: 'AI提取', icon: Sparkles, color: 'text-amber-400' };
      case 'hash_command': return { text: '#指令', icon: Hash, color: 'text-blue-400' };
      case 'manual': return { text: '手动', icon: User, color: 'text-green-400' };
    }
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const isYesterday = new Date(now.getTime() - 86400000).toDateString() === d.toDateString();

    if (isToday) return '今天';
    if (isYesterday) return '昨天';
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  // 按日期分组
  const groupedByDate = filteredMemories.reduce((acc, mem) => {
    const date = formatDate(mem.createdAt);
    if (!acc[date]) acc[date] = [];
    acc[date].push(mem);
    return acc;
  }, {} as Record<string, Memory[]>);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin w-6 h-6 border-2 border-[var(--wx-bubble-me)] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 素材区 */}
      <section className="bg-[var(--wx-bg-secondary)] border border-[var(--wx-border)] rounded-lg overflow-hidden">
        <button
          onClick={() => setMaterialCollapsed(!materialCollapsed)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--wx-bg-tertiary)] transition"
        >
          <span className="text-sm font-medium">聊天记录素材</span>
          {materialCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>

        {!materialCollapsed && (
          <div className="px-4 pb-4 space-y-3">
            <p className="text-xs text-[var(--wx-text-secondary)]">
              上传聊天记录文本文件（.txt），AI 会从中提取语言风格和记忆点。重新分析会覆盖现有风格档案。
            </p>

            {materialFiles.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-[var(--wx-text-secondary)]">已上传素材：</p>
                {materialFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm bg-[var(--wx-bg-tertiary)] px-3 py-1.5 rounded">
                    <span className="truncate">{f.name}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 py-2 bg-[var(--wx-bg-tertiary)] border border-[var(--wx-border)] rounded-lg text-sm hover:bg-[var(--wx-bg-secondary)] transition"
              >
                + 上传新素材
              </button>
              <button
                onClick={handleReanalyze}
                disabled={analyzing}
                className="flex-1 py-2 bg-[var(--wx-bubble-me)] text-black rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition"
              >
                {analyzing ? '分析中...' : '重新分析全部素材'}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".txt,.json,.html"
              onChange={handleUploadFile}
              className="hidden"
            />
          </div>
        )}
      </section>

      {/* 记忆库 */}
      <section className="bg-[var(--wx-bg-secondary)] border border-[var(--wx-border)] rounded-lg p-4 space-y-4">
        {/* 头部工具栏 */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">记忆库</h3>
          <div className="flex items-center gap-2">
            {/* 视图切换 */}
            <div className="flex bg-[var(--wx-bg-tertiary)] rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('timeline')}
                className={`p-1.5 rounded ${viewMode === 'timeline' ? 'bg-[var(--wx-bg-secondary)]' : ''}`}
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('group')}
                className={`p-1.5 rounded ${viewMode === 'group' ? 'bg-[var(--wx-bg-secondary)]' : ''}`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
            </div>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="p-1.5 bg-[var(--wx-bubble-me)] text-black rounded-lg"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 分组筛选 */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setActiveGroup('all')}
            className={`px-2.5 py-1 text-xs rounded-full transition ${
              activeGroup === 'all'
                ? 'bg-[var(--wx-bubble-me)] text-black'
                : 'bg-[var(--wx-bg-tertiary)] text-[var(--wx-text-secondary)] hover:text-white'
            }`}
          >
            全部 {memories.length}
          </button>
          {groups.map(g => {
            const count = memories.filter(m => m.groupId === g.id).length;
            return (
              <button
                key={g.id}
                onClick={() => setActiveGroup(g.id)}
                className={`px-2.5 py-1 text-xs rounded-full transition flex items-center gap-1 ${
                  activeGroup === g.id
                    ? 'bg-[var(--wx-bubble-me)] text-black'
                    : 'bg-[var(--wx-bg-tertiary)] text-[var(--wx-text-secondary)] hover:text-white'
                }`}
              >
                {g.name} {count}
                {g.type === 'custom' && (
                  <span
                    onClick={(e) => { e.stopPropagation(); handleDeleteGroup(g.id); }}
                    className="hover:text-red-400"
                  >
                    <X className="w-3 h-3" />
                  </span>
                )}
              </button>
            );
          })}
          <button
            onClick={() => setShowNewGroupForm(!showNewGroupForm)}
            className="px-2.5 py-1 text-xs rounded-full bg-[var(--wx-bg-tertiary)] text-[var(--wx-text-secondary)] hover:text-white transition flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> 新建
          </button>
        </div>

        {/* 新建分组表单 */}
        {showNewGroupForm && (
          <div className="flex gap-2">
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="分组名称"
              className="flex-1 px-3 py-1.5 bg-[var(--wx-bg-tertiary)] border border-[var(--wx-border)] rounded-lg text-sm outline-none focus:border-[var(--wx-bubble-me)]"
              onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
            />
            <button onClick={handleCreateGroup} className="px-3 py-1.5 bg-[var(--wx-bubble-me)] text-black rounded-lg text-sm">
              <Check className="w-4 h-4" />
            </button>
            <button onClick={() => { setShowNewGroupForm(false); setNewGroupName(''); }} className="px-3 py-1.5 bg-[var(--wx-bg-tertiary)] rounded-lg text-sm">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 新增记忆表单 */}
        {showAddForm && (
          <div className="bg-[var(--wx-bg-tertiary)] rounded-lg p-3 space-y-2">
            <textarea
              value={newMemoryContent}
              onChange={(e) => setNewMemoryContent(e.target.value)}
              placeholder="输入新的记忆..."
              rows={2}
              className="w-full bg-[var(--wx-bg-secondary)] border border-[var(--wx-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--wx-bubble-me)] resize-none"
            />
            <div className="flex gap-2">
              <select
                value={newMemoryGroup}
                onChange={(e) => setNewMemoryGroup(e.target.value)}
                className="flex-1 px-3 py-1.5 bg-[var(--wx-bg-secondary)] border border-[var(--wx-border)] rounded-lg text-sm outline-none"
              >
                <option value="">选择分组</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <button onClick={handleAddMemory} className="px-4 py-1.5 bg-[var(--wx-bubble-me)] text-black rounded-lg text-sm font-medium">
                添加
              </button>
              <button onClick={() => { setShowAddForm(false); setNewMemoryContent(''); }} className="px-3 py-1.5 bg-[var(--wx-bg-secondary)] rounded-lg text-sm">
                取消
              </button>
            </div>
          </div>
        )}

        {/* 记忆列表 */}
        <div className="space-y-1">
          {filteredMemories.length === 0 ? (
            <div className="text-center py-8 text-[var(--wx-text-secondary)] text-sm">
              暂无记忆
            </div>
          ) : viewMode === 'timeline' ? (
            // 时间线视图
            Object.entries(groupedByDate).map(([date, dayMemories]) => (
              <div key={date}>
                <div className="flex items-center gap-3 py-2">
                  <div className="flex-1 h-px bg-[var(--wx-border)]" />
                  <span className="text-xs text-[var(--wx-text-secondary)]">{date}</span>
                  <div className="flex-1 h-px bg-[var(--wx-border)]" />
                </div>
                <div className="space-y-2">
                  {dayMemories.map(mem => (
                    <MemoryCard
                      key={mem.id}
                      memory={mem}
                      groups={groups}
                      isEditing={editingId === mem.id}
                      isMoving={movingId === mem.id}
                      editContent={editContent}
                      onEditContentChange={setEditContent}
                      onStartEdit={handleStartEdit}
                      onSaveEdit={handleSaveEdit}
                      onCancelEdit={() => setEditingId(null)}
                      onStartMove={() => setMovingId(mem.id)}
                      onMove={handleMove}
                      onCancelMove={() => setMovingId(null)}
                      onDelete={handleDeleteMemory}
                      getGroupName={getGroupName}
                      getSourceLabel={getSourceLabel}
                      formatTime={formatTime}
                    />
                  ))}
                </div>
              </div>
            ))
          ) : (
            // 分组视图
            groups.map(g => {
              const groupMemories = filteredMemories.filter(m => m.groupId === g.id);
              if (groupMemories.length === 0 && activeGroup !== 'all') return null;
              if (groupMemories.length === 0) return null;
              return (
                <div key={g.id} className="bg-[var(--wx-bg-tertiary)] rounded-lg p-3">
                  <h4 className="text-xs font-medium text-[var(--wx-text-secondary)] mb-2">{g.name}</h4>
                  <div className="space-y-2">
                    {groupMemories.map(mem => (
                      <MemoryCard
                        key={mem.id}
                        memory={mem}
                        groups={groups}
                        isEditing={editingId === mem.id}
                        isMoving={movingId === mem.id}
                        editContent={editContent}
                        onEditContentChange={setEditContent}
                        onStartEdit={handleStartEdit}
                        onSaveEdit={handleSaveEdit}
                        onCancelEdit={() => setEditingId(null)}
                        onStartMove={() => setMovingId(mem.id)}
                        onMove={handleMove}
                        onCancelMove={() => setMovingId(null)}
                        onDelete={handleDeleteMemory}
                        getGroupName={getGroupName}
                        getSourceLabel={getSourceLabel}
                        formatTime={formatTime}
                      />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

// 单个记忆卡片
interface MemoryCardProps {
  memory: Memory;
  groups: MemoryGroup[];
  isEditing: boolean;
  isMoving: boolean;
  editContent: string;
  onEditContentChange: (v: string) => void;
  onStartEdit: (m: Memory) => void;
  onSaveEdit: (id: string) => void;
  onCancelEdit: () => void;
  onStartMove: () => void;
  onMove: (memoryId: string, groupId: string) => void;
  onCancelMove: () => void;
  onDelete: (id: string) => void;
  getGroupName: (id: string) => string;
  getSourceLabel: (s: Memory['source']) => { text: string; icon: React.ComponentType<{ className?: string }>; color: string };
  formatTime: (ts: number) => string;
}

function MemoryCard({
  memory, groups, isEditing, isMoving, editContent, onEditContentChange,
  onStartEdit, onSaveEdit, onCancelEdit, onStartMove, onMove, onCancelMove,
  onDelete, getGroupName, getSourceLabel, formatTime
}: MemoryCardProps) {
  const source = getSourceLabel(memory.source);
  const SourceIcon = source.icon;

  if (isMoving) {
    return (
      <div className="bg-[var(--wx-bg-tertiary)] rounded-lg p-3 space-y-2">
        <p className="text-sm text-[var(--wx-text-secondary)]">移动到分组：</p>
        <div className="flex flex-wrap gap-1.5">
          {groups.map(g => (
            <button
              key={g.id}
              onClick={() => onMove(memory.id, g.id)}
              className="px-2.5 py-1 text-xs bg-[var(--wx-bg-secondary)] hover:bg-[var(--wx-bubble-me)] hover:text-black rounded-full transition"
            >
              {g.name}
            </button>
          ))}
        </div>
        <button onClick={onCancelMove} className="text-xs text-[var(--wx-text-secondary)] hover:text-white">取消</button>
      </div>
    );
  }

  return (
    <div className="bg-[var(--wx-bg-tertiary)] rounded-lg p-3 group">
      {isEditing ? (
        <div className="space-y-2">
          <textarea
            value={editContent}
            onChange={(e) => onEditContentChange(e.target.value)}
            rows={2}
            className="w-full bg-[var(--wx-bg-secondary)] border border-[var(--wx-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--wx-bubble-me)] resize-none"
            autoFocus
          />
          <div className="flex gap-2">
            <button onClick={() => onSaveEdit(memory.id)} className="px-3 py-1 bg-[var(--wx-bubble-me)] text-black rounded text-xs font-medium">
              保存
            </button>
            <button onClick={onCancelEdit} className="px-3 py-1 bg-[var(--wx-bg-secondary)] rounded text-xs">
              取消
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm leading-relaxed">{memory.content}</p>
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
              <span className={`flex items-center gap-1 text-xs ${source.color}`}>
                <SourceIcon className="w-3 h-3" />
                {source.text}
              </span>
              <span className="text-xs text-[var(--wx-text-secondary)] flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatTime(memory.createdAt)}
              </span>
              <span className="text-xs text-[var(--wx-text-secondary)] bg-[var(--wx-bg-secondary)] px-1.5 py-0.5 rounded">
                {getGroupName(memory.groupId)}
              </span>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
              <button onClick={() => onStartEdit(memory)} className="p-1 hover:bg-[var(--wx-bg-secondary)] rounded">
                <Edit3 className="w-3.5 h-3.5 text-[var(--wx-text-secondary)]" />
              </button>
              <button onClick={onStartMove} className="p-1 hover:bg-[var(--wx-bg-secondary)] rounded">
                <MoveRight className="w-3.5 h-3.5 text-[var(--wx-text-secondary)]" />
              </button>
              <button onClick={() => onDelete(memory.id)} className="p-1 hover:bg-[var(--wx-bg-secondary)] rounded">
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
