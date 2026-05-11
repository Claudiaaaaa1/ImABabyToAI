import { ExQAPair } from '@/types';

interface ChatTurn {
  speaker: 'me' | 'ex';
  text: string;
}

const ME_ALIASES = new Set(['我', '我自己', '自己', 'me', 'i', 'I', '本人', 'Me']);

/** 标头形如 "名字 2023-05-12 14:23:45" */
const HEADER_TIMESTAMP = /^([^\s\t:：]+)[\s\t]+\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}/;
/** 紧凑形式 "[time] 名字: 内容" 或 "名字: 内容" */
const COMPACT = /^(?:\[[\d\-:\s/]+\]\s*)?([^:：\s][^:：]{0,30})[:：]\s*(.*)$/;

function classifySpeaker(name: string): 'me' | 'ex' {
  return ME_ALIASES.has(name.trim()) ? 'me' : 'ex';
}

/**
 * 把一个原始聊天记录文本解析为 (speaker, text) 序列。
 * 支持微信导出/QQ 导出/紧凑文本形式;无法识别的行作为上一段说话内容的延续。
 */
export function parseChatRecord(text: string): ChatTurn[] {
  const turns: ChatTurn[] = [];
  const lines = text.split(/\r?\n/);

  let currentSpeaker: 'me' | 'ex' | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (currentSpeaker && buffer.length > 0) {
      const t = buffer.join('\n').trim();
      if (t) turns.push({ speaker: currentSpeaker, text: t });
    }
    buffer = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // 形式 1:名字 + 时间戳作为标头(下一行才是内容)
    const headerMatch = line.match(HEADER_TIMESTAMP);
    if (headerMatch) {
      flush();
      currentSpeaker = classifySpeaker(headerMatch[1]);
      continue;
    }

    // 形式 2:同一行带冒号:"名字: 内容"
    const compactMatch = line.match(COMPACT);
    if (compactMatch && compactMatch[2]) {
      // 排除掉看起来像系统注释的行(如 URL/英文键值对)
      const candidateName = compactMatch[1].trim();
      const isLikelyName = candidateName.length <= 12 && !/^https?$/i.test(candidateName) && !/^\w+$/.test(candidateName);
      if (isLikelyName || ME_ALIASES.has(candidateName)) {
        flush();
        currentSpeaker = classifySpeaker(candidateName);
        buffer = [compactMatch[2]];
        continue;
      }
    }

    // 延续行
    if (currentSpeaker) {
      buffer.push(line);
    }
  }
  flush();

  return turns;
}

const SYSTEM_PREFIXES = ['[图片]', '[视频]', '[链接]', '[文件]', '[位置]', '[语音]', '[表情]', '[红包]', '[转账]', '[动画表情]', '[小程序]', '[名片]', '[音乐]'];

function isUseful(t: string): boolean {
  if (!t) return false;
  const trimmed = t.trim();
  if (trimmed.length < 3 || trimmed.length > 80) return false;
  if (/^https?:\/\//i.test(trimmed)) return false;
  if (SYSTEM_PREFIXES.some((p) => trimmed.startsWith(p))) return false;
  // 纯标点/纯emoji/纯空白
  if (!/[一-龥a-zA-Z]/.test(trimmed)) return false;
  return true;
}

/**
 * 把解析出来的 turns 整理为:
 *  - samples:前任的独立原话(去重、过滤系统消息)
 *  - pairs:连续的 我→TA 对话对
 */
export function buildSamplesAndPairs(
  turns: ChatTurn[],
  maxSamples = 80
): { samples: string[]; pairs: ExQAPair[] } {
  const samples: string[] = [];
  const pairs: ExQAPair[] = [];
  const seenSample = new Set<string>();
  const seenPair = new Set<string>();

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];

    if (turn.speaker === 'ex' && isUseful(turn.text) && !seenSample.has(turn.text)) {
      samples.push(turn.text);
      seenSample.add(turn.text);
    }

    if (i > 0 && turn.speaker === 'ex' && turns[i - 1].speaker === 'me') {
      const userText = turns[i - 1].text;
      if (isUseful(userText) && isUseful(turn.text)) {
        const key = `${userText}||${turn.text}`;
        if (!seenPair.has(key)) {
          pairs.push({ user: userText, ex: turn.text });
          seenPair.add(key);
        }
      }
    }
  }

  return {
    samples: samples.slice(0, maxSamples),
    pairs: pairs.slice(0, maxSamples),
  };
}

/**
 * 把多个聊天记录文本合并解析。
 */
export function parseAllChatRecords(texts: string[]): { samples: string[]; pairs: ExQAPair[] } {
  const allTurns: ChatTurn[] = [];
  for (const t of texts) {
    allTurns.push(...parseChatRecord(t));
  }
  return buildSamplesAndPairs(allTurns);
}
