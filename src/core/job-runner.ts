import { randomDelay } from "../publisher.js";
import { filterNewPosts } from "./filter-new-posts.js";
import type {
  CommentGenerator,
  ForwardJobInput,
  ForwardJobResult,
  ForwardRepository,
  JobRunner,
  RunForwardOptions,
  WeiboClient,
} from "./interfaces.js";
import { createRunLogFn } from "./run-logger.js";
import type { BrowserContext } from "playwright";

export interface DefaultJobRunnerDeps {
  weiboClient: WeiboClient;
  commentGenerator: CommentGenerator;
  forwardRepository: ForwardRepository;
}

export class DefaultJobRunner implements JobRunner {
  constructor(private readonly deps: DefaultJobRunnerDeps) {}

  async run(
    input: ForwardJobInput,
    options: RunForwardOptions = {},
  ): Promise<ForwardJobResult> {
    const { weiboClient } = this.deps;
    const { headless } = input;

    if (options.context) {
      return this.execute(input, options.context, options);
    }

    return weiboClient.withSession(headless, (context) =>
      this.execute(input, context, options),
    );
  }

  private async execute(
    input: ForwardJobInput,
    context: BrowserContext,
    options: RunForwardOptions,
  ): Promise<ForwardJobResult> {
    const { forwardAccountId, sourceUid, limit, dryRun } = input;
    const { weiboClient, commentGenerator, forwardRepository } = this.deps;
    const log = createRunLogFn(options.logger);

    let processed = 0;
    let forwarded = 0;

    const forwardedMids = await forwardRepository.getForwardedMids(
      forwardAccountId,
      sourceUid,
    );
    log(
      `抓取源账号 UID=${sourceUid}（已转发 ${forwardedMids.size} 条，将跳过并向后查找）…`,
    );

    const page = await context.newPage();
    let allPosts;
    try {
      allPosts = await weiboClient.scrapeTimeline(page, sourceUid, {
        neededCount: limit,
        forwardedMids,
      });
    } finally {
      await page.close();
    }

    if (allPosts.length === 0) {
      log("未抓取到任何微博，请检查 UID 或页面结构是否变化。");
      return {
        processed,
        forwarded,
        skipped: 0,
        logs: options.logger?.getLines(),
        dryRun,
      };
    }

    const toProcess = filterNewPosts(allPosts, forwardedMids, limit);

    if (toProcess.length === 0) {
      log("没有新的待转发微博（均已处理过）。");
      return {
        processed,
        forwarded,
        skipped: 0,
        logs: options.logger?.getLines(),
        dryRun,
      };
    }

    log(`待处理 ${toProcess.length} 条`);
    log("");

    for (let i = 0; i < toProcess.length; i++) {
      const post = toProcess[i]!;
      log(`--- [${i + 1}/${toProcess.length}] mid=${post.mid} ---`);
      log(`链接: ${post.detailUrl}`);
      log(
        `原文: ${post.text.slice(0, 120)}${post.text.length > 120 ? "…" : ""}`,
      );

      const comment = await commentGenerator.generate(post.text, input.systemPrompt);
      log(`评语: ${comment}`);
      processed++;

      if (dryRun) {
        log("(dry-run，跳过转发)");
        log("");
        continue;
      }

      const myRepostUrl = await weiboClient.repost(context, post, comment);
      await forwardRepository.markForwarded({
        forwardAccountId,
        mid: post.mid,
        sourceUid,
        sourceUrl: post.detailUrl,
        comment,
        myRepostUrl,
      });
      await forwardRepository.appendMyRepostLink(forwardAccountId, myRepostUrl);

      log(`✓ 已转发 mid=${post.mid}`);
      log(`  我的转发: ${myRepostUrl}`);
      log(
        `  源微博记录: ${forwardRepository.getForwardedPostsCsvPath(forwardAccountId)}`,
      );
      log(
        `  我的链接 CSV: ${forwardRepository.getMyRepostLinksCsvPath(forwardAccountId)}`,
      );
      log("");
      forwarded++;

      if (i < toProcess.length - 1) {
        await randomDelay();
      }
    }

    return {
      processed,
      forwarded,
      skipped: 0,
      logs: options.logger?.getLines(),
      dryRun,
    };
  }
}
