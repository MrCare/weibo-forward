export type UserRole = "admin" | "user";

export interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  api_key: string;
  role: UserRole;
  prompt_template_id: string;
  custom_prompt: string | null;
  created_at: string;
}

export interface ForwardAccountRow {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface ForwardRuleRow {
  id: string;
  user_id: string;
  forward_account_id: string;
  source_uid: string;
  limit_count: number;
  enabled: number;
  prompt_profile: string | null;
  schedule: string | null;
  created_at: string;
}

export type LoginSessionStatus =
  | "pending"
  | "awaiting_scan"
  | "succeeded"
  | "failed"
  | "expired";

export interface LoginSessionRow {
  id: string;
  user_id: string;
  forward_account_id: string;
  status: LoginSessionStatus;
  login_token: string;
  qr_image_path: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

export interface ForwardRecordRow {
  id: number;
  user_id: string;
  forward_account_id: string;
  source_uid: string;
  mid: string;
  source_url: string;
  comment: string;
  my_repost_url: string | null;
  forwarded_at: string;
}

export interface CleanupRuleRow {
  id: string;
  user_id: string;
  forward_account_id: string;
  limit_count: number;
  enabled: number;
  post_types: string;
  required_tags: string;
  judge_profile: string | null;
  judge_prompt: string | null;
  schedule: string | null;
  since_date: string | null;
  until_date: string | null;
  created_at: string;
}

export interface CleanupJudgmentRow {
  rule_id: string;
  mid: string;
  rule_fingerprint: string;
  should_delete: number;
  reason: string;
  judged_at: string;
}

export interface CleanupRecordRow {
  id: number;
  user_id: string;
  forward_account_id: string;
  mid: string;
  detail_url: string;
  judge_reason: string;
  deleted_at: string;
  dry_run: number;
}
