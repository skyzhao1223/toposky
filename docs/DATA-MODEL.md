# 数据模型

> **English summary** — Field-by-field reference for `topology.json`: nodes, relations, systems,
> entry routes, business flows, the process catalog and the three data-defined vocabularies
> (domains, business lines, process hosts). It explains the four-state `verdict`, the confidence
> tiers, which fields are derived instead of stored, and what the validator treats as an error
> versus a warning. The formal structure is in `topology.schema.json`.

`topology.json` 是唯一事实源。结构定义见仓库根目录的 [topology.schema.json](../topology.schema.json)（JSON Schema draft-07，编辑器可补全），
语义规则以 `npm run validate` 为准；示例见 [examples/demo/topology.json](../examples/demo/topology.json)。

## 一、顶层结构

| 字段 | 必填 | 说明 |
|---|---|---|
| `nodes[]` | ✅ | **节点**：拓扑中的应用、中间件、基础设施或外部服务，可作为变更与分析的对象 |
| `relations[]` | ✅ | **依赖关系**：调用/依赖/消息/同步/部署 |
| `systems[]` | — | **业务系统注册表**：业务台账中的登记单元，用 `systemId` 关联其所属节点 |
| `entryRoutes[]` | — | **入口层**：域名 → 路径 → 后端应用（可由网关转发规则整理） |
| `businessFlows[]` | — | 端到端业务流（有序步骤，供展示与关联分析，不执行工作流） |
| `processCatalog` | — | 业务流程目录：业务域 → 流程组 → 流程，含流程间依赖；流程的 `systems[]` 当前引用节点 ID，不是业务系统注册表 ID |
| `businessLines[]` / `businessLineGroups[]` | — | 业务线词表与分组 |
| `domains[]` | — | 业务域词表 |
| `processHosts[]` | — | 流程宿主引擎词表 |
| `layers[]` | — | 分层展示配置（可选，缺省用代码内置六层） |
| `$schema` / `_comment` | — | 编辑器提示用，参与校验时忽略 |

> 词表字段（`domains` / `businessLines` / `processHosts`）**声明即权威**：声明后就以数据为准，代码里的内置值只作兜底。
> 详见下文「四、词表机制」。

## 二、节点 `nodes[]`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 稳定标识（建议英文 kebab-case） |
| `name` / `description` | string | 展示名 / 一句话职责 |
| `layer` | enum | `access` 接入 · `application` 应用 · `platform` 平台 · `middleware` 中间件 · `infrastructure` 基础设施 · `external` 外部 |
| `category` | enum | **兼容字段**（旧数据），新数据请用 `layer`；两者并存时以 `layer` 为准 |
| `appType` | enum | `frontend` / `backend` / `bff` / `fullstack` |
| `businessLine` | string | 主责业务线 id（须在业务线词表内） |
| `owner` | string | 内部团队/负责人（外部系统请改用 `vendor` + `contacts`） |
| `vendor` / `contacts[]` | string / array | 外部系统的供应商与对接人（`contacts[].name` 必填） |
| `links` | object | `repo` / `wiki` / `ci` / `monitoring` / `ones`（仓库须为 http(s) URL） |
| `environments` | object | `dev` / `test` / `staging` / `production`，每项含 `status`（必填）、`url`、`version`、`replicas`、`notes` 等 |
| `systemId` | string | 归属系统 id（指向 `systems[]`） |
| `systemPrimary` | boolean | 该系统在节点层的代表节点（每个系统至多一个） |
| `repoPath` | string | 仓库内模块路径（一个仓库装多个系统时定位用） |

## 三、关系 `relations[]`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 唯一 id |
| `source` / `target` | string | 节点 id（不得悬空、不得自环） |
| `relationType` | enum | `calls` 调用 · `depends_on` 依赖 · `publishes_to` 发布消息 · `subscribes_from` 订阅消息 · `syncs_with` 数据同步 · `deploys_to` 部署到 |
| `label` / `description` | string | 简短说明 / 详细说明 |
| `contract` | object | `kind`（`http`/`rpc`/`mq`/`db`/`file`/`other`）、`target`（接口路径/方法/topic/表名）、`note` |
| `scope` | enum | `node`（默认）或 `system`（系统级事实，挂代表节点，视图按 `systemId` 上提） |
| `confidence` | enum | `high` / `medium` / `low` / `doubtful`，**缺省视为未评估、按最保守口径呈现** |
| `evidence` | object | 见下 |

### 关系方向与最小示例

`source` 和 `target` 引用节点 ID，不是业务系统注册表 ID。`calls` / `depends_on` 通常从调用方或依赖方指向提供方；
`publishes_to` 从发布者指向消息设施，`subscribes_from` 从订阅者指向消息设施，`deploys_to` 从工作负载指向承载设施。
影响分析沿已保存的端点方向分别查找上游和下游，不推断某种关系在运行时必然造成故障。

下面是一条未核实关系的格式示例，可使用随仓库示例中已有的节点 ID。它不替代真实证据，也不能单独作为整个数据文件：

