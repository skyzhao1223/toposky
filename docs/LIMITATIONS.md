# Current limitations and operating boundaries

This is a source-backed description of the current implementation, reviewed on **2026-11-17**. Governance rules describe what operators *should* require; they do not mean every rule is enforced by every write path. Suggested fixes below are priorities, **not implemented guarantees**. For request formats and status codes, see the [HTTP API reference](<API.md>).

TopoSky visualizes a supplied metadata graph. Manual edits and catalog import can populate it; it does not automatically discover, independently verify or continuously observe your dependencies. “Running” and similar environment statuses are stored metadata, not live health checks. Impact results support scoping and review, not fault prediction or automatic release approval.

## Evidence policy is stronger than enforcement

**Current behavior**

- Relations can omit `confidence` and `evidence`. Even when evidence is present, `ref` and `verdict` are optional in the schema. A filled evidence field is not independent verification.
- The save validator rejects illegal enum values and dangling relation references, but missing evidence is a warning. `verdict=refutes` with confidence other than `doubtful` is also a **warning**, not a save-blocking error. `absent` with `high` is not made a validation error by these checks.
- The evidence view considers an edge committable only when `confidence=high` **and** `verdict=supports`. Its `verified` flag means a verdict was recorded, not that this application inspected the claimed source.
- Missing confidence has different defaults: the evidence view uses `doubtful`, while impact traversal uses `low`.
- The Metadata relation table displays confidence and evidence read-only. Its editable label/description/contract fields do not provide an evidence-review editor. Operators must maintain those evidence fields in their controlled data workflow; the UI does not independently produce or repair them.

**User impact:** a successful save or high confidence label does not certify evidence quality, recency or truth. Contradicted or unverified edges can remain in the graph and participate in impact traversal.

**Operate safely:** review evidence references, provenance and observation times yourself. Treat `absent` as pending investigation, not evidence of non-existence; remove or downgrade refuted dependencies according to policy. Review validation warnings as well as errors. Do not approve changes solely from a confidence badge.

**Proposed improvement:** enforce evidence/confidence consistency at the write boundary, align default handling, and make impact use the same evidence semantics. Until then, the stricter governance policy is a human review requirement.

