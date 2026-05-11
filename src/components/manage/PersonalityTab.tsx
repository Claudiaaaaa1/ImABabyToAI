'use client';

import { useState, useRef } from 'react';
import { Save, RotateCcw, Clock, Smile, MessageCircle, Eye } from 'lucide-react';
import { ExProfile } from '@/types';
import { useProfileStore } from '@/stores/useProfileStore';
import { updateProfile } from '@/lib/db';

interface PersonalityTabProps {
  profile: ExProfile;
}

function AvatarUploader({ avatar, onChange }: {
  avatar: string;
  onChange: (base64: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('请上传图片文件');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert('图片大小不能超过 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      onChange(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex items-center gap-4">
      <div
        onClick={() => fileRef.current?.click()}
        className="w-16 h-16 rounded-lg bg-[var(--wx-bg-tertiary)] border border-[var(--wx-border)] flex items-center justify-center cursor-pointer hover:border-[var(--wx-bubble-me)] transition overflow-hidden"
      >
        {avatar && avatar.startsWith('data:') ? (
          <img src={avatar} alt="avatar" className="w-full h-full object-cover" />
        ) : avatar && avatar.startsWith('http') ? (
          <img src={avatar} alt="avatar" className="w-full h-full object-cover" />
        ) : (
          <span className="text-2xl">👤</span>
        )}
      </div>
      <div className="flex-1">
        <button
          onClick={() => fileRef.current?.click()}
          className="px-4 py-2 bg-[var(--wx-bg-tertiary)] border border-[var(--wx-border)] rounded-lg text-sm hover:bg-[var(--wx-bg-secondary)] transition"
        >
          选择图片
        </button>
        <p className="text-xs text-[var(--wx-text-secondary)] mt-1">支持 PNG、JPG，最大 2MB</p>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        onChange={handleFile}
        className="hidden"
      />
    </div>
  );
}

function SliderField({ label, value, min, max, unit, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (val: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-[var(--wx-text-secondary)]">{label}</span>
        <span>{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-[var(--wx-bg-tertiary)] rounded-full appearance-none cursor-pointer accent-[var(--wx-bubble-me)]"
      />
    </div>
  );
}

export function PersonalityTab({ profile }: PersonalityTabProps) {
  const { updateProfile: storeUpdate } = useProfileStore();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // 本地编辑状态
  const [form, setForm] = useState({
    name: profile.identity.name,
    avatar: profile.identity.avatar,
    personaPrompt: profile.identity.personaPrompt,
    speakingStyle: profile.identity.speakingStyle,
    behavior: { ...profile.behavior },
  });

  const handleSave = async () => {
    setSaving(true);
    await storeUpdate(profile.id, {
      name: form.name,
      avatar: form.avatar,
      identity: {
        ...profile.identity,
        name: form.name,
        avatar: form.avatar,
        personaPrompt: form.personaPrompt,
        speakingStyle: form.speakingStyle,
      },
      behavior: form.behavior,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* 基础信息 */}
      <section className="bg-[var(--wx-bg-secondary)] border border-[var(--wx-border)] rounded-lg p-4 space-y-4">
        <h3 className="text-sm font-medium text-[var(--wx-text-secondary)] mb-3">基础信息</h3>

        <div>
          <label className="block text-sm text-[var(--wx-text-secondary)] mb-1">名字</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-3 py-2 bg-[var(--wx-bg-tertiary)] border border-[var(--wx-border)] rounded-lg outline-none focus:border-[var(--wx-bubble-me)] text-sm"
          />
        </div>

        <div>
          <label className="block text-sm text-[var(--wx-text-secondary)] mb-2">头像</label>
          <AvatarUploader
            avatar={form.avatar}
            onChange={(base64) => setForm({ ...form, avatar: base64 })}
          />
        </div>

        <div>
          <label className="block text-sm text-[var(--wx-text-secondary)] mb-1">人格设定</label>
          <textarea
            value={form.personaPrompt}
            onChange={(e) => setForm({ ...form, personaPrompt: e.target.value })}
            rows={5}
            className="w-full px-3 py-2 bg-[var(--wx-bg-tertiary)] border border-[var(--wx-border)] rounded-lg outline-none focus:border-[var(--wx-bubble-me)] text-sm resize-none"
          />
        </div>

        <div>
          <label className="block text-sm text-[var(--wx-text-secondary)] mb-1">说话风格</label>
          <input
            type="text"
            value={form.speakingStyle}
            onChange={(e) => setForm({ ...form, speakingStyle: e.target.value })}
            className="w-full px-3 py-2 bg-[var(--wx-bg-tertiary)] border border-[var(--wx-border)] rounded-lg outline-none focus:border-[var(--wx-bubble-me)] text-sm"
          />
        </div>
      </section>

      {/* 行为参数 */}
      <section className="bg-[var(--wx-bg-secondary)] border border-[var(--wx-border)] rounded-lg p-4 space-y-4">
        <h3 className="text-sm font-medium text-[var(--wx-text-secondary)] mb-3">行为参数</h3>

        <SliderField
          label="最短回复延迟"
          value={form.behavior.responseDelay.min}
          min={0}
          max={10000}
          unit="ms"
          onChange={(val) => setForm({
            ...form,
            behavior: { ...form.behavior, responseDelay: { ...form.behavior.responseDelay, min: val } }
          })}
        />

        <SliderField
          label="最长回复延迟"
          value={form.behavior.responseDelay.max}
          min={1000}
          max={15000}
          unit="ms"
          onChange={(val) => setForm({
            ...form,
            behavior: { ...form.behavior, responseDelay: { ...form.behavior.responseDelay, max: val } }
          })}
        />

        <SliderField
          label="打字速度"
          value={form.behavior.typingSpeed}
          min={10}
          max={200}
          unit="ms/字"
          onChange={(val) => setForm({
            ...form,
            behavior: { ...form.behavior, typingSpeed: val }
          })}
        />

        <SliderField
          label="Emoji 频率"
          value={Math.round(form.behavior.emojiFrequency * 100)}
          min={0}
          max={100}
          unit="%"
          onChange={(val) => setForm({
            ...form,
            behavior: { ...form.behavior, emojiFrequency: val / 100 }
          })}
        />
      </section>

      {/* 风格档案（只读） */}
      {profile.styleProfile && (
        <section className="bg-[var(--wx-bg-secondary)] border border-[var(--wx-border)] rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-[var(--wx-text-secondary)] flex items-center gap-2">
              <Eye className="w-4 h-4" />
              语言风格档案
            </h3>
            <span className="text-xs px-2 py-0.5 bg-[var(--wx-bubble-me)] text-black rounded-full">AI 分析</span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <StyleCard icon={MessageCircle} label="口头禅" value={profile.styleProfile.signaturePhrases.join('、') || '无'} />
            <StyleCard icon={Smile} label="情感基调" value={profile.styleProfile.emotionalTone} />
            <StyleCard label="断句方式" value={profile.styleProfile.sentencePattern} />
            <StyleCard label="回复长度" value={profile.styleProfile.responseLength} />
            <StyleCard label="表情使用" value={profile.styleProfile.emojiStyle} />
            <StyleCard label="语气词" value={profile.styleProfile.likesModalParticles ? '常用' : '少用'} />
            <StyleCard label="反问句" value={profile.styleProfile.likesRhetoricalQuestions ? '常用' : '少用'} />
            <StyleCard label="标点习惯" value={profile.styleProfile.punctuationStyle} />
            <StyleCard label="话题偏好" value={profile.styleProfile.topicPreferences.join('、') || '无'} />
            <StyleCard icon={Clock} label="回复习惯" value={`约${Math.round(profile.styleProfile.replyDelaySeconds / 60)}分钟`} />
          </div>

          <div className="mt-3 pt-3 border-t border-[var(--wx-border)]">
            <p className="text-xs text-[var(--wx-text-secondary)]">
              高频词汇：{profile.styleProfile.vocabulary.join('、') || '无'}
            </p>
          </div>

          <a
            href="/manage?tab=memory"
            className="mt-3 block text-center text-sm text-[var(--wx-text-link)] hover:underline py-2"
          >
            去「记忆与素材」重新分析风格
          </a>
        </section>
      )}

      {/* 保存按钮 */}
      <div className="sticky bottom-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 bg-[var(--wx-bubble-me)] text-black font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition flex items-center justify-center gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? '保存中...' : saved ? '已保存 ✓' : '保存修改'}
        </button>
      </div>
    </div>
  );
}

function StyleCard({ icon: Icon, label, value }: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-[var(--wx-bg-tertiary)] rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-xs text-[var(--wx-text-secondary)] mb-1">
        {Icon && <Icon className="w-3 h-3" />}
        {label}
      </div>
      <p className="text-sm font-medium truncate">{value}</p>
    </div>
  );
}
