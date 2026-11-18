# 发布流程（内部仓库 → 开源仓库）

> **English summary** — How a release is cut: CI workflows and their triggers, the non-destructive
> export that produces a clean public tree, placeholder replacement, a "stranger" verification in
> the exported directory, generating a history-free repository, tagging, and the post-release
> checklist. The internal repository keeps its own history and internal material.

发布采用**非破坏式导出**：内部仓库保留全部历史与内部资料，公开仓库是「当前提交的精简副本」。
公开仓库只接受通过导出产生的提交，**不要在两处手工双写**（否则必然漂移）。

## 前置条件

- [ ] 内部仓库 `git status` 干净，`npm run validate && npm run tsc && npm run lint && npm test && npm run build` 全绿；
- [ ] 开源审批 / 法务确认已完成（许可证署名、版权归属、商标使用）；
- [ ] 确认当前实例数据不在仓库内（`git ls-files data/ src/data/` 为空）；不能直接把带内部历史的源仓库转公开。
- [ ] `npm run audit:prod` 没有 High/Critical 告警，`npm run notices:check` 通过；核对具体分发平台的第三方许可和源代码交付义务。
- [ ] 专业凭证扫描通过；导出自检只是一组规则，不等同于全面安全审计。
- [ ] 只从干净导出/CI 构建发布包，禁止分发本机现有 standalone 副本（它可能追踪了实例数据、环境文件或内部资料）。

## 零、CI 流水线（转公开后自动生效）

| Workflow | 触发 | 做什么 |
|---|---|---|
| `ci.yml` | push main / PR | 凭证扫描、生产依赖审计、许可清单校验、元数据校验 → 类型 → Lint → 回归测试；独立 job 跑生产构建 |
| `docker.yml` | push main / PR | 构建镜像，验证默认空卷初始化、完整示例 JSON、损坏数据 503、健康检查失败与重启不覆盖 |
| `linkcheck.yml` | 每周一 / PR 改 md | 用 lychee 巡检文档外链（仓库公开前排除自身链接） |
| `release.yml` | 打 `v*` tag | 全套校验 → 推送 GHCR 镜像 → 创建 GitHub Release |
| `pages.yml` | push main / 手动触发 | push 只隔离构建与校验；明确授权后手动触发并勾选 deploy，才部署到 GitHub Pages |

> 转公开不等于工作流已成功运行，也不会自动产生一次 push。仍需检查 Actions 开关、权限、Pages 来源和环境审批；必要时手动触发工作流，不能只凭可见性变化宣称 CI 或演示已恢复。

## 一、导出

```bash
# 在内部仓库根目录执行
npm run export:oss -- --out ../toposky-oss
```

脚本会：

1. `git archive HEAD` 导出**已提交**的文件（未提交改动不会进导出物）；
2. 删除内部资料目录与构建残留；
3. 从 `package.json` 剥离指向内部脚本的 npm 命令；
4. 对全部公开文件（含点文件、未知扩展名）执行通用安全检查：内部路径依赖、凭证特征、敏感环境文件名、必需文件、禁用目录，扫描排除 0 文件；
5. 组织特定匹配规则只从源仓的可选私有 JSON 策略读取，不内嵌在公开工具中，也不随导出发布；有策略时全量应用，缺失时明确报告「未审计组织特定标识」，不宣称组织审计通过；
6. 任一问题 → 退出码 1，导出物不可发布；输出目录必须是新的或空目录，不删除已有非空输出。

> 自检是**硬门槛**。如果它报错，先修内部仓库再重新导出，不要在导出目录里手改后继续——否则下次导出又会带回来。

## 二、确认发布渠道与授权

这些项目必须人工确认，脚本和构建成功不能代替授权：

- [ ] 确认版权归属、开源审批与 [NOTICE](../NOTICE) 署名；工作相关代码不能仅凭个人署名认定获得授权。
- [ ] 确认公开远端确实是干净发布树，检查全部分支与标签，不能混入内部历史；已经有干净公开仓历史时，用新提交/PR 更新，不要强推重建历史。
- [ ] 公开后立即启用 GitHub Private vulnerability reporting，并验证 [SECURITY](../SECURITY.md) 的报告按钮可用；若无法启用，先提供有人接收的替代私密渠道。GitHub noreply 地址不是收件箱。
- [ ] 核对首页、模板、演示与发布工作流里的目标仓库地址；配置 Pages 来源为 GitHub Actions。
- [ ] 依据 [第三方许可清单](../THIRD_PARTY_NOTICES.md) 核对 exact 平台的许可证、版权声明、对应源代码和替换/重链接义务；npm 清单不覆盖基础镜像的系统包。

