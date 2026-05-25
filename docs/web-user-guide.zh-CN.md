# Web 管理页使用说明

本文说明如何在 Web 管理页中完成以下操作：

- 登录后台
- 登录微博账号
- 设置转发评语风格
- 创建转发规则
- 执行 `dry-run`
- 查看转发历史
- 一键复制转发链接

## 访问管理页

先启动服务：

```bash
npm run start:api
```

或：

```bash
docker compose up -d --build
```

然后在浏览器打开：

```text
http://你的IP:3000/admin/
```

如果就在本机访问，也可以使用：

```text
http://localhost:3000/admin/
```

## 1. 登录后台

1. 打开 `/admin/` 登录页。
2. 输入用户名和密码。
3. 点击 `Login`。

登录成功后会进入后台首页 `Overview`。

如果你是通过局域网访问，建议确认当前页面连接的 API 地址也是局域网地址，而不是旧的 `localhost`。

## 2. 登录微博账号

进入左侧菜单 `Accounts`。

### 方式 A：扫码登录（推荐）

1. 在 `New Account` 中输入账号名称，例如 `my-main`。
2. 点击 `Create`。
3. 在下方 `Account List` 中找到该账号。
4. 点击 `QR Login`。
5. 按页面提示完成二维码登录。
6. 用微博 App 扫码确认。
7. 登录成功后，系统会自动保存该账号的登录态。

适合以下场景：

- 本机使用
- 局域网部署
- 不想手动处理 `storageState.json`

### 方式 B：上传登录态

如果你已经有 Playwright 登录态文件：

1. 进入 `Accounts`
2. 找到目标账号
3. 点击 `Upload Session`
4. 选择并上传对应的 `storageState.json`

适合以下场景：

- 已有现成登录态
- 服务器环境不方便直接扫码

## 3. 设置转发评语风格

进入左侧菜单 `Settings`，在 `Comment Style` 区域设置默认评语风格。

### 设置方法

1. 在 `Style template` 中选择一个模板。
2. 可选：在 `Custom system prompt` 中输入补充要求。
3. 点击 `Save`。

### 使用建议

- 如果只想统一整体风格，直接选择模板即可。
- 如果你想控制语气、格式、行业风格或字数，再填写 `Custom system prompt`。
- 这里保存的是当前用户的默认风格，后续新建规则时可以直接继承。

## 4. 设置转发规则

进入左侧菜单 `Rules`，在 `New Rule` 区域创建规则。

### 基本字段

1. `Forward Account`
   - 选择已经登录微博的转发账号。
2. `Source UID`
   - 填写要监控的源微博 UID。
3. `Limit per run`
   - 每次最多处理多少条微博。
4. `Cron schedule (optional)`
   - 可选，填写 cron 表达式，例如 `0 9 * * *` 表示每天 9 点。

### 评语风格

规则级别还可以单独设置评语方式：

- `inherit`：继承 `Settings` 中的默认风格
- `template`：为这条规则单独指定模板
- `custom`：为这条规则单独填写自定义 prompt

如果你只是刚开始使用，建议先选择：

```text
inherit
```

全部填写完成后，点击 `Create Rule`。

创建成功后，这条规则会出现在下方的 `Rule List` 中。

## 5. 先执行 dry-run

正式转发前，建议先试运行。

在 `Rules` 页面中，每条规则后面都有：

- `Run`
- `Dry Run`
- `Enable / Disable`
- `Delete`

### 单条规则 dry-run

1. 找到目标规则
2. 点击 `Dry Run`

系统会：

- 抓取源微博
- 生成评语
- 输出执行日志

但不会真正执行转发。

### 全部规则 dry-run

在首页 `Overview` 的 `Quick Actions` 区域，可以点击：

```text
Dry Run All
```

用于检查所有启用规则的执行结果。

### 查看 dry-run 输出

在 `Overview` 或 `Rules` 页面都可以查看 `Execution log`。

这里通常可以确认：

- 是否成功抓取到微博
- 是否正确生成评语
- 是否存在登录失效
- 预计会转发多少条

## 6. 正式执行转发

确认 dry-run 没问题后，再执行正式转发。

### 执行单条规则

在 `Rules` 页面点击：

```text
Run
```

### 执行全部启用规则

在 `Overview` 页面点击：

```text
Run All Rules
```

执行成功后，结果会进入历史记录。

## 7. 查看转发历史

进入左侧菜单 `History`。

该页面可以查看已完成的转发记录。

### 可查看内容

每条记录通常包括：

- 转发时间
- 转发账号
- 源 UID
- 微博 `mid`
- 生成的评语
- 原微博链接
- 我的转发链接

### 筛选方式

顶部 `Filter` 区域支持：

- 按 `Forward Account` 筛选
- 按 `Source UID` 筛选

对应按钮：

- `Search`：执行筛选
- `Reset`：恢复默认条件

## 8. 一键复制链接

`History` 页面支持两种复制方式。

### 复制单条转发链接

在每条记录右侧：

- 点击 `Copy`：复制这条转发链接
- 点击 `Open`：直接打开链接

### 一键复制当天全部链接

历史记录按天分组后，每天分组标题右侧会显示按钮：

```text
Copy today's links (tab-separated)
```

点击后会把当天所有转发链接一次性复制到剪贴板，并使用 `Tab` 分隔。

适合：

- 粘贴到 Excel
- 发给同事
- 汇总日报

## 推荐使用顺序

第一次使用建议按以下顺序操作：

1. 登录后台
2. 在 `Accounts` 中创建账号并登录微博
3. 在 `Settings` 中设置默认评语风格
4. 在 `Rules` 中创建一条规则
5. 先点击 `Dry Run`
6. 检查 `Execution log`
7. 确认没有问题后点击 `Run`
8. 在 `History` 中查看结果并复制链接

## 常见建议

- 先 `dry-run`，再正式执行
- 初次测试时，`Limit per run` 建议设置为 `1`
- 建议先只创建一条规则进行验证
- 局域网使用时，优先通过 `http://你的局域网IP:3000/admin/` 访问
- 如果扫码或请求异常，优先检查当前 API 地址是否正确
