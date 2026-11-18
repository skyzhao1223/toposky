# 架构说明

> **English summary** — How the system is put together: a single JSON data layer, pure calculation
> modules shared by pages/API/scripts, a thin HTTP API, six pages, and a tooling layer for
> validation, reporting and Backstage interop. It also records the model's derived fields,
> four evidence states, path-confidence calculation and optional Git audit. Current behavior
> and unresolved correctness issues are documented in [LIMITATIONS.md](LIMITATIONS.md).

本文回答三个问题：**系统由哪些部分组成、数据怎么流动、为什么这样设计**。
数据字段级的说明见 [DATA-MODEL.md](DATA-MODEL.md)；治理口径见 [GOVERNANCE.md](GOVERNANCE.md)。

## 一、定位与边界

本项目是一个**证据可追溯的系统依赖图谱与影响分析**工具（system dependency graph with evidence and impact analysis）：

- **是**：一份由维护者录入或导入的系统/服务依赖模型，支持记录逐关系的证据来源和核实状态，按图中关系整理变更涉及的范围。
- **当前边界**：公开版本不提供自动代码核验；证据字段可以缺省。影响可信度、保存审计和回滚有[已知实现问题](LIMITATIONS.md)，不能将图中可达范围当作故障预测或发布安全保证。
- **不是**：运行时监控、服务网格控制面、CMDB 资产采集器、Backstage 的替代品。这些系统是它的**证据来源或被集成方**（见文末「扩展点」）。

## 二、总体结构

```
                        ┌──────────────────────────────────────────┐
                        │ 数据层（唯一事实源）                      │
                        │ data/topology.json  (+ versions/ 快照)   │
                        │ 读取路径：src/lib/dataPath.ts             │
                        └───────────────┬──────────────────────────┘
                                        │ fs
        ┌───────────────────────────────┼────────────────────────────────┐
        │                               │                                │
┌───────▼────────┐            ┌─────────▼──────────┐          ┌──────────▼─────────┐
│ 计算层（纯函数）│            │ 接口层（Next API） │          │ 工具层（Node 脚本）│
│ evidence.ts    │            │ GET/PUT /api/      │          │ validate-topology  │
│ impact.ts      │            │   topology         │          │ data-quality-report│
│ validateTopology│           │ /api/impact        │          │ docs-numbers       │
│ dataPath.ts    │            │ /api/versions[...] │          │ backstage（互通）  │
│ gitStore.ts    │            │ /api/history       │          │ data:init/status   │
└───────┬────────┘            └─────────┬──────────┘          └──────────┬─────────┘
        │                               │                                │
        └───────────────┬───────────────┴────────────────────────────────┘
                        │
              ┌─────────▼──────────┐
              │ 表现层（App Router）│
              │ 总览 / 系统拓扑 /   │
              │ 业务流程 / 资产目录 │
              │ 影响分析 / 元数据   │
              └────────────────────┘
```

### 1. 数据层

- **单一事实源**：`data/topology.json`（实例数据，默认不入库）。仓库只带虚构示例 `examples/demo/topology.json`。
- **位置解析**集中在 `src/lib/dataPath.ts`：显式路径存在时优先使用；没有显式配置时，依次查找 `./data`、旧布局 `src/data` 和示例。显式路径不存在时不回退示例；读取 API 对缺失、损坏或校验失败返回安全的 503，不再把读取失败伪装成 200 空图，详见 [API](API.md)。
- **版本快照**存放在实例目录的 `versions/`。通常只设置一个路径变量；同时设置文件与目录变量时，数据和快照可能分开。
- **独立私有数据仓库**：部署者可以自行创建，不依赖维护者的私有仓库。通过 `TOPOLOGY_DATA_DIR` 指向数据仓库，便于分别评审代码与元数据；公开仓库不会为新建数据仓库自动配置额外的 Make 目标或 CI。

### 2. 共享逻辑（页面 / API / 脚本复用）

| 模块 | 职责 | 约束 |
|---|---|---|
| `src/lib/evidence.ts` | 把一条关系的证据描述成一句话、给出 `committable` / `needsReview`、汇总覆盖率 | **口径唯一**：界面、API、报告都调这里，禁止各写一套 |
| `src/lib/impact.ts` | 影响面传播：上游 ∪ 下游 ∪ 自身，深度 1–3，按路径最弱一环降级 | 纯计算、零依赖，可被 Node 脚本直接 import |
| `src/lib/validateTopology.ts` | 保存前校验（引用完整性、枚举、词表、架构异味） | 与 `scripts/validate-topology.mjs` 同一口径；CI 以脚本为准 |
| `src/lib/dataPath.ts` | 数据位置解析、首次保存自动初始化 | 所有读取方唯一入口，禁止硬编码路径 |
| `src/lib/gitStore.ts` | 尝试 Git 提交、读取提交版本与审计历史 | 需要可用的 Git 和未被忽略的数据仓库；没有原子并发写入保护 |

