import { createHash } from "node:crypto";
import type { WeiboMediaType } from "../types.js";

export interface CleanupRuleFingerprintInput {
  postTypes: WeiboMediaType[];
  requiredTags: string[];
  judgeSystemPrompt: string;
  since: string;
  until: string;
}

export function computeCleanupRuleFingerprint(
  input: CleanupRuleFingerprintInput,
): string {
  const payload = JSON.stringify({
    postTypes: [...input.postTypes].sort(),
    requiredTags: [...input.requiredTags].sort(),
    judgeSystemPrompt: input.judgeSystemPrompt.trim(),
    since: input.since,
    until: input.until,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}
