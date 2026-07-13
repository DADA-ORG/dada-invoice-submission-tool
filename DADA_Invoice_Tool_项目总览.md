# DADA Invoice Submission Tool — 项目总览

生成时间：2026-07-13
写给：老板 & 同事，用于了解这个工具的整体情况，以后需要维护或优化时可以按这份文档快速定位。

---

## 一句话说明

这是一个嵌在 Lark（飞书海外版）Workplace 里的小工具，员工用它提交"候选人 TOB / 开票"申请（客户信息、候选人信息、薪资、费率、签约主体等），提交后数据直接写进 Lark Base 的《Client invoice tracker》多维表格，替代了原来手动填表登记的流程。候选人真正入职后，员工再回到工具里给同一条记录补传入职证明。

---

## 业务逻辑（端到端流程）

1. **登录**：员工在 Lark 里打开这个 gadget，页面自动跳转 Lark OAuth；因为已经登录 Lark，会瞬间跳回，不需要手动输入账号密码。后端用 OAuth code 换取员工身份（open_id、姓名），确认是本组织内部人员才放行。
2. **填表提交**：表单共 23 题（Q1–Q23），涵盖客户名称、候选人姓名/职位、薪资类型与金额、费率、签约主体（DADA SG / DDC MY / DDC US / Other）、付款条款、AM/顾问/寻访人归属等。
   - 客户名称、候选人职位有自动联想（分别从另外两张 Lark Base 参考表《Client UEN List》《SSOC reference》里模糊搜索匹配）。
   - 如果签约主体选的是 **DADA SG**，会多出几道新加坡本地合规相关的必填题（ID 类型/号码、SSOC 职业编码、UEN、GST 状态）。
   - 提交后数据写入《Client invoice tracker》主表，记录的"提交人"字段会尽量记成本人（用员工自己的 OAuth token 写入；如果失败则用系统身份写入并额外补一个"Respondent"字段兜底）。
3. **候选人入职后补证明**：员工可以在"候选人已入职？补交证明"入口里看到自己名下还没补齐证明的记录，点开后是**更新**同一条记录（不会新建一条），补上入职证据来源和证明文件（文件先传到 Lark Drive 拿到 file_token，再写入记录的附件字段）。
4. **管理员视图**：工具会先查《Admin for Invoice Submission》这张子表，判断当前登录的人是不是管理员。是的话，登录后直接看到一个仪表盘，列出过去 7 天内提交的所有记录（谁提交的、客户、候选人、签约主体、付款条款等），方便管理层快速扫一遍最新提交情况，而不用自己去 Lark Base 里翻。

---

## 技术架构

| 层 | 用的什么 | 说明 |
|---|---|---|
| 前端 | 单个 `index.html` 文件 | 纯 HTML/CSS/JS，没有用任何前端框架或构建工具，改动直接编辑这一个文件即可 |
| 后端 | Vercel Serverless Functions（`api/` 目录下 11 个 `.js` 文件） | 每个文件对应一个接口，见下方"功能速查表" |
| 数据存储 | Lark Base（多维表格） | 详见下方"数据存在哪" |
| 身份认证 | Lark Open Platform 自建应用「Invoice Submission」（App ID: `cli_aab135eeaef99ed1`） | 负责 OAuth 登录 + 生成访问 Lark Base 用的 token |

### 数据存在哪（Lark Base）

- **《Client invoice tracker》**（主表，`app_token: XpJKbk59AaKjQEswC1Gl8n7Rgsd`）
  - 主表本身：所有提交记录（`table_id: tblvgZhAwo0SBrKh`）
  - 子表《Admin for Invoice Submission》：管理员名单（`table_id: tblLDQH1SWfePmwB`），谁在这张表里，谁登录后就能看到管理员仪表盘
- **参考数据表**（另一个 Base，`app_token: Ag3Obd63CahRZgstJRZlRlLKgFd`，地址 `dadaconsultants.sg.larksuite.com`）
  - 《Client UEN List》：客户名称 + UEN 对照，供 Q1 自动联想
  - SSOC 职业编码参考表：职位名称 + SSOC 编码对照，供 Q3 自动联想

