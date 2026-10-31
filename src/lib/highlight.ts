export interface Segment {
  text: string;
  /** 命中的词；未命中为 null */
  hit: string | null;
}

/**
 * 把原句按命中词切成若干片段，用于高亮。
 *
 * 用最左优先 + 跳过重叠的方式处理，不追求最优覆盖——
 * 这里的目标是让人看清"这句话的哪几个字变成了哪个概念"，
 * 过度聪明的匹配反而会让高亮乱跳。
 */
export function splitByTerms(text: string, terms: string[]): Segment[] {
  const clean = Array.from(new Set(terms.filter((t) => t && t.length >= 2)));
  if (clean.length === 0) return [{ text, hit: null }];

  const marks: { start: number; end: number; term: string }[] = [];
  for (const term of clean) {
    let idx = text.indexOf(term);
    while (idx >= 0) {
      marks.push({ start: idx, end: idx + term.length, term });
      idx = text.indexOf(term, idx + term.length);
    }
  }
  if (marks.length === 0) return [{ text, hit: null }];

  marks.sort((a, b) => a.start - b.start || b.end - a.end);

  const out: Segment[] = [];
  let cursor = 0;
  for (const m of marks) {
    if (m.start < cursor) continue;
    if (m.start > cursor) out.push({ text: text.slice(cursor, m.start), hit: null });
    out.push({ text: text.slice(m.start, m.end), hit: m.term });
    cursor = m.end;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), hit: null });

  return out;
}
