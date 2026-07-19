# Iron Grid — Architecture Decision Records

**Version:** 1.0
**Status:** Definitive baseline
**Audience:** All contributors (human and AI)

> This directory holds **Architecture Decision Records (ADRs)**. Each ADR captures
> exactly one functional or technical decision and its consequences. ADRs are the
> mechanism for resolving the open design blockers enumerated in
> `game-specification.md` §33, and for recording any other significant, hard to
> reverse choice.
>
> This README defines the **format and lifecycle**. It does not itself decide
> anything.

---

# 1. When to write an ADR

Write an ADR when a decision is significant and not obvious from the code — in
particular:

- **Resolving an open design blocker** (`game-specification.md` §33): commander
  names/effects/costs, day-limit scoring weights and tie-breakers, special-terrain
  and property art mapping, and the listed edge cases. A blocker is not resolved —
  and the dependent task is not Ready (`definition-of-ready.md`) — until its ADR is
  Accepted **and** the canonical document is updated to match.
- **A cross-cutting technical choice** (a library, a boundary, a persistence or
  concurrency strategy) that future contributors would otherwise reverse-engineer.

Do **not** write an ADR for a rule that already has a canonical home. Gameplay
behavior belongs in `game-specification.md`, game values in `02-data` YAML, and
architecture in `03-architecture` — an ADR records the *decision*, then the
canonical document is updated (documentation before code, `project-manifest.md`).

---

# 2. File naming

```text
NNNN-short-kebab-title.md
```

- `NNNN` is a zero-padded, monotonically increasing sequence number
  (`0001`, `0002`, …). Numbers are never reused.
- The title is a short kebab-case slug of the decision (e.g.
  `0001-commander-modifier-model.md`).

---

# 3. ADR template

Each ADR is one file with this structure:

```markdown
# NNNN — <Decision title>

**Status:** Proposed | Accepted | Superseded by ADR-XXXX | Rejected
**Date:** YYYY-MM-DD
**Resolves blocker:** game-specification.md §33.x   (omit if not a §33 blocker)
**Deciders:** <names/roles>

## Context

The problem, the forces at play, and the constraints. Link the canonical
documents and the specific blocker this decision addresses.

## Decision

The choice made, stated in the affirmative and unambiguously enough to
implement against.

## Consequences

What becomes true as a result — positive and negative — and every canonical
document that must be updated to reflect the decision (with the update made in
the same change).

## Alternatives considered

The options rejected and why.
```

---

# 4. Lifecycle

- **Proposed** — drafted and under discussion; not yet binding.
- **Accepted** — the decision is binding; the canonical documents it affects are
  updated in the same change. Only now does any §33 blocker it resolves count as
  resolved.
- **Superseded** — replaced by a later ADR. The old ADR is kept (never deleted)
  and its status points at the successor; the successor links back.
- **Rejected** — considered and declined; kept for the record so the same option
  is not silently reconsidered.

ADRs are **append-only history**: a decision is changed by adding a superseding
ADR, not by editing an Accepted one in place (beyond flipping its status to
Superseded).

---

# 5. Index

As ADRs are added, list them here:

| ADR | Title | Status | Resolves |
|---|---|---|---|
| [0001](0001-frontend-ui-and-tooling-stack.md) | Frontend UI and developer-tooling stack | Accepted | Open test-runner choice (`testing.md` §12); UI/form/tooling library selection |
| [0002](0002-code-formatter-prettier.md) | Code formatter: Prettier | Accepted | Formatter left unspecified by ADR-0001 |
| [0003](0003-battlefield-sprite-mapping-approval.md) | Battlefield sprite-row mapping: visual approval | Superseded by 0005 | `game-specification.md` §9.5 |
| [0004](0004-property-ownership-overlay.md) | Property art: ownership + capture overlay | Superseded by 0005 | `game-specification.md` §33.4 |
| [0005](0005-advance-wars-asset-pack.md) | Battlefield art: the Advance Wars pack and a generated sprite atlas | Accepted | `game-specification.md` §9.5, §33.4 |

---

# 6. Cross-references

- `game-specification.md` §33 — the open design blockers ADRs resolve; §36 —
  do-not-guess principle.
- `definition-of-ready.md` — a §33-blocked task becomes Ready only once its ADR
  is Accepted.
- `master-index.md` — documentation structure and priority.
- `project-manifest.md` — documentation-before-code, single source of truth.
