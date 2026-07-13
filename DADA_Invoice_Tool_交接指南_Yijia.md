# DADA Invoice Submission Tool — 交接给 Yijia 操作指南

生成时间：2026-07-07
本次全程只做了"查看设置页面"的只读检查，未对 Vercel / Lark 后台做任何改动。所有操作步骤都留给你自己执行。

---

## 0. 运行模式判断

这个 app 是一个 Lark workplace gadget：前端是静态页面（`index.html`），后端是几个 Vercel Serverless Functions（`api/*.js`），数据存进 Lark Base 的"Client invoice tracker"多维表格。

实际检查发现，它属于一种**介于模式 A 和模式 C 之间**的情况：

- 项目文件夹里**没有 `.git`**，本地也没有连接任何 GitHub 仓库。
- 但 Vercel 后台显示这个项目**也没有连接 Git 仓库**（项目页显示的是"Connect Git Repository"按钮，说明从来没接过）。
- 唯一的部署方式是：你在自己电脑终端里，在这个项目文件夹下手动跑 `vercel` 命令部署（`.vercel/project.json` 里的链接信息证明了这一点，`SETUP GUIDE.md` 里也写了这是"Option B: Using Vercel CLI"）。

也就是说：**代码目前只存在于你自己电脑的这个文件夹里，以及 Vercel 上已经构建好的版本里，没有任何 Git 仓库备份。** 这是交接中最大的风险点——如果只交接 Vercel 权限，Yijia 拿到的只是"能管理线上运行的那份"，但看不到、改不了源代码，以后要改需求就没法做了。

**建议**：交接时顺手把这个项目建一个 GitHub 仓库（免费），代码和以后的部署都会更省心，而不是继续依赖"谁的电脑上有 Vercel CLI"这种方式。下面第 1 项会给两种做法。

---

## 1. 代码与运行环境

### 现状
代码只在你本地这个文件夹里，没有任何 Git 仓库。

### 交接做法（二选一）

**做法 A（推荐）：顺便建一个 GitHub 仓库**
1. 在 GitHub 新建一个私有仓库（比如 `dada-invoice-submission-tool`），把 Yijia 加为 Collaborator（需要她的 GitHub 用户名或邮箱）。
2. 把这个项目文件夹推送上去（`git init` → `git add .` → `git commit` → `git remote add origin ...` → `git push`）。
3. 之后可以在 Vercel 项目设置的 **Git** 里把这个仓库连接上，以后改代码 push 一下就自动部署，不用再手动跑 `vercel` 命令。
4. ⚠️ 连接 Git 后第一次务必验证一次：改一行无关紧要的内容 push 上去，确认 Vercel 自动触发了新部署。

**做法 B（最简单，但以后没有版本记录）**
直接把整个项目文件夹打包（zip），通过网盘或者 AirDrop 发给 Yijia，她本地留一份作为备份即可。仍然建议后续找机会补上做法 A。

---

## 2. 托管平台 — Vercel

### 现状（已核实）
- 项目部署在你的**个人 Vercel 账号**（"Gracie's projects"，**Hobby / 免费版**）。
- Hobby 版**不支持邀请团队成员**（Vercel 后台明确写着"This feature is available on the Pro plan"）。
- 项目设置里有 **Transfer** 功能，但实测这个入口的下拉框**只能选择你自己已经加入的 Vercel 团队**，选不到 Yijia 的账号（搜索会显示 "No results"）。查了 Vercel 官方文档确认：这个入口要求"转出方是原团队 owner，且已经是目标团队的成员"，不适用于两个完全独立的个人账号之间的转移。
- 环境变量（`LARK_APP_ID`、`LARK_APP_SECRET`、`LARK_BASE_APP_TOKEN`、`LARK_BASE_TABLE_ID`）都已存在 Vercel 项目设置里，跟着项目一起转移，**不需要手动重新填写**。
- 没有绑定自定义域名，只用默认的 `dada-invoice-submission-tool.vercel.app`。

### 交接做法：用 Claim Deployments（跨账号转移）流程
这是 Vercel 官方给"转给一个完全独立的新账号"设计的方式：

1. 让 Yijia 先注册一个自己的免费 Vercel 账号：https://vercel.com/signup
2. 你在自己电脑上生成一个 Vercel API Token（vercel.com → Settings → Tokens）。
3. 用这个 Token 调用 Vercel 的 "Create project transfer request" 接口（`POST /v1/projects/dada-invoice-submission-tool/transfer-request`），会返回一个 24 小时内有效的 `code`。
4. 把链接 `https://vercel.com/claim-deployment?code=你的code` 发给 Yijia。
5. Yijia 登录她自己的账号点开这个链接，选择接收项目的账号/团队，点击 **Transfer** 完成转移。
6. **验证**：转移完成后，Yijia 在自己的 Vercel 后台应该能看到 `dada-invoice-submission-tool` 项目，环境变量也应该都在；打开 `https://dada-invoice-submission-tool.vercel.app` 确认页面还能正常访问和提交。

