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
