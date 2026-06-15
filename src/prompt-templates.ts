/**
 * 内置评语风格模板 + 用户/规则级提示词解析。
 *
 * 规则 `prompt_profile`：
 * - 空：继承用户默认
 * - `template:<id>` 或裸 id（如 `libai`）
 * - `custom:<正文>`：本条规则专用 system 提示词
 */

export type PromptTemplateId =
  | "weibo_normal"
  | "libai"
  | "news_broadcast"
  | "academic"
  | "translationese"
  | "internet_slang";

export const PROMPT_TEMPLATE_IDS: PromptTemplateId[] = [
  "weibo_normal",
  "libai",
  "news_broadcast",
  "academic",
  "translationese",
  "internet_slang",
];

export interface PromptTemplateMeta {
  id: PromptTemplateId;
  nameKey: string;
  descriptionKey: string;
  systemPrompt: string;
}

const COMMON_RULES = `- 不要主动添加 #话题#，除非原文已有
- 不要输出引号包裹的整段，直接输出评语正文
- 不要解释、不要编号、不要前缀如「转发评语：」`;

export const PROMPT_TEMPLATES: Record<PromptTemplateId, PromptTemplateMeta> = {
  weibo_normal: {
    id: "weibo_normal",
    nameKey: "tplWeiboNormal",
    descriptionKey: "tplWeiboNormalDesc",
    systemPrompt: `你是一位活跃在微博上的普通用户，正在为一条微博撰写「转发评语」。
要求：
- 语气自然、口语化，像真人随手转发，1～3 句话即可
- 可表达认同、调侃或补充观点，避免官腔
- 字数控制在 140 字以内
${COMMON_RULES}`,
  },
  libai: {
    id: "libai",
    nameKey: "tplLibai",
    descriptionKey: "tplLibaiDesc",
    systemPrompt: `你是大诗人李白穿越到现在，正在为一条微博撰写「转发评语」。
要求：
- 必须写完整的四句七言律诗：分四行输出，每行恰好一句、每句 7 个汉字，共 28 字
- 禁止只写一副对联（两句）、禁止把四句挤在一行或两行里
- 需要朗朗上口，易于传播，并蕴含人生哲理
${COMMON_RULES}`,
  },
  news_broadcast: {
    id: "news_broadcast",
    nameKey: "tplNews",
    descriptionKey: "tplNewsDesc",
    systemPrompt: `你是一位新闻联播/政务新媒体撰稿人，正在为一条微博撰写「转发评语」。
要求：
- 语气庄重、规范，类似新闻通稿或公文通报，2～4 句
- 可使用「据悉」「值得关注的是」等书面表述
- 避免网络梗与过度情绪化
${COMMON_RULES}`,
  },
  academic: {
    id: "academic",
    nameKey: "tplAcademic",
    descriptionKey: "tplAcademicDesc",
    systemPrompt: `你是一位高校研究者，正在为一条微博撰写「转发评语」。
要求：
- 语气客观、严谨，可带适度学术用语，2～4 句
- 像简短学术点评，不要写成论文摘要
${COMMON_RULES}`,
  },
  translationese: {
    id: "translationese",
    nameKey: "tplTranslation",
    descriptionKey: "tplTranslationDesc",
    systemPrompt: `你是一位翻译腔较重的中文写手，正在为一条微博撰写「转发评语」。
要求：
- 带有译制片/欧美小说翻译腔（如「然而」「事实上」「不得不说」）
- 略带生硬但可读，2～4 句，幽默克制
${COMMON_RULES}`,
  },
  internet_slang: {
    id: "internet_slang",
    nameKey: "tplSlang",
    descriptionKey: "tplSlangDesc",
    systemPrompt: `你是一位熟悉中文互联网热梗的年轻网友，正在为一条微博撰写「转发评语」。
要求：
- 语气轻松有网感，可适度使用流行语（如「绝了」「狠狠共情」）
- 1～3 句，不要低俗辱骂，不要堆砌梗
${COMMON_RULES}`,
  },
};

export const DEFAULT_PROMPT_TEMPLATE_ID: PromptTemplateId = "libai";

export const PROMPT_TEMPLATE_LIST = Object.values(PROMPT_TEMPLATES);

export function isPromptTemplateId(id: string): id is PromptTemplateId {
  return id in PROMPT_TEMPLATES;
}

export interface UserPromptSettings {
  promptTemplateId: PromptTemplateId;
  customPrompt: string | null;
}

export function userPromptSettingsFromRow(row: {
  prompt_template_id: string;
  custom_prompt: string | null;
}): UserPromptSettings {
  const id = row.prompt_template_id;
  return {
    promptTemplateId: isPromptTemplateId(id) ? id : DEFAULT_PROMPT_TEMPLATE_ID,
    customPrompt: row.custom_prompt,
  };
}

export function buildForwardUserPrompt(postText: string, templateId?: PromptTemplateId): string {
  if (templateId === "libai") {
    return `请为以下微博写转发评语。只输出四句七言诗，每行一句（共四行），不要合并行、不要少于四句：\n\n${postText}`;
  }
  return `请为以下微博写转发评语。只输出评语正文：\n\n${postText}`;
}

export function inferPromptTemplateIdFromSystemPrompt(
  systemPrompt: string,
): PromptTemplateId | undefined {
  for (const meta of Object.values(PROMPT_TEMPLATES)) {
    if (systemPrompt === meta.systemPrompt) return meta.id;
  }
  return undefined;
}

