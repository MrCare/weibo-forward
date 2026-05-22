# 贡献指南

感谢关注本项目。这是一个**个人自动化工具**，与微博官方无关；使用自动化可能违反平台服务条款，请自行评估风险。

## 开发环境

- Node.js 18+
- `npm install`
- `npx playwright install chromium`
- 本机安装 [`qwen`](https://github.com/QwenLM/qwen-code) CLI（用于生成转发评语）

```bash
cp .env.example .env
npm run auth:login   # 登录态写入 data/（勿提交）
npm run forward -- --dry-run
```

## 架构约定

核心逻辑在 `src/core/`：

| 模块 | 职责 |
|------|------|
| `WeiboClient` | 登录、抓时间线、执行转发 |
| `CommentGenerator` | 评语生成 |
| `ForwardRepository` | 已转发记录、我的链接 |
| `JobRunner` | 一次 forward 任务编排 |

`src/cli.ts` 只负责解析参数、组装依赖、调用 `JobRunner`。

## 提交前检查

```bash
npx tsc --noEmit
npm test
```

## 请勿提交

- `.env`、`data/storageState.json`、CSV/JSON 数据文件
- 含真实 cookie 或账号信息的截图

## Pull Request

1. 小步提交，说明动机与测试方式
2. 不扩大改动范围（无关重构另开 PR）
3. 若改动选择器或页面交互，注明测试环境与微博页面版本
