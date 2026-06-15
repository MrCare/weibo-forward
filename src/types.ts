export type WeiboMediaType = "video" | "image" | "text" | "unknown";

export interface WeiboPost {
  mid: string;
  text: string;
  detailUrl: string;
  mediaType?: WeiboMediaType;
  /** 发布时间 ISO 字符串（抓取或 mid 推算） */
  postedAt?: string;
}

export interface CleanupRecord {
  mid: string;
  forwardAccountId: string;
  detailUrl: string;
  judgeReason: string;
  deletedAt: string;
  dryRun?: boolean;
}

export interface ForwardRecord {
  mid: string;
  sourceUid: string;
  /** 转发微博账号 ID，旧记录可省略（视为 default） */
  forwardAccountId?: string;
  comment: string;
  forwardedAt: string;
}

export interface ForwardedStore {
  records: ForwardRecord[];
}

export interface AppConfig {
  sourceUid: string;
  forwardLimit: number;
  headless: boolean;
  dryRun: boolean;
}
