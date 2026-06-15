import { randomDelay } from "../publisher.js";
import { getLoggedInUid } from "../weibo-user.js";
import { cleanupDateRangeToBounds } from "./cleanup-dates.js";
import {
  splitCleanupPosts,
  textContainsTag,
} from "./filter-cleanup-candidates.js";
import type {
  CleanupJobInput,
  CleanupJobResult,
  CleanupJobRunner,
  CleanupRepository,
  RunCleanupOptions,
  WeiboClient,
} from "./interfaces.js";
import { createRunLogFn } from "./run-logger.js";
import type { WeiboPost } from "../types.js";
import type { BrowserContext } from "playwright";

export interface DefaultCleanupJobRunnerDeps {
  weiboClient: WeiboClient;
  cleanupRepository: CleanupRepository;
}

function formatTagDeleteReason(text: string, tags: string[]): string {
  const matched = tags.filter((tag) => textContainsTag(text, tag));
  if (matched.length === 0) return "命中 tag";
  return `命中 tag：${matched.map((tag) => `#${tag.replace(/^#/, "")}`).join("、")}`;
}

export class DefaultCleanupJobRunner implements CleanupJobRunner {
  constructor(private readonly deps: DefaultCleanupJobRunnerDeps) {}

  async run(
    input: CleanupJobInput,
    options: RunCleanupOptions = {},
  ): Promise<CleanupJobResult> {
    const { weiboClient } = this.deps;
    if (options.context) {
      return this.execute(input, options.context, options);
    }
    return weiboClient.withSession(input.headless, (context) =>
      this.execute(input, context, options),
    );
  }

  private async execute(
    input: CleanupJobInput,
    context: BrowserContext,
    options: RunCleanupOptions,
  ): Promise<CleanupJobResult> {
    const { forwardAccountId, since, until, postTypes, requiredTags, dryRun } = input;
    const { weiboClient, cleanupRepository } = this.deps;
    const log = createRunLogFn(options.logger);

    let scanned = 0;
    let candidates = 0;
    let deleted = 0;
    let skipped = 0;

    const { sinceMs, untilMs } = cleanupDateRangeToBounds(since, until);
    const processedMids = await cleanupRepository.getProcessedMids(forwardAccountId);
    log(`已处理 ${processedMids.size} 条（将跳过）…`);
    log(`扫描时间范围: ${since} ~ ${until}`);

    const page = await context.newPage();
    let allPosts;
    try {
      const myUid = await getLoggedInUid(page);
      log(`当前登录 UID=${myUid}，按时间范围抓取本人时间线…`);
      allPosts = await weiboClient.scrapeMyTimelineByDateRange(page, myUid, {
        sinceMs,
        untilMs,
        maxScrolls: 30,
      });
    } finally {
      await page.close();
    }

    scanned = allPosts.length;
    if (allPosts.length === 0) {
      log("时间范围内未抓取到任何微博，请检查登录态或页面结构是否变化。");
      return {
        scanned,
        candidates,
        deleted,
        skipped,
        logs: options.logger?.getLines(),
        dryRun,
      };
    }

    const split = splitCleanupPosts(allPosts, {
      postTypes,
      autoDeleteTags: requiredTags,
      processedMids,
    });
    candidates = split.toDelete.length;
    skipped +=
      split.skippedNoTag +
      split.skippedProcessed +
      split.skippedUnknownMedia +
      split.skippedMediaType;

    if (split.skippedUnknownMedia > 0) {
      log(`跳过 ${split.skippedUnknownMedia} 条媒体类型未识别的微博`);
    }
    if (split.skippedMediaType > 0) {
      log(`跳过 ${split.skippedMediaType} 条不符合 postTypes 的微博`);
    }
    if (split.skippedNoTag > 0) {
      log(`跳过 ${split.skippedNoTag} 条未命中 tag 的微博`);
    }

    log(
      `扫描 ${scanned} 条：tag 命中待删 ${split.toDelete.length} 条（tag=${requiredTags.join("、") || "未配置"}）`,
    );

    const deletePost = async (post: WeiboPost, reason: string): Promise<boolean> => {
      if (dryRun) {
        log(`(dry-run，将删除) ${post.detailUrl} reason=${reason}`);
        deleted++;
        return true;
      }
      try {
        await weiboClient.deletePost(context, post);
        await cleanupRepository.markProcessed({
          forwardAccountId,
          mid: post.mid,
          detailUrl: post.detailUrl,
          judgeReason: reason,
          dryRun: false,
        });
        deleted++;
        log(`已删除: ${post.detailUrl} reason=${reason}`);
        await randomDelay(3000, 6000);
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`删除失败: ${msg}`);
        skipped++;
        return false;
      }
    };

    for (const post of split.toDelete) {
      log("");
      log(`--- mid=${post.mid} type=${post.mediaType ?? "unknown"} [tag 命中] ---`);
      log(post.text.slice(0, 200) + (post.text.length > 200 ? "…" : ""));
      await deletePost(post, formatTagDeleteReason(post.text, requiredTags));
    }

    log("");
    log(
      `完成：扫描 ${scanned}，tag 命中 ${candidates}，${dryRun ? "将删" : "已删"} ${deleted}，跳过 ${skipped}`,
    );

    return {
      scanned,
      candidates,
      deleted,
      skipped,
      logs: options.logger?.getLines(),
      dryRun,
    };
  }
}
