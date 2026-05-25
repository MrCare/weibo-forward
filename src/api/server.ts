import { readFile } from "node:fs/promises";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import express, { type Response } from "express";
import { z } from "zod";
import { loadEnvSettings } from "../config.js";
import { describeCommentGenerator } from "../core/comment-generator-factory.js";
import {
  appendActorRunLog,
  finishActorRun,
  getActorRunLogSnapshot,
  startActorRun,
} from "../core/live-run-log-store.js";
import { RunInProgressError, withRunLock } from "../core/run-lock.js";
import { RunLogger } from "../core/run-logger.js";
import { getDatabase } from "../db/client.js";
import {
  expireStaleSessions,
  getLoginSession,
} from "../db/login-session-store.js";
import {
  AccessDeniedError,
  resolveCreateUserId,
  resolveListUserId,
  resolvePromptTargetUserId,
} from "../db/access-control.js";
import { listForwardRecordsForActor } from "../db/forward-record-store.js";
import {
  createAccount,
  createRule,
  createUser,
  deleteAccount,
  deleteRule,
  getUserPromptSettings,
  listAccounts,
  listAllAccounts,
  listAllRules,
  listRules,
  listUsers,
  resolveAccount,
  resolveRule,
  rotateApiKey,
  updateRule,
  updateUserPromptSettings,
  verifyUserLogin,
} from "../db/user-store.js";
import {
  formatRulePromptProfile,
  isPromptTemplateId,
  parseRulePromptProfile,
  templateMetaForApi,
} from "../prompt-templates.js";
import type { ForwardRecordRow } from "../db/types.js";
import { reloadCronScheduler } from "../services/cron-scheduler.js";
import { runTenantAllRules, runTenantRule } from "../services/tenant-forward-service.js";
import {
  getLoginSessionPublic,
  startWeiboLoginSession,
} from "../services/weibo-login-session-service.js";
import { ensureTenantAccountDir, tenantStorageStatePath } from "../tenancy/paths.js";
import { requireAuth, type AuthedRequest } from "./middleware/auth.js";

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../public");

const PORT = Number(process.env.PORT ?? 3000);
const ALLOW_REGISTER = process.env.ALLOW_REGISTER !== "false";

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function getLanBaseUrls(port: number): string[] {
  const urls = new Set<string>();
  const nets = networkInterfaces();

  for (const entries of Object.values(nets)) {
    for (const item of entries ?? []) {
      const family = String(item.family);
      if (family !== "IPv4" && family !== "4") continue;
      if (item.internal) continue;
      urls.add(`http://${item.address}:${port}`);
    }
  }

  return [...urls].sort();
}

function routeParam(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}

function handleError(res: Response, err: unknown): void {
  if (err instanceof RunInProgressError) {
    res.status(409).json({ error: err.message });
    return;
  }
  if (err instanceof AccessDeniedError) {
    res.status(403).json({ error: err.message });
    return;
  }
  const msg = err instanceof Error ? err.message : String(err);
  console.error(err);
  res.status(400).json({ error: msg });
}

