import type { BrowserContext } from "playwright";
import type { ForwardRecord, WeiboPost } from "../types.js";

export interface ScrapeTimelineOptions {
  neededCount?: number;
  forwardedMids?: Set<string>;
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

export type { ForwardRecord, WeiboPost };
