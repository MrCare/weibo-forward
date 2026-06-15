import type { BrowserContext } from "playwright";
import type { CleanupRecord, ForwardRecord, WeiboPost, WeiboMediaType } from "../types.js";

export interface ScrapeTimelineOptions {
  neededCount?: number;
  forwardedMids?: Set<string>;
  maxScrolls?: number;
}

export interface ScrapeByDateOptions {
  sinceMs: number;
  untilMs: number;
  maxScrolls?: number;
}

export interface WeiboClient {
  loginInteractive(): Promise<void>;
  withSession<T>(
    headless: boolean,
    fn: (context: BrowserContext) => Promise<T>,
  ): Promise<T>;
  scrapeTimeline(
    page: import("playwright").Page,
    sourceUid: string,
    options?: ScrapeTimelineOptions,
  ): Promise<WeiboPost[]>;
  repost(
    context: BrowserContext,
    post: WeiboPost,
    comment: string,
  ): Promise<string>;
  scrapeMyTimeline(
    page: import("playwright").Page,
    myUid: string,
    options?: ScrapeTimelineOptions,
  ): Promise<WeiboPost[]>;
  scrapeMyTimelineByDateRange(
    page: import("playwright").Page,
    myUid: string,
    options: ScrapeByDateOptions,
  ): Promise<WeiboPost[]>;
  deletePost(context: BrowserContext, post: WeiboPost): Promise<void>;
}

export interface CommentGenerator {
  /** @param systemPrompt 已解析的 system 提示词 */
  generate(postText: string, systemPrompt?: string): Promise<string>;
}

export interface MarkForwardedInput {
  forwardAccountId: string;
  mid: string;
  sourceUid: string;
  sourceUrl: string;
  comment: string;
  myRepostUrl: string;
}

export interface ForwardRepository {
  getForwardedMids(forwardAccountId: string, sourceUid: string): Promise<Set<string>>;
  markForwarded(input: MarkForwardedInput): Promise<void>;
  appendMyRepostLink(forwardAccountId: string, url: string): Promise<void>;
  getForwardedPostsCsvPath(forwardAccountId: string): string;
  getMyRepostLinksCsvPath(forwardAccountId: string): string;
}

export interface ForwardJobInput {
  forwardAccountId: string;
  sourceUid: string;
  limit: number;
  dryRun: boolean;
  headless: boolean;
  /** 本条任务使用的 system 提示词（由用户/规则模板解析） */
  systemPrompt?: string;
}

export interface ForwardJobResult {
  processed: number;
  forwarded: number;
  skipped: number;
  /** 与 CLI 一致的执行日志行 */
  logs?: string[];
  dryRun?: boolean;
}

export interface RunForwardOptions {
  /** 复用已有 BrowserContext（如 forward --all 多源规则） */
  context?: BrowserContext;
  /** 收集日志供 API / 管理台展示 */
  logger?: import("./run-logger.js").RunLogger;
}

export interface JobRunner {
  run(input: ForwardJobInput, options?: RunForwardOptions): Promise<ForwardJobResult>;
}

export interface ContentJudgment {
  shouldDelete: boolean;
  reason: string;
}

export interface ContentJudge {
  judge(post: WeiboPost, systemPrompt: string): Promise<ContentJudgment>;
  judgeBatch(
    posts: WeiboPost[],
    systemPrompt: string,
  ): Promise<Map<string, ContentJudgment>>;
}

export interface MarkCleanupInput {
  forwardAccountId: string;
  mid: string;
  detailUrl: string;
  judgeReason: string;
  dryRun: boolean;
}

export interface CleanupJudgmentRecord {
  shouldDelete: boolean;
  reason: string;
  ruleFingerprint: string;
}

export interface SaveCleanupJudgmentInput {
  ruleId: string;
  mid: string;
  ruleFingerprint: string;
  shouldDelete: boolean;
  reason: string;
}

export interface CleanupRepository {
  getProcessedMids(forwardAccountId: string): Promise<Set<string>>;
  markProcessed(input: MarkCleanupInput): Promise<void>;
  getJudgment(
    ruleId: string,
    mid: string,
    ruleFingerprint: string,
  ): Promise<CleanupJudgmentRecord | null>;
  saveJudgment(input: SaveCleanupJudgmentInput): Promise<void>;
}

export interface CleanupJobInput {
  forwardAccountId: string;
  since: string;
  until: string;
  postTypes: WeiboMediaType[];
  requiredTags: string[];
  dryRun: boolean;
  headless: boolean;
}

export interface CleanupJobResult {
  scanned: number;
  candidates: number;
  deleted: number;
  skipped: number;
  logs?: string[];
  dryRun?: boolean;
}

export interface RunCleanupOptions {
  context?: BrowserContext;
  logger?: import("./run-logger.js").RunLogger;
}

export interface CleanupJobRunner {
  run(input: CleanupJobInput, options?: RunCleanupOptions): Promise<CleanupJobResult>;
}

export type { ForwardRecord, WeiboPost, CleanupRecord, WeiboMediaType };
