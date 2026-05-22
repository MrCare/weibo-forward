import { DEFAULT_FORWARD_ACCOUNT_ID } from "./constants.js";
import { DefaultJobRunner } from "./job-runner.js";
import { FileForwardRepository } from "./file-forward-repository.js";
import { PlaywrightWeiboClient } from "./playwright-weibo-client.js";
import { createCommentGenerator } from "./comment-generator-factory.js";

export function createDefaultDeps(
  forwardAccountId = DEFAULT_FORWARD_ACCOUNT_ID,
  storageStatePath?: string,
) {
  const weiboClient = new PlaywrightWeiboClient(forwardAccountId, storageStatePath);
  const commentGenerator = createCommentGenerator();
  const forwardRepository = new FileForwardRepository();
  const jobRunner = new DefaultJobRunner({
    weiboClient,
    commentGenerator,
    forwardRepository,
  });

  return { weiboClient, commentGenerator, forwardRepository, jobRunner };
}