如果这一步的 API 调用你不熟悉，可以让 Yijia 或者其他技术同事一起看着做一次；这一步只需要做一次，之后项目就完全在她账号下了。

---

## 3. 数据库/存储 — Lark Base

### 现状（已核实，好消息：这块基本不用你操心）
数据存在 Lark Base 文档《Client invoice tracker》里（Dada Consultants 组织下）：
- 这个文档的链接分享设置是 **"Dada Consultants 组织内的人拿到链接都可以编辑"**——只要 Yijia 还是这个 Lark 组织的成员，她已经能直接打开、编辑这个表格，**不需要额外加她做协作者**。
- 表格里还有一张《Admin for Invoice Submission》子表，专门存"谁能看到 app 里的管理员视图"，**Yijia 已经在这张表里了**（和 LiuChang、Gracie 一起）。

### 需要做的
基本不需要动。如果以后想让链接分享更严格（比如只让指定人editable），再手动去 Lark Base 的 Share 设置调整，但目前默认设置已经能覆盖 Yijia。

---

## 4. 第三方登录/OAuth — Lark Open Platform 自建应用

### 现状（已核实，好消息：她已经是 Administrator 了）
自建应用"Invoice Submission"（App ID: `cli_aab135eeaef99ed1`）在 Lark Open Platform 的 Collaborators 页面里：
- **Yijia 已经被加为 Collaborator，角色是 Administrator。**
- 你（Gracie）目前是 Owner。

Administrator 已经可以做几乎所有管理操作（改权限范围、改 Redirect URL、发布新版本等），唯一 Administrator 做不了的是"转移所有权"和"删除应用"这两个 Owner 专属操作。

### 需要做的（如果要彻底交接）
在 Collaborators 页面，你这一行（Gracie · Owner）右边有个 **"Transfer Ownership"** 链接，点击后应该可以选择把 Owner 转给已有的 Collaborator（也就是 Yijia）。
- **验证**：转移后确认 Yijia 那一行的角色变成了 Owner，且她自己登录 Lark Open Platform 能看到这个应用、能点开 Credentials & Basic Info 页面看到 App ID / App Secret。

App Secret **不需要重置**，转移 Owner 不影响已发布的 app 正常运行。

---

## 5. 域名与 DNS

不适用——项目只用 Vercel 分配的默认域名 `dada-invoice-submission-tool.vercel.app`，没有单独购买或绑定过自定义域名。

---

## 6. 定时任务/监控/保活服务

不适用——没有发现任何 cron-job.org / UptimeRobot 之类的保活或监控配置。Vercel Serverless 本身按请求触发，不存在"免费套餐会休眠"的问题（那是 Render / Railway 这类需要保活的平台才有的情况）。

---

## 7. 内部管理员/角色权限

见上面第 3 项——Yijia 已经在《Admin for Invoice Submission》表里，不需要额外操作。

---

## 8. 文档

项目文件夹里已经有：
- `SETUP GUIDE.md` — 从零搭建这个 app 的完整步骤（Lark 开发者后台配置、Vercel 部署、OAuth 回调地址等）
- `LARK_BASE_TIMESTAMP_GUIDE.md` — Lark Base API 里时间戳字段的坑，写代码时容易踩

这两份文档保持给 Yijia，作为她以后维护/二次开发时的参考。本文件可以作为第三份，专门记录这次交接的操作细节。

---

## 交接安全原则（提醒自己）

1. **只做新增，不做删除**：先让 Yijia 完成账号注册、加入相关平台，确认她能正常访问之后，再考虑收回自己的权限。
2. **不要在交接过程中重置任何密钥**（`LARK_APP_SECRET`、Vercel Token 等），除非确认已经泄露。
3. **每完成一项，让 Yijia 当场验证一次**，而不是全部做完再统一测试。
4. **每一步之后实际打开一次 app**（`https://dada-invoice-submission-tool.vercel.app`），走一遍提交流程，确认没有受影响。
5. **最后再撤销自己的权限**，且只在 Yijia 已经独立操作成功过一次之后再撤。

---

## 推荐执行顺序

1. Yijia 注册自己的 Vercel 账号。
2. 你生成 Vercel project transfer 的 claim 链接，发给她，她完成转移 → 打开线上网址验证。
3. （可选但推荐）建 GitHub 仓库、推送代码、连接到刚转移过去的 Vercel 项目 → push 一次验证自动部署。
4. 在 Lark Open Platform 的 Collaborators 页面把 Owner 转给 Yijia → 她登录验证能看到应用管理后台。
5. Lark Base 和内部管理员表不需要动（Yijia 已经都有权限），如果想更保险可以打开 Base 让她自己确认一下能编辑《Client invoice tracker》。
6. 全部验证完成后，你再考虑要不要从 Lark app 的 Collaborators 里移除自己、或把 Vercel 上自己这份项目删掉。
