# 文档索引

> **English summary** — Index of the documentation set, with a one-line description of each
> document and who it is for. Start with the README, then ARCHITECTURE and DATA-MODEL; contributors
> should also read ENGINEERING and GOVERNANCE.

| 文档 | 适合谁 | 讲什么 |
|---|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | 想改代码的人 | 分层结构、数据流、关键设计决策、扩展点、部署形态 |
| [DATA-MODEL.md](DATA-MODEL.md) | 维护数据的人 | 字段与枚举、证据语义、词表机制、派生规则、校验规则 |
| [API.md](API.md)（英文） | 接入接口的人 | 方法、请求参数、保存协议、响应结构与错误行为 |
| [LIMITATIONS.md](LIMITATIONS.md)（英文） | 部署者 / 数据维护者 | 当前实现缺陷、使用边界、临时处理建议与修复方向 |
| [GOVERNANCE.md](GOVERNANCE.md) | 数据负责人 / 评审者 | 覆盖率断言、机制判定、无证据≠反证、置信度口径、评审清单 |
| [ENGINEERING.md](ENGINEERING.md) | 所有贡献者 | 环境、命令、代码结构约定、改动流程、新增数据源 |
| [BACKSTAGE.md](BACKSTAGE.md) | 已用 Backstage 的团队 | 目录映射口径、导入导出命令、已知信息损失 |
| [RELEASING.md](RELEASING.md) | 维护者 | 从内部仓库导出公开版本的完整流程与自检门槛 |

项目入口：[English](../README.md) · [简体中文](../README.zh-CN.md)；贡献方式见[中文贡献指南](../CONTRIBUTING.zh-CN.md) / [English](../CONTRIBUTING.md)。

架构和治理文档区分设计规范与实际实现；上线前应同时阅读[当前限制](LIMITATIONS.md)和[安全说明](../SECURITY.zh-CN.md)。
