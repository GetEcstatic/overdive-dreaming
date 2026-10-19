# Repository knowledge graph

Up: [Docs index](../INDEX.md) · Status: current convention

## Same structure, portable links

The surrounding vault uses Home → project hub → note, one owning note per fact, and explicit parent links. This repository uses the same structure: vault project hub → `docs/INDEX.md` → feature map → implementation/tests.

Use ordinary relative Markdown links inside the repository so navigation works in GitHub, standalone worktrees and raw file readers. Use a visible `Up:` link on new maps and references rather than injecting vault frontmatter into repository files. Keep vault wikilinks in the external project hub. Do not duplicate people/entity records or hard-code a working branch there as permanent truth.

## Authority and lifecycle

- **Current feature map:** short task-oriented links to code, tests, constraints and unresolved work. Do not reproduce types, constants or API inventories.
- **Reference:** settled rationale and invariants. Verify against code when changing it.
- **Plan:** proposed behaviour; state implemented slices and remaining work separately.
- **Shipped:** historical implementation record, not proof of current production state.
- **Archive:** superseded context, never an implementation instruction.

Every new document needs a parent and an entry in its parent map. Use kebab-case filenames. Preserve old plans rather than deleting decisions; label supersession explicitly. For moves in the vault, use the vault move tool and review repaired links; do not bulk reorganise this repository just to achieve naming uniformity.

When code changes, update the owning reference/map in the same change or flag the mismatch. Record verified commits when useful; do not use an unexplained 'current' deployment claim. An agent must still inspect the actual checkout.

## Incremental adoption

The [video map](../video/README.md), [storage/auth/deployment map](../storage-infra/README.md) and [routines/persisted logs map](../routines/README.md) are curated implementation entry points. The older index remains a discovery catalogue, not a certification that every linked specification is current. Continue auditing the remaining plans and broader training-session/metrics references before promoting them. Audit each before promoting it; do not decorate old documents with 'current' metadata automatically.

Historical: the old agent manual is retained as [historical context](../archive/legacy-agent-context.md), not auto-loaded. Git retains prior versions of the operating guide.

## Validation

Consult the [document classification](../code-health/document-classification.md) before trusting older documents. The registry at `scripts/doc-classification.json` owns classifications and evidence. Unknown files default to **needs-review**, never current. Superseded documents need a visible opening warning and replacement. A current reference may link to historical/superseded material only on a line explicitly labelled `Historical:`, `History:` or `Superseded:`.

Run `python3 scripts/audit-docs.py` to validate classification policy and inventory freshness; `--write` regenerates the report after evidence changes. This is an initial triage, not proof that every file has been semantically reviewed.

Run `python3 scripts/check-doc-graph.py` from the repository root. It checks the small curated graph's relative inline links, required parent edges and canonical Claude import. It does not check heading anchors, reference-style links, external URLs, deployment state or agreement with implementation. Expand the checked set as feature maps are reviewed.

For semantic review, test real tasks: recording defaults, exhausted upload retries, HUD export invalidation, and app-versus-Functions changes. Can an agent reach the owning code and relevant tests within three reads from the index? Record missing edges, not more copied prose.
