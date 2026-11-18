<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# 工程约定（人工维护，请勿删除）

> 给 AI 协作者与人类贡献者的硬规则。展开说明见 [docs/ENGINEERING.md](docs/ENGINEERING.md)（工程）与
> [docs/GOVERNANCE.md](docs/GOVERNANCE.md)（数据治理），数据字段见 [docs/DATA-MODEL.md](docs/DATA-MODEL.md)。

## 一、数据与代码分离（不可违背）

1. 真实拓扑数据放 `data/`（已 gitignore）或用 `TOPOLOGY_DATA` 指向仓库外，**绝不入库**；
2. `examples/demo/` 必须虚构，不得出现真实公司/域名/仓库/团队/人名；
3. 与具体组织绑定的资料与脚本单独存放，**不随公开版本发布**；
4. 数据路径统一走 `src/lib/dataPath.ts`，禁止硬编码 `src/data/topology.json`；
5. 提交前确认 `data/` 没被 `git add -f` 带进来——这是本仓库数据泄漏最常见的路径。

## 二、口径唯一

- 证据口径只在 `src/lib/evidence.ts`；影响面只在 `src/lib/impact.ts`；
  页面、API、脚本、报告都调这两处，**禁止各写一套**（否则统计数字必然漂移）。
- 词表（业务域/业务线/流程宿主引擎）以数据为准，代码只留兜底默认值。

## 三、校验器/验证器三原则

1. **覆盖率断言**：不能只报「没找到」，要报「扫了什么、扫了多少」；低于阈值的结论不可信。
2. **机制判定**：按依赖机制（坐标、SDK、配置键、网关规则）判，不做全仓关键词搜索。
3. **无证据 ≠ 有反证**：`absent` 待查、`refutes` 才是结论；否定语义（未接入/已删除/不成立）必须显式处理。

## 四、改动流程

1. 先 `git status`（本项目出现过并发写入）；提交用**显式路径**，不要 `git add -A`；
2. 改动后必跑：`npm run validate` + `npm run tsc` + `npm run lint` + `npm test`
   （构建相关再加 `npm run build`；改了数据再加 `npm run report:quality`）；
3. 提交前记下 HEAD SHA，跑完再对一次，确认校验结论没被并发写入作废；
4. 提交信息用 `type(scope): 摘要`，正文写动机与验证方式。

## 五、汇报要有覆盖率断言

- **数据写进文件 ≠ 功能可用**：说「完成」前先问「在哪可见、谁消费」；
- **「覆盖 N/M」要说清是哪种覆盖**：填了字段 / 验证过 / 证据够强是三件事；
- **引用任何数字前先跑命令算出来**，不要凭记忆复述。

## 六、安全

不提交凭证、内网地址、真实数据；issue/PR/截图里也不许出现真实拓扑信息（用示例数据复现）。
安全问题按 [SECURITY.md](SECURITY.md) 私下报告。
