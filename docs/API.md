# HTTP API reference

This documents the current server implementation, not a promised transactional or authenticated API. The normal Next.js server exposes the routes below; the static demo does not contain API routes. Error messages are currently mostly Chinese. See [current limitations](<LIMITATIONS.md>) before exposing an instance or automating writes.

**Operational boundary:** use a trusted local instance or an access-controlled deployment. These handlers do not authenticate callers or verify the supplied author identity. Read responses can include organisation metadata and the data-file location. Keep real data and credentials out of public examples.

## Identifiers and storage

- A **node ID** is `nodes[].id`. Relations connect node IDs. `GET /api/impact?id=...` accepts a node ID, **not** a business-system registry ID (`systems[].id` / `nodes[].systemId`), unless that string also happens to be a node ID. It does not expand all members of a system.
- A **Git version** is the latest commit hash affecting the *writable instance data file*. It is not a content hash of the current JSON and is not a snapshot ID.
- A **snapshot ID** is generated as `v-${Date.now()}` and used by the versions routes. Only `v-` followed by 1–20 digits is accepted; path separators, encoded traversal variants, control characters and linked snapshot/index paths are rejected with 400. Use IDs returned by the API rather than constructing file paths. `current` is a special token only for diff.
- Read resolution and write targets can differ: a fresh instance may read the bundled example, while saves and snapshots target the instance location. Explicit missing read paths fail inside the resolver, but individual API handlers handle that failure differently.
- `TOPOLOGY_DATA` selects the data file; `TOPOLOGY_DATA_DIR` selects the instance directory. If both are set, the data file uses `TOPOLOGY_DATA`, but the snapshot directory uses `TOPOLOGY_DATA_DIR`. Prefer one consistent setting.

