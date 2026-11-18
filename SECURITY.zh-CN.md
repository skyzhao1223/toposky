# 安全策略

<p align="center"><a href="SECURITY.md">English</a> · <strong>简体中文</strong></p>

## 报告安全问题

请**不要**通过公开 issue 报告安全问题。通过[仓库安全页面](https://github.com/skyzhao1223/toposky/security)的
**Private vulnerability reporting**（Security → Advisories → Report a vulnerability）私下提交。

维护者应在切换仓库为 public 后立即启用此渠道，并在宣布 Release 前验证报告按钮可用。
若无法启用，应在发布前先提供有人接收的替代私密渠道；不要在公开 issue 中贴漏洞细节。
GitHub `noreply` 地址不是安全报告收件箱，不应承诺代为转发。

请在报告中说明：受影响版本、复现步骤、影响范围（例如是否存在数据泄漏或任意文件读取）。
我们会在确认后尽快回复，并在修复发布后致谢（如你愿意）。

## 支持范围

| 版本 | 状态 |
|---|---|
| 0.x（当前） | 接受安全报告，尽力修复（早期版本不承诺 LTS） |

## 数据敏感性（重要）

本项目把「拓扑数据」当作**部署方自己的资产**：

- 公开仓库只包含虚构示例数据（`examples/demo/`）；
- 真实实例数据放在部署环境的 `data/` 或外部目录，**不应出现在 issue/PR/截图/日志里**；
- 服务端只从本地文件读取数据，不主动外连；`PUT /api/topology` 会写入数据文件并尝试 git 提交——生产环境请配合访问控制（反向代理鉴权/内网部署）。

应用没有用户登录鉴权。默认 npm 开发／生产命令及 Compose 宿主端口仅监听回环地址，
定位是本地或受信网络工具，不是可以匿名暴露的公网多用户服务。显式覆盖 hostname 或广泛发布端口
会移除这层边界。只读静态演示只包含虚构数据，不提供 HTTP API。

如果你的部署暴露在公网，请至少：

1. 在反向代理层加认证与 HTTPS；
2. 不要给匿名用户写权限（`PUT /api/topology`、版本回滚接口）；
3. 用只读文件系统或独立数据盘挂载 `data/`。

## 依赖与构建

- 运行时依赖见 `package.json`，许可证清单见 [NOTICE](NOTICE)；
- 建议在 CI 中开启依赖漏洞扫描（如 `npm audit` 或 Dependabot）；
- 我们不会在仓库中提交任何凭证；如发现仓库中存在凭证，请立即按上述方式报告。
