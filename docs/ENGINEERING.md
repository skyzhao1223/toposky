# 工程约定

> **English summary** — Contributor conventions: Node version and commands, the hard rules that keep
> instance data out of the repository, code-structure rules (one implementation per calculation,
> vocabularies live in data), the change workflow with its required checks, and the contract for
> adding a new evidence source.

面向贡献者（含 AI 协作者）的开发约定。治理口径见 [GOVERNANCE.md](GOVERNANCE.md)，数据结构见 [DATA-MODEL.md](DATA-MODEL.md)。

## 一、环境

- **Node ≥ 22.18**（脚本直接 `import` `.ts`，依赖 Node 原生类型剥离；`package.json` 的 `engines` 已声明）。
- 安装依赖：`npm install`（CI 用 `npm ci`）。
- 不需要数据库、消息队列或对象存储；git 仅用于审计（可选）。

## 二、常用命令

```bash
npm run dev                            # 开发
npm run build && npm start            # 生产（prebuild 自动校验，默认回环监听）
npm run validate                       # 数据校验（CI 阻断点）
npm run tsc                            # 类型检查
npm run lint                           # ESLint
npm test                               # 单元/回归测试（node:test）
npm run data:status                    # 当前读的是哪份数据
npm run data:init                      # 用示例初始化实例数据目录
npm run report:quality                 # 数据可信度报告
npm run backstage:export / :import     # Backstage 互通
npm run data:init && docker compose up --build  # 默认 ./data 先初始化，再挂载容器
```

### 数据路径与部署注意事项

- 默认实例位于 `./data`，真实数据不得提交到代码仓库；路径变量见[环境变量示例](../.env.example)。
- Next 应用会加载 `.env`；使用 `--env-file-if-exists=.env` 的 npm 脚本也会加载它，但 `data:init` 不会。自定义路径初始化时，应在 shell 显式传入同一个变量：

  ```bash
  TOPOLOGY_DATA_DIR=../my-topology-data npm run data:init
  TOPOLOGY_DATA_DIR=../my-topology-data npm run validate
  TOPOLOGY_DATA_DIR=../my-topology-data npm run dev -- --hostname 127.0.0.1
  ```