## 三、在导出目录做一次「陌生人」验证

```bash
cd ../toposky-oss
npm ci
npm run audit:prod
npm run notices:check
npm run validate      # 无 data/ 时自动读示例数据
npm run tsc
npm run lint
npm test
npm run build
npm start -- --port 3400   # 默认仅本机；打开 /、/topology、/impact 抽查
```

记录实际输出（节点/关系数、测试通过数），发布说明里引用这些数字。

还需验证两种发布产物：

```bash
npm run build:demo
# GitHub 项目站等价构建：
NEXT_PUBLIC_BASE_PATH=/toposky npm run build:demo
# 检查产物路径与页面资源；不能只看构建退出码。
# Docker 空卷/已有实例数据两种场景均应验证，健康检查必须检查 JSON 内容。
docker compose up --build
```

静态演示构建使用隔离临时源，不移动 API 源目录或删除开发缓存；只带公开白名单和虚构数据。
本地服务没有登录鉴权，默认回环监听不代替远程部署的认证与 HTTPS。

## 四、生成干净历史

```bash
# 方式 A：让导出脚本直接初始化（单次提交，作者中性）
npm run export:oss -- --out ../toposky-oss --git-init

# 方式 B：手动
cd ../toposky-oss
git init
# 先核对导出树，再显式添加已确认的公开文件；不要复用内部仓库的 .git。
git add <已核对的公开文件路径>
git -c user.name="<发布署名>" -c user.email="<发布邮箱>" commit -m "chore: 首个开源版本"
git log --oneline    # 应当只有一个提交，且不含内部历史
git remote add origin <公开仓库地址>
git push -u origin main
```

## 五、打标签与发布

```bash
git tag -a v0.1.0 -m "v0.1.0"
git push origin v0.1.0
# 在 GitHub 上创建 Release，附：能力清单、已知限制、升级说明
```

版本号遵循语义化版本；`CHANGELOG.md` 的 `[Unreleased]` 段落随发布改为具体版本与日期。

## 六、发布后核对

- [ ] 公开仓库首页能 clone 后按 README 跑起来（`npm run data:init && npm run dev`）；
- [ ] 全仓扫描内部标识 0 命中（导出脚本已做，发布后再抽查一次）；
- [ ] LICENSE / NOTICE 完整（含 `elkjs` EPL-2.0 说明）；
- [ ] issue 模板与 SECURITY 的联系方式可用；
- [ ] 演示数据仍为虚构内容；生产包/镜像/静态站不包含实例数据、环境文件或内部资料。
- [ ] Pages 首页、所有导航、静态资源与刷新正常，演示不可写且没有 HTTP API。
- [ ] 空数据卷可安全初始化示例，已有实例文件不会被覆盖，损坏/缺失数据不会假报健康。
- [ ] 配置 main 分支保护与必需 CI 检查，确认凭证扫描、依赖审计与 Dependabot 正常。
- [ ] 启用并实测私密漏洞报告；文档若引导 Discussions，启用它或修正文档。

改变仓库可见性、推送、打标签、部署或调整 GitHub 设置都应在最终验证后由维护者明确确认执行。

## 七、后续更新

1. 在**内部仓库**修问题、补文档；
2. 重新执行「导出 → 自检 → 验证」；
3. 用 `git diff --no-index` 或直接对比两个目录，确认公开仓库只包含预期改动；
4. 在公开仓库以新提交（或新分支 + PR）合入。

## 八、常见问题

| 现象 | 处理 |
|---|---|
| 导出后 `npm run validate` 报错 | 检查内部仓库是否把数据文件提交进去了；确认示例数据合法 |
| 自检报「内部路径引用」 | 文档里出现了内部目录/脚本名，改成中性描述后重新导出 |
| 自检报「凭证」 | 立即轮换凭证，并从内部仓库历史中清理（不要在公开仓库修） |
| 导出物与公开仓库历史冲突 | 公开仓库只接受导出物，不要手工 merge 内部历史 |
