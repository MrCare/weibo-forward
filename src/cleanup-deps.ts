import { DefaultCleanupJobRunner } from "./core/cleanup-job-runner.js";
import { FileCleanupRepository } from "./core/file-cleanup-repository.js";
import { PlaywrightWeiboClient } from "./core/playwright-weibo-client.js";
import type { CleanupJobInput } from "./core/interfaces.js";

export function createCleanupDeps(
  forwardAccountId: string,
  storageStatePath?: string,
) {
  const weiboClient = new PlaywrightWeiboClient(forwardAccountId, storageStatePath);
  const cleanupRepository = new FileCleanupRepository(forwardAccountId);
  const cleanupJobRunner = new DefaultCleanupJobRunner({
    weiboClient,
    cleanupRepository,
  });
  return { weiboClient, cleanupRepository, cleanupJobRunner };
}

export type { CleanupJobInput };
