import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PROMPT_TEMPLATE_ID,
  formatRulePromptProfile,
  inferPromptTemplateIdFromSystemPrompt,
  parseRulePromptProfile,
  PROMPT_TEMPLATES,
  resolveSystemPrompt,
} from "./prompt-templates.js";

describe("prompt-templates", () => {
  const userDefault = {
    promptTemplateId: DEFAULT_PROMPT_TEMPLATE_ID,
    customPrompt: null as string | null,
  };

  it("规则 custom 优先于用户默认", () => {
    const sys = resolveSystemPrompt(userDefault, "custom:本条专用");
    assert.equal(sys, "本条专用");
  });

  it("规则 template 优先于用户模板", () => {
    const sys = resolveSystemPrompt(userDefault, "template:weibo_normal");
    assert.equal(sys, PROMPT_TEMPLATES.weibo_normal.systemPrompt);
  });

  it("用户 custom 覆盖用户模板", () => {
    const sys = resolveSystemPrompt({
      promptTemplateId: "academic",
      customPrompt: "用户自定义",
    });
    assert.equal(sys, "用户自定义");
  });

  it("自定义 system prompt 不会被误判为李白模板", () => {
    assert.equal(
      inferPromptTemplateIdFromSystemPrompt("你是一位普通中文写手，写 1 到 2 句自然转发评语。"),
      undefined,
    );
  });

  it("format 与 parse 可往返", () => {
    const raw = formatRulePromptProfile({ templateId: "internet_slang" });
    assert.equal(parseRulePromptProfile(raw).templateId, "internet_slang");
  });
});