function queryUserId(req: AuthedRequest): string | undefined {
  const v = req.query.userId;
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

const promptTemplateIdZod = z.enum([
  "weibo_normal",
  "libai",
  "news_broadcast",
  "academic",
  "translationese",
  "internet_slang",
]);

function buildPromptProfileFromBody(body: {
  promptProfile?: string | null;
  promptTemplateId?: string | null;
  customPrompt?: string | null;
  promptInherit?: boolean;
}): string | null | undefined {
  if (body.promptInherit) return null;
  if (body.promptTemplateId !== undefined || body.customPrompt !== undefined) {
    const tid =
      body.promptTemplateId && isPromptTemplateId(body.promptTemplateId)
        ? body.promptTemplateId
        : undefined;
    return formatRulePromptProfile({
      templateId: tid,
      customPrompt: body.customPrompt,
    });
  }
  return body.promptProfile;
}

function mapRule(r: import("../db/types.js").ForwardRuleRow) {
  const parsed = parseRulePromptProfile(r.prompt_profile);
  return {
    id: r.id,
    userId: r.user_id,
    forwardAccountId: r.forward_account_id,
    sourceUid: r.source_uid,
    limit: r.limit_count,
    enabled: r.enabled === 1,
    promptProfile: r.prompt_profile,
    promptTemplateId: parsed.templateId ?? null,
    customPrompt: parsed.customPrompt ?? null,
    promptInherit: !r.prompt_profile,
    schedule: r.schedule,
    createdAt: r.created_at,
  };
}

function mapForwardRecord(r: ForwardRecordRow) {
  return {
    id: r.id,
    userId: r.user_id,
    forwardAccountId: r.forward_account_id,
    sourceUid: r.source_uid,
    mid: r.mid,
    sourceUrl: r.source_url,
    comment: r.comment,
    myRepostUrl: r.my_repost_url,
    forwardedAt: r.forwarded_at,
  };
}

export function createApp() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use("/web", express.static(join(PUBLIC_DIR, "web")));
  app.use("/admin", express.static(join(PUBLIC_DIR, "admin")));
  app.get("/", (_req, res) => {
    res.redirect("/admin/");
  });

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: "weibo-auto-forward",
      commentGenerator: describeCommentGenerator(),
      cronEnabled: process.env.CRON_ENABLED !== "false",
    });
  });

  // --- auth ---
  if (ALLOW_REGISTER) {
    app.post("/api/v1/auth/register", (req, res) => {
      try {
        const body = z
          .object({
            username: z.string().min(2).max(64),
            password: z.string().min(6).max(128),
          })
          .parse(req.body);

        const db = getDatabase();
        const user = createUser(db, body.username, body.password);
        res.status(201).json({
          id: user.id,
          username: user.username,
          role: user.role,
          apiKey: user.api_key,
        });
      } catch (err) {
        handleError(res, err);
      }
    });
  }

  app.post("/api/v1/auth/login", (req, res) => {
    try {
      const body = z
        .object({
          username: z.string(),
          password: z.string(),
        })
        .parse(req.body);

      const db = getDatabase();
      const user = verifyUserLogin(db, body.username, body.password);
      if (!user) {
        res.status(401).json({ error: "用户名或密码错误" });
        return;
      }
      res.json({
        id: user.id,
        username: user.username,
        role: user.role,
        apiKey: user.api_key,
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post("/api/v1/auth/rotate-key", requireAuth, (req: AuthedRequest, res) => {
    try {
      const db = getDatabase();
      const apiKey = rotateApiKey(db, req.user!.id);
      res.json({ apiKey });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.get("/api/v1/me", requireAuth, (req: AuthedRequest, res) => {
    res.json({
      id: req.user!.id,
      username: req.user!.username,
      role: req.user!.role,
    });
  });

  app.get("/api/v1/run-log", requireAuth, (req: AuthedRequest, res) => {
    try {
      const offset = z.coerce.number().int().min(0).default(0).parse(req.query.offset ?? 0);
      res.json(getActorRunLogSnapshot(req.user!.id, offset));
    } catch (err) {
      handleError(res, err);
    }
  });

  app.get("/api/v1/prompt-templates", requireAuth, (_req: AuthedRequest, res) => {
    res.json({ templates: templateMetaForApi() });
  });

  app.get("/api/v1/me/prompt-settings", requireAuth, (req: AuthedRequest, res) => {
    try {
      const db = getDatabase();
      const ownerId = resolvePromptTargetUserId(req.user!, queryUserId(req));
      const settings = getUserPromptSettings(db, ownerId);
      if (!settings) {
        res.status(404).json({ error: "用户不存在" });
        return;
      }
      res.json({
        userId: ownerId,
        promptTemplateId: settings.promptTemplateId,
        customPrompt: settings.customPrompt,
        templates: templateMetaForApi(),
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.patch("/api/v1/me/prompt-settings", requireAuth, (req: AuthedRequest, res) => {
    try {
      const body = z
        .object({
          promptTemplateId: promptTemplateIdZod.optional(),
          customPrompt: z.string().nullable().optional(),
          userId: z.string().optional(),
        })
        .parse(req.body);

      const db = getDatabase();
      const ownerId = resolvePromptTargetUserId(
        req.user!,
        body.userId ?? queryUserId(req),
      );
      const ok = updateUserPromptSettings(db, ownerId, {
        promptTemplateId: body.promptTemplateId,
        customPrompt: body.customPrompt,
      });
      if (!ok && body.promptTemplateId === undefined && body.customPrompt === undefined) {
        res.status(400).json({ error: "无有效更新字段" });
        return;
      }
      const settings = getUserPromptSettings(db, ownerId)!;
      res.json({
        userId: ownerId,
        promptTemplateId: settings.promptTemplateId,
        customPrompt: settings.customPrompt,
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.get("/api/v1/users", requireAuth, (req: AuthedRequest, res) => {
    try {
      if (req.user!.role !== "admin") {
        res.status(403).json({ error: "仅管理员可查看用户列表" });
        return;
      }
      const db = getDatabase();
      res.json({ users: listUsers(db) });
    } catch (err) {
      handleError(res, err);
    }
  });

  // --- accounts ---
  app.get("/api/v1/accounts", requireAuth, (req: AuthedRequest, res) => {
    try {
      const db = getDatabase();
      const scopeUserId = resolveListUserId(req.user!, queryUserId(req));
      const accounts = scopeUserId
        ? listAccounts(db, scopeUserId)
        : listAllAccounts(db);
      res.json({
        accounts: accounts.map((a) => ({
          id: a.id,
          userId: a.user_id,
          name: a.name,
          storageStatePath: tenantStorageStatePath(a.user_id, a.id),
          createdAt: a.created_at,
        })),
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post("/api/v1/accounts", requireAuth, (req: AuthedRequest, res) => {
    try {
      const body = z
        .object({
          name: z.string().min(1).max(64),
          userId: z.string().optional(),
        })
        .parse(req.body);
      const db = getDatabase();
      const ownerId = resolveCreateUserId(req.user!, body.userId);
      const account = createAccount(db, ownerId, body.name);
      res.status(201).json({
        id: account.id,
        userId: account.user_id,
        name: account.name,
        storageStatePath: tenantStorageStatePath(ownerId, account.id),
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.delete("/api/v1/accounts/:accountId", requireAuth, (req: AuthedRequest, res) => {
    try {
      const db = getDatabase();
      const accountId = routeParam(req.params.accountId);
      const account = resolveAccount(db, req.user!, accountId);
      if (!account) {
        res.status(404).json({ error: "账号不存在" });
        return;
      }
      const ok = deleteAccount(db, account.user_id, accountId);
      if (!ok) {
        res.status(404).json({ error: "账号不存在" });
        return;
      }
      res.status(204).end();
    } catch (err) {
      handleError(res, err);
    }
  });

  /** 上传 Playwright storageState.json（可从本机 npm run auth:login 后复制） */
  app.post(
    "/api/v1/accounts/:accountId/storage-state",
    requireAuth,
    async (req: AuthedRequest, res) => {
      try {
        const accountId = routeParam(req.params.accountId);
        const db = getDatabase();
        const account = resolveAccount(db, req.user!, accountId);
        if (!account) {
          res.status(404).json({ error: "账号不存在" });
          return;
        }

        const body = req.body;
        if (!body || typeof body !== "object") {
          res.status(400).json({
            error: "请 POST JSON  body 为 storageState 对象，或 raw application/json 文件内容",
          });
          return;
        }

        await ensureTenantAccountDir(account.user_id, accountId);
        const dest = tenantStorageStatePath(account.user_id, accountId);
        await mkdir(dirname(dest), { recursive: true });
        await writeFile(dest, JSON.stringify(body, null, 2), "utf-8");

        res.json({ ok: true, path: dest });
      } catch (err) {
        handleError(res, err);
      }
    },
  );

  /** 发起 Web 扫码登录（返回扫码页 URL） */
  app.post(
    "/api/v1/accounts/:accountId/login-sessions",
    requireAuth,
    (req: AuthedRequest, res) => {
      try {
        const accountId = routeParam(req.params.accountId);
        const db = getDatabase();
        const account = resolveAccount(db, req.user!, accountId);
        if (!account) {
          res.status(404).json({ error: "账号不存在" });
          return;
        }
        const result = startWeiboLoginSession(account.user_id, accountId);
        res.status(201).json(result);
      } catch (err) {
        handleError(res, err);
      }
    },
  );

  app.get(
    "/api/v1/accounts/:accountId/login-sessions/:sessionId",
    requireAuth,
    (req: AuthedRequest, res) => {
      try {
        const db = getDatabase();
        expireStaleSessions(db);
        const accountId = routeParam(req.params.accountId);
        const account = resolveAccount(db, req.user!, accountId);
        if (!account) {
          res.status(404).json({ error: "账号不存在" });
          return;
        }
        const session = getLoginSession(
          db,
          account.user_id,
          routeParam(req.params.sessionId),
        );
        if (!session || session.forward_account_id !== accountId) {
          res.status(404).json({ error: "登录会话不存在" });
          return;
        }
        res.json({
          sessionId: session.id,
          status: session.status,
          errorMessage: session.error_message,
          expiresAt: session.expires_at,
        });
      } catch (err) {
        handleError(res, err);
      }
    },
  );

  /** 扫码页轮询（无需平台 API Key，使用 login_token） */
  app.get("/api/v1/public/login-sessions/:sessionId", (req, res) => {
    const db = getDatabase();
    expireStaleSessions(db);
    const token = String(req.query.token ?? "");
    const session = getLoginSessionPublic(routeParam(req.params.sessionId), token);
    if (!session) {
      res.status(404).json({ error: "会话不存在或 token 无效" });
      return;
    }
    res.json({
      sessionId: session.id,
      status: session.status,
      errorMessage: session.error_message,
      expiresAt: session.expires_at,
    });
  });

  app.get("/api/v1/public/login-sessions/:sessionId/qr", async (req, res) => {
    try {
      const token = String(req.query.token ?? "");
      const session = getLoginSessionPublic(routeParam(req.params.sessionId), token);
      if (!session?.qr_image_path) {
        res.status(404).end();
        return;
      }
      const buf = await readFile(session.qr_image_path);
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "no-store");
      res.send(buf);
    } catch {
      res.status(404).end();
    }
  });

  // --- forward records ---
  app.get("/api/v1/forward-records", requireAuth, (req: AuthedRequest, res) => {
    try {
      const query = z
        .object({
          accountId: z.string().optional(),
          sourceUid: z.string().optional(),
          userId: z.string().optional(),
          limit: z.coerce.number().int().positive().max(200).optional(),
          offset: z.coerce.number().int().min(0).optional(),
        })
        .parse(req.query);

      const db = getDatabase();
      const scopeUserId = resolveListUserId(req.user!, query.userId);
      const { records, total } = listForwardRecordsForActor(
        db,
        req.user!,
        {
          forwardAccountId: query.accountId,
          sourceUid: query.sourceUid,
          limit: query.limit,
          offset: query.offset,
        },
        scopeUserId,
      );

      res.json({
        records: records.map(mapForwardRecord),
        total,
        limit: query.limit ?? 50,
        offset: query.offset ?? 0,
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  // --- rules ---
  app.get("/api/v1/rules", requireAuth, (req: AuthedRequest, res) => {
    try {
      const db = getDatabase();
      const scopeUserId = resolveListUserId(req.user!, queryUserId(req));
      const rules = scopeUserId ? listRules(db, scopeUserId) : listAllRules(db);
      res.json({ rules: rules.map(mapRule) });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post("/api/v1/rules", requireAuth, (req: AuthedRequest, res) => {
    try {
      const body = z
        .object({
          forwardAccountId: z.string(),
          sourceUid: z.string(),
          limit: z.number().int().positive().default(1),
          enabled: z.boolean().optional(),
          promptProfile: z.string().optional(),
          promptTemplateId: promptTemplateIdZod.nullable().optional(),
          customPrompt: z.string().nullable().optional(),
          promptInherit: z.boolean().optional(),
          schedule: z.string().optional().nullable(),
          userId: z.string().optional(),
        })
        .parse(req.body);

      const db = getDatabase();
      const ownerId = resolveCreateUserId(req.user!, body.userId);
      const hasPromptFields =
        body.promptInherit ||
        body.promptProfile !== undefined ||
        body.promptTemplateId !== undefined ||
        body.customPrompt !== undefined;
      const rule = createRule(db, ownerId, {
        forwardAccountId: body.forwardAccountId,
        sourceUid: body.sourceUid,
        limit: body.limit,
        enabled: body.enabled,
        promptProfile: hasPromptFields
          ? (buildPromptProfileFromBody(body) ?? null)
          : undefined,
        schedule: body.schedule,
      });
      reloadCronScheduler(db);

      res.status(201).json(mapRule(rule));
    } catch (err) {
      handleError(res, err);
    }
  });

  app.patch("/api/v1/rules/:ruleId", requireAuth, (req: AuthedRequest, res) => {
    try {
      const body = z
        .object({
          enabled: z.boolean().optional(),
          schedule: z.string().nullable().optional(),
          limit: z.number().int().positive().optional(),
          promptProfile: z.string().nullable().optional(),
          promptTemplateId: promptTemplateIdZod.nullable().optional(),
          customPrompt: z.string().nullable().optional(),
          promptInherit: z.boolean().optional(),
        })
        .parse(req.body);
      const db = getDatabase();
      const rule = resolveRule(db, req.user!, routeParam(req.params.ruleId));
      if (!rule) {
        res.status(404).json({ error: "规则不存在" });
        return;
      }
      const promptProfile = buildPromptProfileFromBody(body);
      const patch = {
        enabled: body.enabled,
        schedule: body.schedule,
        limit: body.limit,
        ...(promptProfile !== undefined ? { promptProfile } : {}),
      };
      const ok = updateRule(db, rule.user_id, rule.id, patch);
      if (!ok) {
        res.status(404).json({ error: "规则不存在" });
        return;
      }
      reloadCronScheduler(db);
      res.json({ ok: true });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.delete("/api/v1/rules/:ruleId", requireAuth, (req: AuthedRequest, res) => {
    try {
      const db = getDatabase();
      const rule = resolveRule(db, req.user!, routeParam(req.params.ruleId));
      if (!rule) {
        res.status(404).json({ error: "规则不存在" });
        return;
      }
      const ok = deleteRule(db, rule.user_id, rule.id);
      if (!ok) {
        res.status(404).json({ error: "规则不存在" });
        return;
      }
      reloadCronScheduler(db);
      res.status(204).end();
    } catch (err) {
      handleError(res, err);
    }
  });

  // --- run ---
  app.post("/api/v1/rules/:ruleId/run", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const body = z.object({ dryRun: z.boolean().optional() }).parse(req.body ?? {});
      const env = loadEnvSettings({ dryRun: body.dryRun });
      const db = getDatabase();
      const actorId = req.user!.id;

      const result = await withRunLock(actorId, async () => {
        startActorRun(actorId, !!env.dryRun);
        const logger = new RunLogger((line) => appendActorRunLog(actorId, line));
        try {
          return await runTenantRule(db, req.user!, routeParam(req.params.ruleId), {
            headless: env.headless,
            dryRun: env.dryRun,
            logger,
          });
        } catch (err) {
          logger.log(`[error] ${err instanceof Error ? err.message : String(err)}`);
          throw err;
        } finally {
          finishActorRun(actorId);
        }
      });

      res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post("/api/v1/rules/run-all", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const body = z
        .object({ dryRun: z.boolean().optional(), userId: z.string().optional() })
        .parse(req.body ?? {});
      const env = loadEnvSettings({ dryRun: body.dryRun });
      const db = getDatabase();
      const scopeUserId = resolveListUserId(req.user!, body.userId);
      const actorId = req.user!.id;

      const result = await withRunLock(actorId, async () => {
        startActorRun(actorId, !!env.dryRun);
        const logger = new RunLogger((line) => appendActorRunLog(actorId, line));
        try {
          return await runTenantAllRules(db, req.user!, { ...env, logger }, scopeUserId);
        } catch (err) {
          logger.log(`[error] ${err instanceof Error ? err.message : String(err)}`);
          throw err;
        } finally {
          finishActorRun(actorId);
        }
      });

      res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  });

  return app;
}

export function startApiServer(): void {
  const db = getDatabase();
  reloadCronScheduler(db);
  const app = createApp();
  const localhostBase = `http://127.0.0.1:${PORT}`;
  const publicBase = process.env.PUBLIC_BASE_URL?.trim()
    ? normalizeBaseUrl(process.env.PUBLIC_BASE_URL)
    : null;
  const lanBases = getLanBaseUrls(PORT);

  app.listen(PORT, () => {
    console.log(`API 服务已启动: ${localhostBase}`);
    console.log(`管理控制台: ${localhostBase}/admin/`);
    for (const base of lanBases) {
      console.log(`局域网访问: ${base}`);
      console.log(`局域网控制台: ${base}/admin/`);
    }
    if (publicBase) {
      console.log(`对外访问地址(PUBLIC_BASE_URL): ${publicBase}`);
      console.log(`对外管理控制台: ${publicBase}/admin/`);
    }
    console.log(`健康检查: GET /health`);
    console.log(`评语生成: ${describeCommentGenerator()}`);
    console.log(`扫码登录页: GET /web/login.html?sessionId=...&token=...`);
    if (ALLOW_REGISTER) console.log("开放注册: POST /api/v1/auth/register");
  });
}