- 初始化示例不会覆盖已有文件；替换为真实数据前先备份，新增字段和关系遵循[数据模型](DATA-MODEL.md)。关系的证据与可信度在元数据页目前只读，需要通过实例 JSON 或外部导入维护。
- 容器 entrypoint 仅在真正为空的默认 `/data` 卷初始化虚构示例，绝不覆盖已有内容；自定义显式路径缺失仍报错。Linux bind mount 需允许 UID 1001 写入，建议先初始化默认 `./data`。当前 runtime 镜像没有 Git，不能假定容器内有提交审计。
- 应用没有登录鉴权，默认 npm 服务命令及 Compose 宿主端口仅绑定回环地址；真实部署应限制网络访问、配置认证与 HTTPS，见[安全说明](../SECURITY.zh-CN.md#数据敏感性重要)。
- 影响统计、审计反馈和回滚仍有[已知实现问题](LIMITATIONS.md)，生产构建通过不代表这些边界已修复。

### 演示构建

```bash
npm run build:demo
npm run serve:demo
```

静态演示打包虚构数据，不提供 HTTP API，保存、快照与历史操作被禁用。预览地址以命令输出为准。

构建脚本在仓库外的临时目录中按公开白名单构建，不移动 API 源目录，也不删除开发缓存；构建环境不继承实例路径或凭证变量。只有已识别的演示产物目录才允许替换。
若构建期间源码或开发缓存变化，会拒绝发布产物。项目站使用 `NEXT_PUBLIC_BASE_PATH=/toposky npm run build:demo`，随后立即运行 `npm run check:demo -- --base-path /toposky` 检查所有页面资源、导航和源缓存指纹。实际托管站仍需上线后验证，不能把本地构建成功等同于上线。

## 三、数据与代码分离（硬规则）

1. **真实数据不入库**：实例数据放 `data/`（已 gitignore）或用 `TOPOLOGY_DATA` 指到仓库外；
2. **示例数据必须虚构**：`examples/demo/topology.json` 不得出现真实公司/域名/仓库/团队信息；
3. **内部资料单独存放**：与具体组织绑定的文档、抓取脚本、映射表不进入公开树；
4. **路径统一走 `src/lib/dataPath.ts`**：禁止硬编码 `src/data/topology.json`；
5. 提交前确认 `data/` 没有被 `git add -f` 带进来 —— 这是数据泄漏最常见的路径；
6. **真实数据可以维护在自己的私有 Git 仓库**（独立的 `data/` 或由 `TOPOLOGY_DATA_DIR` 指向），
   不依赖维护者的私有仓库；启用审计后，数据提交与代码提交分开管理。初始化步骤见[中文首页](../README.zh-CN.md#接入自己的数据)。

## 四、代码结构约定

| 约定 | 说明 |
|---|---|
| **口径唯一实现** | 证据口径只在 `src/lib/evidence.ts`，影响面只在 `src/lib/impact.ts`；页面/API/脚本都调这两个，禁止各写一套 |
| **派生不落盘** | 能算出来的字段（归属域、代表节点、粒度）实时推导，不写入数据文件 |
| **词表属于数据** | 业务域/业务线/流程引擎由数据定义，代码只留兜底默认值 |
| **脚本可 import .ts** | Node 原生类型剥离；脚本用 `pathToFileURL` 动态导入，保证与运行时同一实现 |
| **服务端才碰 fs** | `dataPath` / `gitStore` 只在 API 路由与脚本里使用，不得进入客户端组件 |
| **纯函数优先** | 计算逻辑（evidence/impact）保持零运行时依赖、type-only import，便于测试与被脚本复用 |

## 五、改动流程

1. `git status` 确认工作区（本项目历史上出现过并发写入）；
2. 小步改动，提交时用**显式路径**（`git add <file>`），不要 `git add -A`；
3. 提交前必跑：`npm run validate` + `npm run tsc` + `npm run lint` + `npm test`
   （改了数据再加 `npm run report:quality`；改了构建相关再 `npm run build`）；
4. 记下提交前 HEAD SHA，跑完再确认一次，避免「校验结论被并发写入作废」；
5. 提交信息用 `type(scope): 摘要`（`feat` / `fix` / `refactor` / `docs` / `test` / `chore`），正文写清动机与验证方式。

## 六、新增数据源（证据提供方）

自动采集/外部台账接入时，遵守同一套「断言 → 差异 → 人工确认」流程：

1. 输出中立格式的**边断言**：`{source, target, kind, ref, collectedAt}`；
2. 与现有图谱做 diff，映射到四态：

   | 情况 | 结论 |
   |---|---|
   | 图谱与采集一致 | `supports`（可升 confidence） |
   | 图谱有、采集没有 | `absent`（只标待查，**不删**） |
   | 图谱没有、采集有 | 漏边候选（人工确认后新增） |
   | 目标不一致 | `refutes`（降级 `doubtful`） |

3. **默认只出报告**，`--apply` 才写；写入前跑校验器；
4. 采集快照时间写入 `evidence.verifiedAt`，避免拿旧快照当实时；
5. 映射不上就进「未解析清单」，不猜。

## 七、安全与合规

- 不提交任何凭证、令牌、内网地址、真实域名/仓库/人名；
- 不在 issue/PR/截图中粘贴真实拓扑数据（用示例数据复现）；
- 依赖变更需同步更新 `NOTICE`（如新增非 MIT/Apache 许可证的依赖）；
- 发现安全问题请按 [SECURITY.md](../SECURITY.md) 私下报告，不要开公开 issue。

## 八、文档同步

结构或口径变更时，同步更新：

| 变了什么 | 要改哪里 |
|---|---|
| 数据字段/枚举 | `src/types/index.ts`、`topology.schema.json`、两个校验器、`docs/DATA-MODEL.md` |
| 证据/影响面口径 | `src/lib/evidence.ts` / `impact.ts`、`docs/GOVERNANCE.md`、相关测试 |
| 命令/脚本 | `package.json`、`README.md`、`docs/*.md` |
| 默认词表 | `src/types/index.ts`、`examples/demo/topology.json`、测试 |