Sources: [relation schema](<../topology.schema.json#L152-L188>), [runtime consistency warnings](<../src/lib/validateTopology.ts#L142-L156>), [evidence coverage warnings](<../src/lib/validateTopology.ts#L208-L230>), [evidence semantics](<../src/lib/evidence.ts#L89-L121>), [impact default](<../src/lib/impact.ts#L101-L110>), [read-only evidence columns](<../src/app/metadata/page.tsx#L495-L521>), [governance policy](<GOVERNANCE.md>).

## Impact is a scoping aid, not a reliability guarantee

**Current behavior**

1. Traversal follows all stored relations in each direction up to the selected depth. It uses only `confidence`, not `evidence.verdict`, source quality, timestamp, runtime conditions or interface-level changes. A `high` edge without supporting evidence can increase `trustCommittable` even though the evidence view would not consider that edge committable.
2. BFS is **first-arrival wins**. Once a node is visited in a direction, another path does not replace its path or confidence. Equal-length alternatives therefore depend on the order of `relations[]`; this is neither a strongest-path nor an all-paths analysis.
3. Upstream and downstream are traversed separately. A cycle can put the same node in both lists. `summary.total` deduplicates nodes (and excludes focus), but `trust` counts the two directional entries separately. Do not interpret trust totals as a partition of unique affected nodes.
4. Affected flows are found by step-node intersection. Despite its name, the current `process.systems` contract is a list of **node IDs**. Matching tests those IDs directly, without expanding business-system registry IDs. Do not populate that field with registry IDs or assume automatic system-membership expansion.
5. The HTTP response omits per-node `confidence` and `weakestRelationId`, although the shared calculation has them. Contracts are only the focus node's direct relations, not the entire transitive graph. Names such as repository `systems` and owner counts currently describe nodes, not deduplicated business systems.

**User impact:** changing JSON ordering can change displayed trust without changing the underlying edges. Trust labels can overstate verified evidence, cycles can inflate directional trust counts, and process coverage depends on identifier conventions. Neither `trustCommittable` nor a generated report's “directly committable” wording is a reliable approval guarantee.

**Operate safely:** use the result to identify candidate teams, flows and tests. Review the actual relationships and evidence, both directions and alternative paths. Compare unique-node totals separately from traversal-entry counts. Check that your process identifiers match what the current implementation consumes. Combine this graph with change diffs, contracts, owners and tests.

**Proposed improvement:** define an order-independent multi-path rule, use evidence-aware path eligibility, distinguish unique-node from directional counts, expose path confidence in the API, and reconcile node versus system membership.

Sources: [BFS implementation](<../src/lib/impact.ts#L85-L138>), [flow/process matching and directional trust](<../src/lib/impact.ts#L138-L174>), [process identifier contract](<../src/types/index.ts#L569-L579>), [summary naming](<../src/lib/impact.ts#L218-L235>), [HTTP mapping](<../src/app/api/impact/route.ts#L49-L72>), [report wording](<../src/app/impact/page.tsx#L125-L139>).

**Verification performed for this review:** pure in-memory synthetic graphs, with no instance-data reads, reproduced (a) a diamond's terminal confidence switching from `low` to `high` after reordering the same edges, (b) an unverified `high` edge counted by impact as committable but not by the evidence view, and (c) a bidirectional cycle counted once as a unique affected node but in both directional trust entries. These are algorithm checks, not production-data or HTTP integration tests.

## Saving, Git audit and concurrent edits

**Current behavior**

- The default instance directory is ignored by the code repository. Saving normally succeeds there **without a Git audit commit**, unless you deliberately create a separate data repository. A directory outside any Git repository behaves similarly.
- The version token is the last Git commit affecting the writable file. It does not reflect uncommitted edits, snapshot restore, or necessarily the file currently selected for a fallback read.
- Conflict rejection requires both a supplied `baseVersion` and a truthy current Git version. Legacy writes and missing version history bypass it. There is no shared lock encompassing compare → file write → commit; direct topology writes are not temporary-file replacements.
- Commit errors are caught by the Git helper. The PUT handler returns save success with `committed:false`, but does not forward the helper's `error`. An older hash may still be returned. An unchanged save can also fail the attempted Git commit.
- Save feedback uses the presence of `version` to say “saved and committed,” rather than checking `committed`. This can report an old hash as if the current save were audited. Read-side client caching also retains an old version when a later response lacks the header.
- Snapshot creation and index changes are not a cross-file transaction. IDs use milliseconds and index updates have no shared lock. Snapshots do not replace backups or Git history.

**User impact:** “saved” means the file write succeeded, not that an audit commit exists or another writer was protected from lost updates. A visible hash is insufficient to establish that the current data was committed.

**Operate safely:** keep real metadata in a separate private data repository, initialize its history deliberately, and verify Git is available to the server. Use one writer / a maintenance window, back up outside the application, and inspect `committed` plus Git history rather than relying on UI wording. Do not add ignored real data forcibly to the public code repository. Setting up Git enables *conditional* auditing and version checking; it does not enable atomic multi-user protection.

**Proposed improvement:** serialize all write paths, compare a content-based version inside the same critical section, use atomic data/index updates, propagate commit errors, and make UI feedback follow `committed`.

Sources: [default ignore rule](<../.gitignore#L27-L28>), [Git audit helper](<../src/lib/gitStore.ts#L32-L99>), [conditional conflict and save response](<../src/app/api/topology/route.ts#L68-L90>), [direct file write](<../src/app/api/topology/route.ts#L17-L19>), [feedback mismatch](<../src/utils/saveFeedback.tsx#L18-L40>), [client version caching](<../src/services/topology.ts#L64-L69>), [snapshot ID and index update](<../src/app/api/versions/route.ts#L41-L64>).

### Restore bypasses the normal save safeguards

Restore validates the snapshot path and parses its JSON before creating a backup and replacing the data file, but it does not validate the topology schema, check a version, lock against concurrent writes or create a Git commit. A later 500 response can still follow partial backup/index writes; this is not a cross-file transaction. Snapshot diff only covers nodes and relations, so “no changes” can hide modifications to flows, processes, systems or vocabularies.

**Operate safely:** inspect the snapshot and full-document diff before restoring, pause other writers, keep an independent backup, then validate and inspect the resulting file and deliberately record any required audit commit. Treat restore as an administrative operation, not a protected ordinary save.

Sources: [restore sequence](<../src/app/api/versions/[id]/restore/route.ts#L18-L55>), [limited diff scope](<../src/app/api/versions/diff/route.ts#L30-L80>).

## Data-path and container operating boundaries

The resolver refuses to silently fall back when an explicit data path is missing. `GET /api/topology` now returns a safe **HTTP 503** for missing, unreadable, malformed or structurally invalid data; it does not return a healthy empty graph or expose filesystem details.

The container entrypoint initializes the bundled fictional example only in the **empty default `/data` volume**, with exclusive-copy semantics. It never overwrites existing contents, including corrupt data, or initializes custom explicit paths. The content health check validates usable JSON, unique IDs and relation references. Existing nonempty mounts without a topology remain unhealthy until the operator supplies data.

**Operate safely:** initialize the intended data location deliberately, confirm mount ownership allows UID 1001 to write, and verify source headers and expected graph content. Verify Git availability and private data-repository setup separately: the runtime image still has no explicit Git installation step. Do not save an empty replacement as a way of fixing a read error.

Regression tests cover initialization, no-overwrite, symlinks, 503 responses and content health. Running helpers/tests is not a claim that a Docker image or hosted deployment has been verified; the Docker workflow performs the actual container smoke test.

Sources: [explicit missing path](<../src/lib/dataPath.ts#L94-L128>), [topology GET](<../src/app/api/topology/route.ts>), [entrypoint](<../scripts/docker-entrypoint.mjs>), [content health](<../scripts/healthcheck.mjs>), [Docker recipe](<../Dockerfile>), [Compose mount and environment](<../docker-compose.yml>), [deployment regression](<../test/deployment.test.mjs>).

## CLI environment loading is not uniform

`npm run data:init` does **not** load `.env`, unlike `data:status`, validation and several report commands. If the intended location exists only in `.env`, initialization can target the default directory while the server later uses another location.

Run from the repository root and supply the same explicit environment to both initialization and serving, for example:

```bash
TOPOLOGY_DATA_DIR=../my-topology-data npm run data:init
TOPOLOGY_DATA_DIR=../my-topology-data npm run dev
```

Initialization copies fictional sample data and never overwrites an existing target; it does not create a Git repository or verify real metadata. Replace/review the sample deliberately before using it as your own map.

Sources: [package command definitions](<../package.json#L17-L29>), [initialization script](<../scripts/init-data.mjs#L12-L32>), [shared script path resolver](<../scripts/lib/data-file.mjs#L13-L22>).

## Reports and public demo are not universal guarantees

### `docs:numbers` has dataset-specific assumptions

The script directly interpolates missing tally keys, so a valid dataset without a layer or relationship type can produce `undefined` instead of zero. It also assumes optional flow/process structures exist and includes fixed impact probes for `mysql` and an old dataset-specific `cost-control` node without checking that the focus exists. The shared calculation itself does not validate focus existence; unlike the HTTP route, such a probe can produce a misleading empty result. This is not yet a generic reporting contract for arbitrary datasets.

**Verification performed:** running the script with `TOPOLOGY_DATA=examples/demo/topology.json` (without loading `.env`) reproduced `undefined` in the demo's layer/type text and an empty legacy probe. No real instance data was read.

**Operate safely:** label reports with their actual data source, inspect missing values and focus IDs, and do not publish the output unchanged as a verified generic inventory. Calculate only meaningful probes for your dataset. A proposed fix is zero-default tallies, optional-structure handling and caller-selected, validated focus IDs.

Source: [report assumptions and fixed probes](<../scripts/docs-numbers.mjs#L17-L50>).

### Demo availability and build scope

The [advertised public demo URL](<https://skyzhao1223.github.io/toposky/>) returned HTTP **404 when checked on 2026-11-17**. That is a dated availability observation, not a claim that it can never be deployed. Do not advertise a live demo until a published deployment has been verified.

Static demo mode bundles fictional data, bypasses topology API fetching and disables client saves. Its build now uses an external temporary workspace and a positive public-source allow-list, excludes API/private data/environment files, and does not move source API files or delete development caches. Source/cache changes during the build cause output publication to fail. `NEXT_PUBLIC_BASE_PATH` is inlined at build time; the Pages workflow derives the project subpath from the repository name, while a local demo defaults to root.

The checker verifies exported page resources, navigation, legal files and source/cache preservation. These checks are not a read-only switch or authorization layer for a normal server, and a successful local build does not establish a working hosted demo. Actual GitHub Pages availability must still be verified after authorized deployment.

Sources: [demo mode](<../src/lib/demoMode.ts>), [bundled data and client-save guard](<../src/services/topology.ts#L49-L62>), [save guard](<../src/services/topology.ts#L124-L127>), [isolated demo build](<../scripts/build-demo.mjs>), [static checker](<../scripts/check-demo.mjs>), [Next configuration](<../next.config.js>), [Pages workflow](<../.github/workflows/pages.yml>).

## Access control and presentation

The documented API handlers have no built-in authentication or role checks. Author/email fields are not proof of identity. Static-demo client guards do not protect a normal deployment. Do not expose real instance data or write/restore endpoints publicly without an independent access-control boundary; protect reads as well as writes and avoid leaking source-path headers through public diagnostics.

The application UI and many response strings are currently Chinese; English documentation is not an English UI. Environment statuses and graph evidence are snapshots of supplied metadata, not real-time monitoring or automatic verification. Account for that distinction when sharing screenshots, exports or impact summaries.

Sources: [topology route](<../src/app/api/topology/route.ts>), [versions route](<../src/app/api/versions/route.ts>), [restore route](<../src/app/api/versions/[id]/restore/route.ts>), [status display/data consumption](<../src/app/impact/page.tsx>), [metadata editing and field inventory](<../src/app/metadata/page.tsx#L301-L330>).