Sources: [data-path resolver](<../src/lib/dataPath.ts#L46-L129>), [Git version implementation](<../src/lib/gitStore.ts#L60-L65>), [impact ID check](<../src/app/api/impact/route.ts#L30-L47>).

## Topology

### `GET /api/topology`

Returns the topology object directly, not an envelope, after runtime topology validation. This validates stored structure and references, not the truth of the declared evidence.

On a successful read, response headers are:

| Header | When present | Meaning |
|---|---|---|
| `X-Topology-Version` | Only when a non-empty Git version is available | Last commit affecting the writable instance file; use as `baseVersion` when saving |
| `X-Topology-Source` | Successful read | Display path of the file read; outside-repository files can expose an absolute path |
| `X-Topology-Demo: 1` | Successful read of the bundled example | The selected read source is demo data; absence does not certify that data is real or verified |

**Failure behavior:** missing, unreadable, malformed or structurally invalid data returns HTTP **503** with `{error,code:"TOPOLOGY_DATA_UNAVAILABLE"}`, without source/version headers or filesystem details. It is not converted to a successful empty graph. The container health check also validates usable JSON, unique node/relation IDs and relation references; HTTP success alone is insufficient.

Source: [topology GET](<../src/app/api/topology/route.ts#L21-L34>).

### `PUT /api/topology`

Replaces the full topology; it is not a patch endpoint. Send `Content-Type: application/json`.

Preferred body shape:

```json
{
  "data": { "nodes": [], "relations": [] },
  "author": "Example maintainer",
  "email": "maintainer@example.invalid",
  "message": "Update topology metadata",
  "baseVersion": "<X-Topology-Version from the preceding GET, if available>"
}
```

The empty graph above illustrates the envelope only; **do not send it to an instance you want to keep**. Fetch and edit your own complete topology object. `author`, `email` and `message` are optional and fall back to local defaults. They are caller-provided Git metadata, not authenticated identity. The legacy body consisting of the topology object itself is also accepted when `nodes` is an array; it has no `baseVersion` check.

Processing order is: parse body → run `validateTopology` → compare Git versions conditionally → write the JSON directly to the instance file → attempt a Git commit.

| Status | Condition / response |
|---|---|
| `200` | File save succeeded: `{success:true,warnings,version,committed,commitSkipped?}`. `version` may be null or an older hash. `committed:false` is possible even when `success:true`. |
| `400` | Missing `data`, JSON parsing failure, write failure, or another caught exception: `{success:false,error}`. |
| `422` | Validator returns `ok:false`: `{success:false,error,errors}`; at most the first 50 validation errors are returned. |
| `409` | **Both** supplied `baseVersion` and current Git version are truthy and differ: `{success:false,conflict:true,error,version}`. |

Warnings do not block saving, including missing evidence or evidence/confidence inconsistencies. The runtime validator is a hand-written set of checks, not a full execution of the published JSON Schema; malformed values can instead throw and become 400 responses.

**Saving is not the same as committing.** If the instance file is ignored by Git or outside a Git repository, the response includes a `commitSkipped` reason. A failed `git add` / `git commit` returns `committed:false` from the helper, but its `error` is **not forwarded by this endpoint**. No-change commit attempts take that same failure path. Check `committed`, not just `success` or a non-null `version`.

**The version check is conditional, not atomic multi-user protection.** No token means no check; missing Git history means no check. The compare/write/commit sequence has no encompassing lock. A file edited outside Git, or restored from a snapshot, need not change the version token.

Sources: [PUT body, validation and version check](<../src/app/api/topology/route.ts#L36-L75>), [write and response](<../src/app/api/topology/route.ts#L17-L19>), [commit response fields](<../src/app/api/topology/route.ts#L77-L91>), [Git helper](<../src/lib/gitStore.ts#L75-L99>), [runtime validation](<../src/lib/validateTopology.ts#L128-L230>).

## Git history

### `GET /api/history`

Returns `{enabled,history}`. History entries contain `hash`, `author`, `date` (Git ISO committer date) and `message` (subject). The current limit is the latest 50 commits affecting the writable instance file.

`enabled` means the helper found an ancestor Git repository and considers the file not ignored. It does not prove a usable Git executable, existing commits, or that the current on-disk data was committed. Git log failures can simply produce an empty history. A caught endpoint exception returns HTTP 200 with `{enabled:false,history:[],error}`.

Sources: [history handler](<../src/app/api/history/route.ts#L5-L14>), [Git detection and log](<../src/lib/gitStore.ts#L23-L65>), [history parsing](<../src/lib/gitStore.ts#L101-L125>).

## Named snapshots

Snapshots are filesystem copies plus a JSON index, separate from Git history. They do not establish Git audit coverage. All routes below return 400 for invalid IDs or unsafe linked storage paths before reading/writing them; the other status codes in the table apply to valid paths.

| Route | Request | Success response | Failure behavior |
|---|---|---|---|
| `GET /api/versions` | None | `{versions:[...]}` | `500` with `{error}` for caught errors; listing creates the directory and empty index if absent |
| `POST /api/versions` | `{name,description?}`; `name` must be a non-empty string (whitespace-only is not rejected) | `{success:true,version:<metadata>}` | Invalid name: `400`; read/parse/write errors: `500` |
| `GET /api/versions/{id}` | Snapshot ID | Parsed snapshot topology directly | Missing file: `404`; caught errors: `500` |
| `DELETE /api/versions/{id}` | Snapshot ID | `{success:true}` | ID absent from index: `404`; missing/corrupt index or other caught errors: `500` |
| `POST /api/versions/{id}/restore` | Snapshot ID; request body ignored | `{success:true,data:<restored topology>,backupVersion:<metadata>}` | Missing snapshot: `404`; caught errors: `500` |

Metadata contains `id`, `name`, optional `description`, `createdAt`, `nodeCount`, `relationCount` and `size` (UTF-8 bytes). Creation reads the selected current topology and writes its raw JSON to a snapshot; it does not validate it or make a Git commit. The snapshot file uses temporary-file rename, but index changes are plain read/modify/write operations. Simultaneous requests are not a transaction; millisecond IDs and shared temporary paths are not collision-proof.

**Restore is a destructive replacement, not the normal save pipeline.** It validates the snapshot path and parses the selected JSON first, obtains/initializes the writable instance file, snapshots the previous content, updates the index, then replaces the instance file through a temporary-file rename. It does **not** run topology schema validation, check `baseVersion`, acquire a shared write lock, or create a Git commit. A later error can still leave partial backup/index changes; this is not a cross-file transaction. Back up outside this snapshot mechanism and use a maintenance window / single writer when restoring. Inspect and validate the resulting data and deliberately record any required audit commit afterward.

Sources: [list and create](<../src/app/api/versions/route.ts#L10-L70>), [get and delete](<../src/app/api/versions/[id]/route.ts#L10-L45>), [restore order and safeguards actually present](<../src/app/api/versions/[id]/restore/route.ts#L10-L56>).

### `GET /api/versions/diff?from={id}&to={id|current}`

`from` is required; `to` defaults to `current`. Either side may use `current` to read the currently selected topology. Both IDs are checked before any data read. Missing `from`, invalid IDs or unsafe linked paths return 400; missing valid snapshot files and other caught errors return 500, not 404.

Response fields are `addedNodes`, `removedNodes`, `modifiedNodes`, `addedRelations`, `removedRelations`, `modifiedRelations` and a human-readable Chinese `summary`. Modified records give changed **top-level field names**, not before/after values. Comparisons use `JSON.stringify` on each field.

This diff only compares `nodes` and `relations` by their IDs. Changes solely to `systems`, vocabularies, `businessFlows`, `entryRoutes` or `processCatalog` are not included; a “no changes” summary is not proof that the complete documents match.

Source: [snapshot diff implementation](<../src/app/api/versions/diff/route.ts#L9-L100>).

## Metadata-level impact

### `GET /api/impact?id={node-id}&depth={1..3}`

`id` is trimmed and must match `nodes[].id`. Missing/blank ID returns 400; an unknown node returns 404; data-read, parse or calculation exceptions return 500. Missing/empty/non-finite depth defaults to 2. Numeric depth is truncated and clamped to 1–3, not rejected.

The response is an envelope:

| Field | Current meaning |
|---|---|
| `level` | Always `"metadata"` |
| `generatedAt` | Calculation timestamp, **not** the observation time of dependencies or production status |
| `focus`, `depth` | Node reference and normalized depth |
| `summary` | Nested numeric summary; it is **not** the entire response |
| `upstream`, `downstream` | Node references (`id`, `name`, optional `layer`, `businessLine`, `owner`) plus `distance` and `via` (relationship-label path) |
| `businessFlows` | Flows whose steps touch the affected set; includes `hitSteps` |
| `processes` | Matched process references (`id`, `name`, `domainId`, `groupName`, optional `host`) |
| `repos`, `owners` | Aggregates for nodes in upstream ∪ downstream ∪ focus; field names such as `systems` in repository entries still hold node references |
| `contracts` | All direct incoming/outgoing relations of the focus, with `direction`, `from`, `to`, `relation`, `contract` (or null); not contracts for every transitive node |
| `caveats` | Human-readable metadata-level cautions, currently Chinese |

`summary` contains `upstream`, `downstream`, `total` (unique affected nodes excluding focus), `businessFlows`, `processes`, `repos`, `owners`, `contracts`, `trust`, `trustCommittable` and `trustIndicative`. The `trust` breakdown counts upstream/downstream traversal entries, not necessarily unique nodes. `trustCommittable` is the count labeled `high`; `trustIndicative` is `low + doubtful`; medium is neither of these. **These names do not guarantee that evidence supports a change decision.**

The shared calculation stores `confidence` and `weakestRelationId`, but the API's upstream/downstream mapping omits both. Consumers cannot recover the selected path's evidence strength from those arrays alone. Traversal uses stored confidence (default `low`), ignores evidence verdicts, and retains the first BFS path to a node in relation-array order. See [impact limitations](<LIMITATIONS.md#impact-is-a-scoping-aid-not-a-reliability-guarantee>).

Read-only example against a **local server explicitly using the fictional example dataset**:

```bash
curl --fail-with-body 'http://127.0.0.1:3000/api/impact?id=approval-api&depth=3' \
  | python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin)["summary"], indent=2))'
```

No fixed output counts are part of this API contract. Actual values depend on the selected dataset and stored relation order.

Sources: [impact response and status codes](<../src/app/api/impact/route.ts#L30-L76>), [depth normalization](<../src/lib/impact.ts#L16-L34>), [traversal and process matching](<../src/lib/impact.ts#L85-L174>), [aggregates and summary](<../src/lib/impact.ts#L177-L242>).
