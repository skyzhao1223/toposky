# 贡献指南

<p align="center"><a href="CONTRIBUTING.md">English</a> · <strong>简体中文</strong></p>

感谢参与！这个项目有两个特点会影响贡献方式，请先看一眼：

1. **数据是核心**：新增/修改依赖关系时，必须带证据（来源 + 可定位出处），否则不会被合并；
2. **公开仓库不含真实数据**：任何真实公司/域名/仓库/团队/人名都不能出现在 issue、PR、截图或示例数据里。

## 一、先跑起来

```bash
git clone <仓库地址> && cd toposky
npm install
npm run data:init        # 可选：用虚构示例初始化 ./data
npm run dev              # http://127.0.0.1:3000
```

要求 Node ≥ 22.18（脚本直接 import `.ts`）。不需要数据库。

## 二、可以贡献什么

| 类型 | 例子 | 额外要求 |
|---|---|---|
| Bug 修复 | 布局错位、校验误报、导入导出失败 | 附复现步骤；能给失败用例更好 |
| 功能 | 新布局、新报告、新数据源接入 | 先开 issue 对齐设计，避免大改被拒 |
| 文档 | 架构/数据模型/部署说明 | 与代码行为一致 |
| 示例数据 | 更完整的虚构场景 | 必须虚构，且能通过 `npm run validate` |
| 测试 | 边界用例、回归用例 | `npm test` 全绿 |

## 三、开发流程

```bash
# 1. 建分支
git checkout -b feat/your-change

# 2. 改代码 / 数据 / 文档后，跑全套检查
npm run validate && npm run tsc && npm run lint && npm test
# 构建相关改动再加：
npm run build

# 3. 提交（显式路径，别 git add -A）
git add src/... docs/...
git commit -m "feat(scope): 摘要"

# 4. 推分支，开 PR
```

约定：

- 提交信息用 `type(scope): 摘要`（`feat` / `fix` / `refactor` / `docs` / `test` / `chore`）；
- PR 描述里写清**动机、改了什么、怎么验证的**（命令与输出）；
- 一个 PR 只做一件事，方便 review 与回滚。

## 四、数据变更的额外要求

新增或修改一条依赖关系时，`relations[]` 必须包含：

```json
{
  "id": "r-xxx",
  "source": "a",
  "target": "b",
  "relationType": "calls",
  "contract": { "kind": "http", "target": "GET /api/xxx" },
  "confidence": "high",
  "evidence": { "kind": "code", "ref": "src/api/xxx.ts:42", "verdict": "supports" }
}
```

审查要点（详见 [docs/GOVERNANCE.md](docs/GOVERNANCE.md)）：

- `evidence.kind` + 可定位 `ref` 必填；没有证据的边请标 `low` 或直接不要提；
- `verdict=refutes` 必须配 `doubtful`；`absent` 不能配 `high`；
- 映射不上就留空并说明原因，**不要猜**；
- 不要把「没搜到」写成「不存在」。

## 五、新增数据源 / 自动采集

见 [docs/ENGINEERING.md](docs/ENGINEERING.md) 第六节：输出「边断言」→ diff → 四态结论 → 默认只出报告，人工确认后 `--apply`。
接入 Backstage 目录见 [docs/BACKSTAGE.md](docs/BACKSTAGE.md)。

## 六、许可证与行为准则

- 提交即表示你同意以 [Apache-2.0](LICENSE) 授权你的贡献；
- 请遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)；
- 安全问题请走 [SECURITY.md](SECURITY.md)，不要开公开 issue。