### 3. 接口层

| 端点 | 语义 |
|---|---|
| `GET /api/topology` | 全量数据；`X-Topology-Version`（乐观锁）、`X-Topology-Source`（数据文件）、`X-Topology-Demo`（是否示例） |
| `PUT /api/topology` | 校验 → 有版本时检查冲突 → 落盘 → 尝试 Git 提交；成功保存不等于提交成功，详见 [API](API.md) |
| `GET /api/impact?id=&depth=` | 影响面 + 可信度分层 + 受影响业务流/流程/仓库/负责人 |
| `/api/versions`、`/api/versions/[id]`、`/restore`、`/diff` | 版本快照、回滚、差异 |
| `GET /api/history` | 数据文件的 git 审计历史 |

### 4. 表现层

六个页面：总览（`/`）、系统拓扑（`/topology`）、业务流程（`/processes`）、资产目录（`/assets`）、影响分析（`/impact`）、元数据（`/metadata`）。
图谱渲染用 React Flow，分层泳道与簇布局在 `src/components/layouts.ts`，ELK 布局在 `src/lib/elkLayout.ts`。

### 5. 工具层

CI 与日常维护脚本：元数据校验、数据可信度报告、文档数字快照、Backstage 互通、数据初始化/状态。与具体组织绑定的抓取/核验脚本单独存放，不随公开版本发布。

## 三、关键设计决策

| 决策 | 理由 |
|---|---|
| **单一事实源 + 派生不落盘** | 节点粒度、所属业务域、系统代表节点等实时推导，避免字段漂移与版本 diff 噪声 |
| **证据四态（supports/weak/absent/refutes）** | 「没搜到」和「找到反证」性质完全不同，混为一谈会产生错误结论 |
| **置信度分层 + 最弱一环** | 选定路径经过 `low` / `doubtful` 时只能作为排查线索；当前多路径和证据判定尚有实现缺陷 |
| **可选 Git 提交审计** | 数据落盘后尝试记录提交；默认被忽略的目录不产生审计提交，快照回滚目前也不走此路径 |
| **数据与代码分离** | 拓扑是内部资产，仓库只带示例；数据路径可注入（环境变量），部署时不改代码 |
| **词表属于数据** | 业务域/业务线/流程宿主引擎由数据定义，代码只留兜底；换组织不用改代码 |
| **脚本直接 import .ts** | Node ≥ 22.18 原生类型剥离，校验器/报告与运行时共用同一实现，避免口径漂移 |

## 四、一次保存的数据流

```
用户在页面编辑
  → PUT /api/topology（带 baseVersion）
  → validateTopology()：有 error 直接 422
  → 仅在 baseVersion 和当前 Git 版本都非空时比较：不一致 → 409
  → 写入实例数据文件（首次自动从示例初始化）
  → gitStore.commitData()：尝试 add + commit（被忽略或无仓库时跳过）
  → 返回 version / committed / warnings（success 不保证 committed）
```

这条路径没有包含读取、比较和写入的共享锁；恢复快照也不走它。提交失败的错误目前未完整传回页面，
不能凭旧版本号认定本次已提交。协议细节见 [HTTP API](API.md)，操作建议见[当前限制](LIMITATIONS.md)。

## 五、扩展点

| 想做什么 | 怎么接 |
|---|---|
| **接入 Backstage 目录** | `npm run backstage:import`（映射见 [BACKSTAGE.md](BACKSTAGE.md)） |
| **规划接入自动采集（云/K8s/APM）** | 公开版本尚无通用采集导入器。需要新增适配脚本；若扩展 `evidence.kind`，同时修改类型、Schema、校验器及展示。采集与人工图谱的差异先供评审，不自动把未观测到的关系视为反证 |
| **换一套业务域/业务线/流程引擎词表** | 改数据里的 `domains` / `businessLines` / `processHosts`，代码无需改动 |
| **自定义字段/校验规则** | 数据结构见 `topology.schema.json`；语义规则在 `scripts/validate-topology.mjs` 与 `src/lib/validateTopology.ts` |
| **换品牌/私有化** | 产品名与副标题集中在 `src/lib/branding.ts` |

## 六、部署形态

- 开发：`npm run dev`；生产：`npm run build && npx next start`（`output: standalone`）。
- 容器：仓库自带多阶段 `Dockerfile` 与 `docker-compose.yml`（standalone + 健康检查 + `/data` 卷）。
- 数据挂载：把实例数据目录挂进容器，用 `TOPOLOGY_DATA`（文件）或 `TOPOLOGY_DATA_DIR`（目录）指过去。
- 不需要数据库、消息队列或对象存储。Git 用于可选的提交审计与版本检查，缺失时不能假定具有同等审计或冲突保护；公网部署需外部鉴权，见[安全说明](../SECURITY.zh-CN.md)。