### 功能速查表（以后要改某个功能，先看这里）

| 文件 | 作用 |
|---|---|
| `api/auth-login.js` | Lark OAuth 登录，换取员工身份 |
| `api/config.js` | 把公开的 App ID 给前端（Secret 不会给前端） |
| `api/submit.js` | 提交新的一条 TOB/开票申请记录 |
| `api/check-admin.js` | 判断当前登录用户是否为管理员 |
| `api/recent-records.js` | 管理员仪表盘：拉取近 7 天提交记录 |
| `api/my-pending-records.js` | 我的待补证明列表 |
| `api/get-record.js` | 补证明前，先查一下这条记录的基本信息做确认 |
| `api/update-record.js` | 补交入职证明时，更新（而非新建）对应记录 |
| `api/upload-attachment.js` | 上传入职证明文件到 Lark Drive |
| `api/search-clients.js` | Q1 客户名称自动联想 |
| `api/search-positions.js` | Q3 职位自动联想 |
| `api/list-fields.js` | 诊断用：列出主表所有字段名和类型，排查字段名不匹配问题时用 |

---

## 源代码在哪里

⚠️ **目前没有 Git / GitHub 备份。** 代码只存在于两个地方：

1. Gracie 本人电脑上的这个项目文件夹（本文档所在位置）；
2. Vercel 上已经构建好、正在线上跑的那一份（但那是构建产物，不方便直接拿来改）。

也就是说，Gracie 离职后如果没人接手这个文件夹，团队将**没有可编辑的源代码**，只能看到线上运行效果，无法修改。

**建议**（离职前找时间做一次，很快）：把这个文件夹推到一个 GitHub 私有仓库，加相关同事为协作者。之后代码就有版本记录、有备份，任何人都能拉下来改。做法见文件夹里另一份《交接指南》第 1 项。

---

## 部署在哪里

- **平台**：Vercel（Hobby / 免费版），账号是 Gracie 的个人账号
- **项目名**：`dada-invoice-submission-tool`
- **线上地址**：`https://dada-invoice-submission-tool.vercel.app`
- **部署方式**：⚠️ 没有连接 Git 仓库自动部署，目前是 Gracie 在自己电脑终端里手动跑 `vercel` 命令部署（见 `SETUP GUIDE.md` 里的 "Option B"）。这意味着现在**只有 Gracie 的电脑能重新部署**，一旦她离职且电脑收回，改了代码也发布不出去，除非按上面"源代码"那一条先建好 GitHub 仓库并把 Vercel 连上 Git 自动部署。
- **环境变量**（存在 Vercel 项目设置里，跟着项目走，不需要重新填）：`LARK_APP_ID`、`LARK_APP_SECRET`、`LARK_BASE_APP_TOKEN`、`LARK_BASE_TABLE_ID`（`search-clients` / `search-positions` 用到的参考表 token 如未单独设置，代码里有默认值兜底）。

---

## 权限交接现状

- Lark 自建应用「Invoice Submission」：Yijia 已被加为 Collaborator（Administrator 角色），能做绝大部分管理操作；Gracie 目前仍是 Owner。
- Lark Base 数据：组织内成员默认可编辑《Client invoice tracker》，Yijia 已在《Admin for Invoice Submission》管理员名单里。
- Vercel 项目 + 源代码：**尚未交接**，是目前最大的缺口（见上面两节）。

详细的账号权限操作步骤见同文件夹下《DADA_Invoice_Tool_交接指南_Yijia.md》，此文档只做整体情况说明，不重复操作细节。

---

## 相关文档索引

- `SETUP GUIDE.md` — 从零搭建这个工具的完整步骤（Lark 后台配置、Vercel 部署、OAuth 回调地址等）
- `LARK_BASE_TIMESTAMP_GUIDE.md` — 对接 Lark Base API 时间戳字段的坑，改涉及日期的功能前建议先看
- `DADA_Invoice_Tool_交接指南_Yijia.md` — 给 Yijia 的账号权限交接操作指南