export function parseRulePromptProfile(profile: string | null | undefined): {
  templateId?: PromptTemplateId;
  customPrompt?: string;
} {
  if (!profile?.trim()) return {};
  const raw = profile.trim();
  if (raw.startsWith("custom:")) {
    return { customPrompt: raw.slice("custom:".length).trim() };
  }
  if (raw.startsWith("template:")) {
    const id = raw.slice("template:".length).trim();
    return isPromptTemplateId(id) ? { templateId: id } : {};
  }
  if (isPromptTemplateId(raw)) return { templateId: raw };
  return { customPrompt: raw };
}

export function formatRulePromptProfile(input: {
  templateId?: PromptTemplateId | null;
  customPrompt?: string | null;
}): string | null {
  const custom = input.customPrompt?.trim();
  if (custom) return `custom:${custom}`;
  if (input.templateId && isPromptTemplateId(input.templateId)) {
    return `template:${input.templateId}`;
  }
  return null;
}

export function resolveSystemPrompt(
  user: UserPromptSettings,
  ruleProfile?: string | null,
): string {
  const rule = parseRulePromptProfile(ruleProfile);
  if (rule.customPrompt) return rule.customPrompt;
  if (rule.templateId) return PROMPT_TEMPLATES[rule.templateId].systemPrompt;

  if (user.customPrompt?.trim()) return user.customPrompt.trim();

  const tpl = user.promptTemplateId;
  return PROMPT_TEMPLATES[tpl]?.systemPrompt ?? PROMPT_TEMPLATES[DEFAULT_PROMPT_TEMPLATE_ID].systemPrompt;
}

export function resolveUserPromptTemplateId(
  user: UserPromptSettings,
  ruleProfile?: string | null,
): PromptTemplateId | undefined {
  const rule = parseRulePromptProfile(ruleProfile);
  if (rule.customPrompt) return undefined;
  if (rule.templateId) return rule.templateId;
  if (user.customPrompt?.trim()) return undefined;
  return user.promptTemplateId;
}

export function templateMetaForApi() {
  return PROMPT_TEMPLATE_LIST.map((t) => ({
    id: t.id,
    nameKey: t.nameKey,
    descriptionKey: t.descriptionKey,
  }));
}

/** @deprecated 兼容旧引用 */
export const FORWARD_SYSTEM_PROMPT = PROMPT_TEMPLATES.libai.systemPrompt;

// --- 内容清理判定模板 ---

export type JudgeTemplateId = "dreame-video-negative";

export const JUDGE_TEMPLATE_IDS: JudgeTemplateId[] = ["dreame-video-negative"];

export interface JudgeTemplateMeta {
  id: JudgeTemplateId;
  nameKey: string;
  descriptionKey: string;
  systemPrompt: string;
}

export const JUDGE_TEMPLATES: Record<JudgeTemplateId, JudgeTemplateMeta> = {
  "dreame-video-negative": {
    id: "dreame-video-negative",
    nameKey: "judgeDreameVideoNegative",
    descriptionKey: "judgeDreameVideoNegativeDesc",
    systemPrompt: `你是微博品牌内容审核助手，负责判断某条微博是否应当删除。

删除标准（满足即 shouldDelete=true）：
- 内容不属于产品、技术、创新类
- 且内容非高端、非正向（如娱乐八卦、吐槽、负面舆情、低质蹭热点、损害品牌形象等）

应当保留（shouldDelete=false）的内容：
- 产品展示、功能介绍、使用体验等产品类内容
- 技术分享、研发、工程、专利等技术类内容
- 创新、突破、行业领先等创新类内容
- 高端品牌形象、企业家正面形象、行业领导力
- 整体调性正向、专业、有品牌价值

说明：若微博带有 #追觅 或 #俞浩 话题，已由规则直接删除，不会交给你判定。你只需判断无上述 tag 的微博。

请根据正文语义综合判断，输出 JSON：{"shouldDelete": boolean, "reason": "简要中文理由"}`,
  },
};

export const JUDGE_TEMPLATE_LIST = Object.values(JUDGE_TEMPLATES);

export function isJudgeTemplateId(id: string): id is JudgeTemplateId {
  return id in JUDGE_TEMPLATES;
}

export function parseCleanupJudgeProfile(profile: string | null | undefined): {
  templateId?: JudgeTemplateId;
  customPrompt?: string;
} {
  if (!profile?.trim()) return {};
  const raw = profile.trim();
  if (raw.startsWith("custom:")) {
    return { customPrompt: raw.slice("custom:".length).trim() };
  }
  if (raw.startsWith("template:")) {
    const id = raw.slice("template:".length).trim();
    return isJudgeTemplateId(id) ? { templateId: id } : {};
  }
  if (isJudgeTemplateId(raw)) return { templateId: raw };
  return { customPrompt: raw };
}

export function resolveCleanupJudgePrompt(
  judgeProfile?: string | null,
  judgePrompt?: string | null,
): string {
  if (judgePrompt?.trim()) return judgePrompt.trim();
  const parsed = parseCleanupJudgeProfile(judgeProfile);
  if (parsed.customPrompt) return parsed.customPrompt;
  if (parsed.templateId) return JUDGE_TEMPLATES[parsed.templateId].systemPrompt;
  return JUDGE_TEMPLATES["dreame-video-negative"].systemPrompt;
}

export function formatCleanupJudgeProfile(input: {
  templateId?: JudgeTemplateId | null;
  customPrompt?: string | null;
}): string | null {
  const custom = input.customPrompt?.trim();
  if (custom) return `custom:${custom}`;
  if (input.templateId && isJudgeTemplateId(input.templateId)) {
    return `template:${input.templateId}`;
  }
  return null;
}

export function judgeTemplateMetaForApi() {
  return JUDGE_TEMPLATE_LIST.map((t) => ({
    id: t.id,
    nameKey: t.nameKey,
    descriptionKey: t.descriptionKey,
  }));
}
