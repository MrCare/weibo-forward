const BASE62 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** 从微博 mid 估算发布时间（毫秒），失败返回 null */
export function weiboMidToTimestamp(mid: string): number | null {
  const trimmed = mid.trim();
  if (!trimmed) return null;

  try {
    let num: bigint;
    if (/^\d+$/.test(trimmed)) {
      num = BigInt(trimmed);
    } else if (/^[0-9a-zA-Z]+$/.test(trimmed)) {
      num = 0n;
      for (const ch of trimmed) {
        const idx = BASE62.indexOf(ch);
        if (idx < 0) return null;
        num = num * 64n + BigInt(idx);
      }
    } else {
      return null;
    }
    const ts = Number((num >> 22n) + 515483463n) * 1000;
    if (!Number.isFinite(ts) || ts < Date.parse("2010-01-01")) return null;
    return ts;
  } catch {
    return null;
  }
}

export function weiboMidToIsoDate(mid: string): string | null {
  const ts = weiboMidToTimestamp(mid);
  if (ts == null) return null;
  return new Date(ts).toISOString();
}
