# 更新日志

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 安全与发布准备

- 升级 Next.js / eslint-config-next 至 16.4.6、sharp 至 0.35.5、source-map-js 至 1.2.2；增加生产依赖审计、凭证扫描与 Dependabot 配置
- 忽略本地环境文件，导出自检覆盖点文件与未知扩展名，不回显敏感值；拒绝覆盖非空输出目录和符号链接导出输入
- 版本快照、索引和 diff 统一校验 ID 与路径边界，非法 ID/链接路径返回 400；恢复前先解析选中 JSON
- 默认 npm 服务命令和 Compose 宿主端口仅绑定回环；容器仅在空的默认数据卷初始化虚构示例，不覆盖已有内容
- 数据读取失败返回安全 503，健康检查验证实际 JSON 内容，容器冒烟覆盖损坏数据及重启不覆盖
- 演示站改为隔离白名单构建，支持 GitHub Pages 子路径并校验所有导出页面资源、导航、许可和源缓存保持不变
- 增加锁定生产依赖许可清单与分发声明包，发布文档明确版权授权、私密漏洞报告及真实部署验证仍需维护者确认

### 变更

- **README 重写**：按用途、启动、示例体验、自有数据与当前限制组织中英文首页；保留截图、贡献者与 Star 历史
- **文档事实修正**：移除未验证的 live 演示标记与维护者私有数据仓库依赖，明确证据校验、Git 审计、版本冲突检查及部署鉴权的条件
- **API 与限制参考**：新增 `docs/API.md`、`docs/LIMITATIONS.md`，记录接口协议和已核实的实现缺陷；本次仅修改文档，不包含计算或审计代码修复
- **产品定位表述统一**：README 与 `docs/ARCHITECTURE.md`、`docs/BACKSTAGE.md` 不再使用 `evidence-grade` 这类英文营销词
- **README 改为英文为主**（`README.md`），中文版移至 `README.zh-CN.md`，两份均带语言切换
- **社区文档英文化**：`CONTRIBUTING` / `SECURITY` / `CODE_OF_CONDUCT` 英文为主，
  保留 `*.zh-CN.md` 中文版（均带语言切换）；`docs/*` 每篇顶部加英文摘要

### 新增

- **非破坏式开源导出**：`export:oss` 使用 git archive 导出、排除内部资料并检查凭证与必需文件，可选生成干净历史（见 [docs/RELEASING.md](docs/RELEASING.md)）
- **CI 拆分**：`ci.yml`（校验/类型/Lint/测试 + 生产构建）、`docker.yml`（镜像构建与容器冒烟）、
  `linkcheck.yml`（lychee 外链巡检）、`release.yml`（tag → 校验 → GHCR 镜像 → GitHub Release）
- **配套私有元数据仓库 `toposky-data`**：真实 `topology.json` + 版本快照 + schema 副本 +
  `make validate/report/check-schema/status` + 独立 CI（checkout 代码仓后校验与 schema 漂移检查）
- README 首屏重构：徽章（CI/许可证/Node/PRs）、四张示例截图（总览/拓扑/影响分析/业务流程）、目录、贡献者与 Roadmap、Star 历史
- 容器部署：多阶段 `Dockerfile`（Next standalone + 健康检查 + `/data` 卷）、`docker-compose.yml`、`.dockerignore`
- `.gitattributes` 统一行尾与二进制策略（避免整文件 diff）

### 计划中

- 自动采集证据源接入示例（云资产 / K8s / 调用链）与「声明 vs 实测」差异报告
- 统一证据与影响可信度口径，补齐多路径、回滚和提交失败场景的验证
- 完整英文专题文档与公开演示部署验证

## [0.1.0] - 2026-10-22

首个可运行版本，定位为 **证据可追溯的系统依赖图谱与影响分析**。

### 新增

- 六个页面：总览驾驶舱、系统拓扑（六层泳道 + 业务流高亮 + 上下游聚焦）、业务流程目录、资产目录、影响分析、元数据治理
- 数据模型：节点/关系/系统/入口层/业务流/流程目录/词表，附 JSON Schema 与两个校验器
- 证据体系：`evidence.kind` + 可定位 `ref` + 四态 `verdict`，按 `high/medium/low/doubtful` 分层
- 影响分析：双向传播（1–3 层）、按路径最弱一环降级、受影响业务流/流程/仓库/负责人与导出
- 元数据治理：保存前校验、乐观锁、版本快照与回滚、保存即 git 提交（可降级）
- 数据与代码分离：实例数据目录可注入，仓库只带虚构示例；词表（业务域/业务线/流程引擎）由数据定义
- 工具链：数据校验、可信度报告、文档数字快照、Backstage 目录导入/导出、数据初始化与状态查询
- 测试：45 条回归用例（词表、证据口径、影响面、数据路径、校验器、Backstage 互通）

### 说明

- 仓库不包含任何真实组织数据；示例数据为虚构场景
- 许可证 Apache-2.0；第三方依赖许可见 [NOTICE](NOTICE)
