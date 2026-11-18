# 与 Backstage 互通（catalog-info.yaml ↔ topology.json）

> **English summary** — How to exchange catalogs with Backstage: the bidirectional mapping for
> System, Component, Resource, API and Group entities, the `dependsOn` / `providesApis` /
> `consumesApis` relations, the commands for export and import, the write discipline (dry-run by
> default, validation before writing), and what is intentionally lost in translation.

TopoSky 可以把 Backstage 的目录实体映射为节点、业务系统和依赖关系，也可以导出目录 YAML。
已有目录的团队可以用导入结果作为维护起点，不必手工重录所有实体。

导入目录不等于核实依赖。目录中的声明会保留来源标注，但不会自动产生核实结论；
TopoSky 的证据状态、业务流程等信息也不能通过这套映射完整往返。具体映射与信息损失见下文。

## 一、命令

```bash
# 导出为 Backstage 目录（一个多文档 YAML）
npm run backstage:export -- --out ./out/backstage

# 从 Backstage 导入（默认 dry-run，只打印将新增/未解析的内容）
npm run backstage:import -- --file ./out/backstage/catalog-info.yaml
npm run backstage:import -- --file ./catalog/ --apply     # 加 --apply 才落盘
```

- 导入前会先写临时文件跑一遍 `scripts/validate-topology.mjs`，**有 error 直接中止**；
- 当前读的是仓库自带示例数据时，`--apply` 会被拒绝（避免把演示数据当实例数据改）；
- 导入是**幂等**的：只追加不存在的实体、只补空字段，**绝不覆盖人工维护的值**；
- 同一 `(source, target, relationType)` 的边不会重复添加。

## 二、正向映射（本项目 → Backstage）

| 本项目 | Backstage 实体 | 说明 |
|---|---|---|
| `systems[]` | `kind: System` | `metadata.name` = 系统 id；`spec.owner` = 团队实体名 |
| `nodes[]`（`layer` 为 `access` / `application`） | `kind: Component` | `website` / `service`；`spec.system` 指向 System |
| `nodes[]`（`middleware` / `infrastructure` / `external`） | `kind: Resource` | `database` / `cache` / `message-queue` / `configuration` / `cluster` / `external` |
| `nodes[].owner` | `kind: Group` | 原团队名放 `metadata.title` 与 `spec.profile.displayName`，实体名用稳定的 `team-N` |
| `relations[].contract.kind` 为 `http` / `rpc`，且**目标是应用节点** | `kind: API` | `providesApis`（提供方）/ `consumesApis`（消费方）；`spec.type: other`，`definition` 只列契约落点（不假装是完整 OpenAPI） |
| 其余关系 | `spec.dependsOn` | 值为 `component:<name>` / `resource:<name>` |
| `nodes[].links.repo` / `links.wiki` | `metadata.links` | 标题分别为「仓库」/「文档」 |

每个实体都带 `toposky/*` 注解（原 id、原名、layer、业务线、owner），导入时据此**无损还原 id 与中文名**。

## 三、反向映射（Backstage → 本项目）

| Backstage | 本项目 | 说明 |
|---|---|---|
| `System` | `systems[]` | id 取注解或 `metadata.name`；owner 从 Group 还原为中文团队名 |
| `Component` | `nodes[]` | `type: website` → `layer=access` + `appType=frontend`；其余 → `application` + `backend` |
| `Resource` | `nodes[]` | `database/cache/message-queue` → `middleware`；`cluster` → `infrastructure`；`external` → `external` |
| `spec.dependsOn` | `relations[]`（`depends_on`） | 证据标为 `kind: doc` + `ref: <文件>#Component:<name>`，**不写 verdict**（没核实过就不能假装核实过） |
| `providesApis` / `consumesApis` | `relations[]`（`calls` + `contract.kind`） | `api.spec.type` 含 `grpc` → `rpc`，其余 → `http` |

## 四、会丢失的信息（已知限制）

| 信息 | 导出后 | 说明 |
|---|---|---|
| `relationType` 的细分（`publishes_to` / `subscribes_from` / `syncs_with` / `deploys_to`） | 退化为 `depends_on` | Backstage 的目录关系只有「依赖」语义，没有消息方向/部署语义 |
| `contract.target`（接口/topic/表） | 只有 http/rpc 的落点进 API `definition` 注释 | 其余契约类型不导出 |
| `confidence` / `evidence` / `verdict` | 不导出 | 当前导出器不映射这些逐关系字段；完整数据保留在 `topology.json` 中 |
| `businessFlows` / `processCatalog` / `entryRoutes` | 不导出 | 当前导入导出器没有为这些字段定义映射 |

导出的目录不是完整备份。不要用目录 round-trip 代替原始 JSON 备份，也不要把导入后生成的来源标注当作核验结果。

## 五、实体名规则

Backstage 要求实体名满足 `^[a-zA-Z0-9]([-a-zA-Z0-9_.]*[a-zA-Z0-9])?$` 且 ≤ 63 字符。
导出时会做安全转换（非法字符 → `-`），转换过的 id 仍可从 `toposky/id` 注解还原；
若你的节点 id 是纯中文，导入时以注解为准，不会丢原 id。
