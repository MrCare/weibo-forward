export interface WeiboPost {
  mid: string;
  text: string;
  detailUrl: string;
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
