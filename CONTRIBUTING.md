# Contributing

<p align="center"><strong>English</strong> · <a href="CONTRIBUTING.zh-CN.md">简体中文</a></p>

Thanks for helping. Two things about this project shape how contributions work:

1. **Data is the product.** New or changed dependencies must carry evidence (a source and a
   locatable reference), or they will not be merged.
2. **No real organisation data in public.** Real system names, domains, repositories, teams and
   people must not appear in issues, pull requests, screenshots or example data.

## Get started

```bash
git clone https://github.com/skyzhao1223/toposky.git
cd toposky
npm install
npm run data:init   # optional: create ./data from the fictional demo dataset
npm run dev         # http://127.0.0.1:3000
```

Node 22.18 or newer is required (scripts import `.ts` directly). There is no database to set up.

## What to contribute

| Kind | Examples | Extra requirement |
|---|---|---|
| Bug fix | Layout glitches, validation false positives, import/export failures | Include reproduction steps; a failing test is better |
| Feature | New layout, report, data source integration | Open an issue first for anything large |
| Documentation | Architecture, data model, deployment | Must match actual behaviour |
| Example data | Richer fictional scenarios | Fictional only; must pass `npm run validate` |
| Tests | Edge cases and regressions | `npm test` must stay green |

## Development workflow

```bash
git checkout -b feat/your-change

# after changing code, data or docs:
npm run validate && npm run tsc && npm run lint && npm test
# build-related changes only:
npm run build

# commit with explicit paths (avoid git add -A)
git add src/... docs/...
git commit -m "feat(scope): summary"

git push origin feat/your-change
```

Conventions:

- Commit messages use `type(scope): summary` (`feat`, `fix`, `refactor`, `docs`, `test`, `chore`);
- A pull request does one thing, and its description states **why, what changed, and how it was
  verified** (commands and output);
- Never commit `data/` or real metadata; the repository ships fictional examples only.

## Data changes

Every new or changed dependency needs `evidence`:

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

Review points (full methodology in [docs/GOVERNANCE.md](docs/GOVERNANCE.md)):

- `evidence.kind` and a locatable `ref` are required; if you have no evidence, mark the edge `low`
  or leave it out;
- `verdict=refutes` requires `doubtful`; `absent` must not be `high`;
- If something cannot be mapped, leave it empty and say why. **Do not guess.**
- Do not turn "I did not find it" into "it does not exist".

## Adding a data source

See [docs/ENGINEERING.md](docs/ENGINEERING.md): emit edge assertions, diff them against the graph,
map to the four verdict states, and report by default. Writing requires an explicit `--apply`.
For Backstage catalogs, see [docs/BACKSTAGE.md](docs/BACKSTAGE.md).

## License and conduct

- Contributions are licensed under [Apache-2.0](LICENSE);
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md);
- Report security issues privately per [SECURITY.md](SECURITY.md), not in a public issue.
