/** 默认起始日：当年 5 月 1 日 */
export function defaultCleanupSinceDate(now = new Date()): string {
  const year = now.getFullYear();
  return `${year}-05-01`;
}

export function defaultCleanupUntilDate(now = new Date()): string {
  return formatDateOnly(now);
}

export function formatDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseCleanupDateInput(value: string | undefined, fallback: string): string {
  const raw = value?.trim();
  if (!raw) return fallback;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  throw new Error(`无效的日期格式 "${raw}"，请使用 YYYY-MM-DD`);
}

export function cleanupDateRangeToBounds(since: string, until: string): {
  sinceMs: number;
  untilMs: number;
} {
  const sinceMs = Date.parse(`${since}T00:00:00+08:00`);
  const untilMs = Date.parse(`${until}T23:59:59.999+08:00`);
  if (Number.isNaN(sinceMs) || Number.isNaN(untilMs)) {
    throw new Error(`无效的时间范围: ${since} ~ ${until}`);
  }
  if (sinceMs > untilMs) {
    throw new Error(`since (${since}) 不能晚于 until (${until})`);
  }
  return { sinceMs, untilMs };
}

export function resolveCleanupDateRange(input: {
  since?: string;
  until?: string;
  now?: Date;
}): { since: string; until: string } {
  const now = input.now ?? new Date();
  const until = parseCleanupDateInput(input.until, defaultCleanupUntilDate(now));
  const since = parseCleanupDateInput(input.since, defaultCleanupSinceDate(now));
  cleanupDateRangeToBounds(since, until);
  return { since, until };
}
