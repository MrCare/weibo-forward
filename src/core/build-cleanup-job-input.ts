import { resolveCleanupDateRange } from "./cleanup-dates.js";
import type { CleanupJobInput } from "./interfaces.js";
import type { WeiboMediaType } from "../types.js";

export function buildCleanupJobInput(params: {
  forwardAccountId: string;
  since?: string;
  until?: string;
  postTypes: WeiboMediaType[];
  requiredTags: string[];
  dryRun: boolean;
  headless: boolean;
}): CleanupJobInput {
  const { since, until } = resolveCleanupDateRange({
    since: params.since,
    until: params.until,
  });
  return {
    forwardAccountId: params.forwardAccountId,
    since,
    until,
    postTypes: params.postTypes,
    requiredTags: params.requiredTags,
    dryRun: params.dryRun,
    headless: params.headless,
  };
}
