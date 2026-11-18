# 数据治理方法论

> **English summary** — The rules that make the data trustworthy: coverage assertions, judging by
> mechanism rather than keywords, and the distinction between "no evidence" (`absent`) and
> "contradicted" (`refutes`). It defines the confidence tiers and their allowed uses, the lifecycle
> of a dependency, the strength order of verifiers, and a review checklist for data changes.

这份文档规定维护者如何收集、核实和评审依赖关系。它描述的是维护规范，不代表软件会自动完成核验，
也不保证所有录入数据都满足这些规则。当前校验与影响统计的实现边界见[当前限制](LIMITATIONS.md)。

## 一、四项维护规则

### 1. 工具必须有覆盖率断言

工具不能只报「没找到」，还要报「我扫了什么、扫了多少、覆盖够不够」。

> 反例：扫描器设置了文件数上限，却没有报告实际覆盖范围，随后把「没搜到依赖」当成「没有依赖」。
> 处理方式：输出已扫描文件数和预期范围；覆盖不足时只能标记待查。

公开版本的 `npm run validate` 打印数据源与规模，`npm run report:quality` 汇总已填写的证据字段；
这两条命令不扫描应用源码。自行接入代码扫描器时，还需记录实际扫描范围。

### 2. 判定指标必须来自「机制」，不能来自「关键词」

> 反例：用「代码里搜不到某服务名」判定依赖不成立 —— 判早了。
> 消费方代码里只有 SDK 接口名，永远不会出现服务名。
> 正确指标是「是否依赖该 SDK + 是否依赖对应 RPC 框架」。

**接入建议**：代码核验可按 Maven 坐标、`go.mod` require、`@KafkaListener`、`FeignClient` 和网关转发规则等机制判定。
这些是设计外部验证器时的依据，不是公开版本自带的扫描能力。文本检索只用于发现线索，不能单凭关键词缺失否定依赖。

### 3. 区分「无证据」与「有反证」，并处理否定语义

- `absent`：用这个方法没找到 —— **可能是方法不对**，只能标「待查」；
- `refutes`：找到了相反证据 —— **才是结论**，应删除或降级 `doubtful`。

否定词必须显式处理：`未接入` / `无证据` / `已删除` / `不成立` 不能按「文本命中」判成支持。
反证只能来自人工标注或 `contract.note`，**绝不从 `evidence.note` 里自动推断**（否则会把上一轮自己写的「未找到证据」读成反证）。

### 4. 不猜

映射不上就不映射，留空并记录原因；宁可标「未解析」，也不写一个看起来合理的错值。
同名不同物要分清；共享模块不归属任何系统；模糊匹配前先过滤空键与过短键。

## 二、证据分级与用途

| confidence | 含义 | 能用来做什么 |
|---|---|---|
| `high` | 维护规范要求有代码/配置/网关的直接依据 | 配合 `supports`、证据复核、变更 diff 与测试参与评审，不单独作为发布保证 |
| `medium` | 台账、网关、Nacos 等实证 | 圈定范围、通知团队 |
| `low` | 推断或间接依据 | 只作线索，**不用来决定「会不会出事」** |
| `doubtful` | 来源自注存疑或自相矛盾 | **不可对外承诺**，必须复核 |

`evidence.verdict` 决定「核实到了什么程度」：`supports` 有依据 / `weak` 弱依据 / `absent` 待查 / `refutes` 有反证。
**「填了 evidence 字段」≠「核实过」**——后者必须有 `verdict`。

## 三、一条关系的一生

```
候选（代码检索/采集/人工提出）
  → 核验：找到机制级证据
      ├─ 有直接依据 → evidence{kind, ref} + verdict=supports → 根据证据质量评估 confidence
      ├─ 只有弱依据 → verdict=weak → 仅作线索，继续复核
      ├─ 没搜到 → verdict=absent + pendingData（缺哪类外部数据）→ 保持 low
      └─ 找到反证 → verdict=refutes → 删除或降级 doubtful
  → 落库：contract 尽量定位到接口/topic/表（target）
  → 复核：doubtful/absent 进入「待复核」清单，按 pendingData 分类去要数据
  → 评审：复核证据和当前影响算法的限制，结合具体变更与测试确定通知和回归范围
```

## 四、验证器的强度阶梯

以下是设计外部核验流程时的参考，不是公开版本提供的验证器清单。不同来源应按覆盖范围、时效和依赖机制评估，不能只凭来源名称判定为真：

1. **编译产物**（`mvn dependency:tree`、`go.mod`）——机器算出来的事实，能证实也能证伪，还能发现图谱漏掉的边；
2. **平台真实配置**（网关转发规则、Nacos 注册列表）——真实生效的配置；
3. **代码级检索**——有假阴性也有假阳性，只能当线索；
4. **文档/台账**——只能当线索，必须标注出处。

新增验证器时，先问自己：**我判定的依据是机制还是关键词？我的覆盖范围说清楚了吗？**

## 五、影响分析的置信度口径

- 当前受影响集合 = 上游 ∪ 下游 ∪ 自身，深度 1–3；它是图中可达的范围，不是必然发生故障的范围。
- 一条选定传播路径的 `confidence` 取沿途最弱边；经过 `low` 或 `doubtful` 的结果仅供排查，不表示已经证实依赖不存在。
- 维护规范要求可靠结论同时具备支持证据。证据报告中的 `committable` 要求 `high + supports`；当前影响分析只计算路径 `confidence`，未统一使用 `verdict`，不能把 `trustCommittable` 用作变更审批门槛。
- 当前多路径采用 BFS 首次命中，可能受关系排列顺序影响；环上的节点可能分别计入上下游可信度。输出应区分去重后的节点与方向性条目，具体行为见[当前限制](LIMITATIONS.md#impact-is-a-scoping-aid-not-a-reliability-guarantee)。

## 六、汇报与评审

### 汇报前自查

- 这个「完成」有界面/接口能验证吗？（**数据写进文件 ≠ 功能可用**）
- 这个「覆盖 N/M」是填了字段，还是核实过？
- 这个数字是刚算的，还是记忆里的？（引用数字前先跑命令）
- 这个「拿不到」是本机真的没有，还是没找？

### 数据类 PR 的评审清单

- [ ] 新增关系是否带 `evidence.kind` + 可定位 `ref`？
- [ ] 核实结论（`verdict`）与 `confidence` 一致吗？（`refutes` 必须 `doubtful`；`absent` 不能是 `high`）
- [ ] 映射是否可验证（数据源/规则/覆盖范围写清）？
- [ ] 有没有把「没搜到」写成「不存在」？
- [ ] `contract.target` 是否尽量定位到具体落点？
- [ ] 是否包含任何真实组织内部信息（域名/仓库/团队）？——**公开仓库一律不允许**

## 七、可观测指标（建议持续跟踪）

| 指标 | 口径 |
|---|---|
| 证据覆盖率 | 有 `evidence.kind` 的关系数 / 总关系数 |
| 核实率 | 有 `verdict` 的关系数 / 总数（**这才是真核实过**） |
| 可承诺比例 | `high` + `supports` / 总数 |
| 待复核存量 | `doubtful` + `absent` + `refutes` 的条数，按 `pendingData` 分类 |
| 契约定位率 | 有 `contract.target` 的关系数 / 总数 |
| 口径冲突 | `supports` 但 `doubtful`、`refutes` 但高置信 等矛盾数（应为 0） |

这些指标由 `npm run report:quality` 与 `npm run validate` 输出，避免手抄导致口径漂移。