```json
{
  "id": "example-dependency",
  "source": "approval-api",
  "target": "mysql",
  "relationType": "depends_on",
  "confidence": "low",
  "evidence": {
    "kind": "doc",
    "ref": "example-dependency-note"
  }
}
```

新增时保证关系 ID 唯一、端点已经存在；根据可定位的来源填写 `ref`，核实后再记录 `verdict`，不要仅为填满字段写成 `supports`。

### `evidence`：回答「这条边凭什么成立」

| 字段 | 说明 |
|---|---|
| `kind` | 证据来源：`code` 代码 · `config` 配置 · `gateway` 网关路由 · `nacos` 注册中心 · `ledger` 台账 · `doc` 文档 · `inference` 推断 |
| `ref` | 可定位出处：`pom.xml:61`、`application-prod.yaml:24`、`gateway-routes.csv:189` 等 |
| `verdict` | 核实结论：`supports` 有依据 · `weak` 弱依据 · `absent` **按该来源没搜到（待查，不等于不存在）** · `refutes` **有反证（应删/降级）** |
| `verifiedAt` | 最近核实时间（ISO） |
| `pendingData` | 本机核实不了时缺什么：`P0-gateway` / `external-config` / `manual` |

`evidence`、`ref` 和 `verdict` 都不是每条关系的必填字段。填写来源不表示核验通过；
`verdict` 记录的是维护者或外部工具填写的结果，公开版本不会自动检查所引用的代码或配置。

`absent` 表示按该方法没找到，`refutes` 表示有反证，二者不能混用。维护规范要求有反证的关系删除或降为 `doubtful`，
但当前校验器仅告警，不阻断保存。证据报告中的 `committable` 要求 `high + supports`；
影响分析的同名用途统计目前只看传播路径的 `confidence`，尚未统一这一判定，不能视为发布安全保证。详见[当前限制](LIMITATIONS.md)。

## 四、词表机制

| 词表 | 数据字段 | 缺省兜底 | 影响 |
|---|---|---|---|
| 业务域 | `domains[]`（`id`/`name`/`color`/`icon`/`description`） | 内置 8 个通用域 | 业务流 `domain`、流程板块 `id` 必须命中；用于泳道/分组/配色 |
| 业务线 | `businessLines[]` + `businessLineGroups[]` | 内置 10 条 | 节点 `businessLine` 必须命中；`businessLines[].domain` 声明主责域 |
| 流程宿主引擎 | `processHosts[]` | 内置 3 个示例 | 流程 `host` 必须命中；用于筛选与标记 |

数据未声明时用内置默认；**一旦声明就以数据为准**（不再与默认混合），避免出现「数据里没有的域/引擎」。
校验器会检查声明项自身（缺 `id`/`name`/`color`、id 重复）以及引用是否命中。

## 五、派生规则（不落盘）

| 派生 | 规则 | 位置 |
|---|---|---|
| 节点分层 | `layer` 优先，缺失时回落 `category` | `nodeLayer()` |
| 节点粒度 | 由所属系统内节点数与 `systemPrimary` 推导 | `deriveScope()` |
| 节点所属业务域 | 由参与的业务流/流程反推；业务线可用 `businessLines[].domain` 声明主责域 | `nodeDomains()` / `nodePrimaryDomain()` |
| 系统代表节点 | 显式 `systemPrimary`，否则按约定派生 | `primaryNodeOfSystem()` |
| 词表标签/颜色 | 数据优先、内置兜底 | `buildDomainMaps()` / `buildBusinessLineMaps()` / `buildProcessHostMaps()` |

**原则**：能派生的一律不写入文件，避免字段漂移和版本 diff 噪声。

## 六、校验规则

`npm run validate` 有 error 时退出码 1（可接 CI），warning 仅提示：

- **error**：缺 id、id 重复、枚举非法、悬空引用（关系端点/流程系统/业务流步骤/流程依赖）、词表外取值、自环、`systemPrimary` 与 `systemId` 矛盾；
- **warning**：缺 `layer`、外部系统缺 vendor/contacts、关系缺 `contract`/`evidence`、`refutes` 但 confidence 未降级、`doubtful` 未标 verdict、重复三元组关系、入口层统计、流程目录与业务流桥接不完整等。

`npm run report:quality` 输出按系统汇总的可信度分层；`npm run docs:numbers` 输出唯一口径的规模数字。

## 七、版本与迁移

- 历史布局 `src/data/topology.json` 仍可只读兼容，但新版本写入统一落到实例路径（`TOPOLOGY_DATA` / `TOPOLOGY_DATA_DIR` / `./data`）；
- 保存先落盘，再尝试 Git 提交；默认被 ignore 的目录不产生提交。需要审计时，使用独立数据仓库并核对实际历史，当前提交失败反馈有[已知问题](LIMITATIONS.md#saving-git-audit-and-concurrent-edits)；
- 版本快照在实例目录的 `versions/`，页面可回滚与对比。当前恢复接口不走保存接口的校验、版本冲突检查和 Git 提交路径；
- 结构变更（新增字段）应同步：`src/types/index.ts`、`topology.schema.json`、两个校验器、`docs/DATA-MODEL.md`。
