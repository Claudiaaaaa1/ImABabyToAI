import { ExQAPair } from '@/types';

/**
 * 用字符级重叠对每条对话对评分,选出与 query 语义最相近的若干条。
 * 中文友好(不依赖分词器)。
 */
export function retrieveFewShotPairs(query: string, pairs: ExQAPair[] | undefined, topK = 5): ExQAPair[] {
  if (!pairs || pairs.length === 0) return [];

  const q = query.replace(/\s/g, '');
  if (!q) {
    // 没有查询词时,随机返回几条样本以保留风格曝光
    return shuffle(pairs).slice(0, topK);
  }

  const queryChars = new Set(Array.from(q));

  const scored = pairs.map((p, idx) => {
    let userScore = 0;
    for (const c of p.user) if (queryChars.has(c)) userScore++;
    // 归一化:用户句子越长得分越被稀释
    const norm = userScore / Math.max(p.user.length, 4);
    return { idx, score: norm };
  });

  scored.sort((a, b) => b.score - a.score);

  const taken = new Set<number>();
  const result: ExQAPair[] = [];

  // 1) 取分数大于 0 的高匹配条目
  for (const s of scored) {
    if (s.score > 0 && result.length < topK) {
      taken.add(s.idx);
      result.push(pairs[s.idx]);
    } else if (result.length >= topK) {
      break;
    }
  }

  // 2) 不够 topK 时随机补足,保持多样性
  while (result.length < topK) {
    const remaining: number[] = [];
    for (let i = 0; i < pairs.length; i++) if (!taken.has(i)) remaining.push(i);
    if (remaining.length === 0) break;
    const idx = remaining[Math.floor(Math.random() * remaining.length)];
    taken.add(idx);
    result.push(pairs[idx]);
  }

  return result;
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
