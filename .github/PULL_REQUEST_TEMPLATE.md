## Why / 动机

<!-- Why is this change needed? What problem does it solve? Link the issue. / 为什么需要这个改动？解决什么问题？关联 issue： -->

## What changed / 改动内容

<!-- Point by point. Call out data model, vocabulary or validation changes separately. / 分点说明；涉及数据模型/词表/校验规则的变更请单独标注。 -->

## Verification / 验证方式

```bash
npm run validate   # 0 errors
npm run tsc
npm run lint
npm test           # 45/45
```

## Data changes / 数据变更（touching topology.json or example data）

- [ ] New relations carry `evidence.kind` and a locatable `ref` / 新增关系带证据与可定位出处
- [ ] `verdict` matches `confidence` (`refutes` → `doubtful`; `absent` is not `high`) / 结论与置信度一致
- [ ] “Not found” is not recorded as “does not exist” / 没有把「没找到」写成「不存在」
- [ ] `contract.target` locates the interface, topic or table where possible / 尽量定位到具体落点
- [ ] Example data is fictional and contains **no real organisation information** / 示例数据为虚构，不含真实组织信息

## General checklist / 通用检查

- [ ] Ran `validate` + `tsc` + `lint` + `test` (and `build` for build-related changes) / 已跑全部检查
- [ ] Documentation updated where needed (`docs/DATA-MODEL.md`, `docs/GOVERNANCE.md`, README) / 文档已同步
- [ ] Commit message follows `type(scope): summary` / 提交信息符合约定
