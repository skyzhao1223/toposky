# Security Policy

<p align="center"><strong>English</strong> · <a href="SECURITY.zh-CN.md">简体中文</a></p>

## Reporting a vulnerability

Please do **not** open a public issue for security problems. Use GitHub
**Private vulnerability reporting** (Security → Advisories → Report a vulnerability)
on the [repository security page](https://github.com/skyzhao1223/toposky/security).

Maintainers must enable this channel immediately after switching repository visibility to public
and verify the report button before announcing a release. If it cannot be enabled, provide a
monitored alternative private channel before publication; do not post vulnerability details publicly.
GitHub `noreply` addresses are not a supported security-report inbox.

Include the affected version, reproduction steps and impact (for example, whether data can leak or
arbitrary files can be read). We will confirm and respond as soon as possible, and credit reporters
who wish to be named once a fix is released.

## Supported versions

| Version | Status |
|---|---|
| 0.x (current) | Reports accepted; fixes best-effort (no LTS commitment yet) |

## Data sensitivity

TopoSky treats topology data as the operator's asset:

- The public repository contains fictional demo data only (`examples/demo/`);
- Real instance data lives in `data/` or outside the repository and **must not** appear in issues,
  pull requests, screenshots or logs;
- The server only reads local files and makes no outbound calls; `PUT /api/topology` writes the data
  file and tries to commit it with git.

The application does not implement user authentication. The default npm development/production
commands and Compose host port are loopback-only; this is a local/trusted-network tool, not a
public multi-user service. Explicitly overriding the hostname or publishing ports broadly removes
that boundary. Read-only static demos contain fictional data and no HTTP API.

If you expose a deployment to the internet, at minimum:

1. Add authentication and HTTPS at the reverse proxy;
2. Do not give anonymous users write access (`PUT /api/topology`, restore endpoints);
3. Mount `data/` from a dedicated volume and consider a read-only filesystem for the rest.

## Dependencies and builds

- Runtime dependencies are listed in `package.json`; licenses in [NOTICE](NOTICE);
- Enable dependency scanning in CI (`npm audit`, Dependabot or similar);
- Never commit credentials. If you find one in the repository, report it privately as above.
