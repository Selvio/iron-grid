# Iron Grid — Definition of Ready

**Version:** 1.0
**Status:** Definitive baseline
**Audience:** Product, engine, backend, frontend, data, QA, AI contributors

> This document defines the **Definition of Ready (DoR)**: the gate a task must
> pass *before* implementation starts. It is the entry gate; the **Definition of
> Done** (`game-specification.md` §34, `testing.md` §11, `coding-standards.md`
> §12) is the exit gate. A task is *ready* when there is nothing left to decide —
> only to build.
>
> It **references** rather than restates the rules each check enforces. The
> canonical sources are `project-manifest.md` (principles, AI Development Rules),
> `game-specification.md` (behavior, §33 blockers, §36 do-not-guess) and
> `architecture.md` (layer placement).

---

# 1. Purpose and scope

This document answers: *may I start implementing this task yet?*

The project rule is **Documentation Before Code** (`project-manifest.md`): no
feature is implemented until its behavior is fully documented. The Definition of
Ready makes that rule checkable. A task that fails any check below is **blocked**,
not started — the fix is to update documentation first, never to infer behavior
(`game-specification.md` §36).

It does **not** cover:

- Whether a finished change is shippable → Definition of Done
  (`game-specification.md` §34, `testing.md` §11, `coding-standards.md` §12).
- The rules themselves → `game-specification.md`, `rules.yaml`.
- Milestone ordering → `roadmap.md`.

---

# 2. Ready vs Done

| | Definition of Ready | Definition of Done |
|---|---|---|
| **Question** | May I *start*? | Am I *finished*? |
| **When** | Before implementation | After implementation |
| **Fails when** | Behavior undocumented, data missing, a blocker is open | A test fails, a rule is unspecified, docs drifted |
| **Canonical in** | this document | `game-specification.md` §34 |

The two gates are complementary and both binding. Passing DoR does not lower the
Done bar; passing Done does not retroactively excuse a task that was started
un-ready.

---

# 3. The readiness checklist

A task is Ready only when **every** applicable item holds:

1. **Behavior is specified.** The rule the task implements is written in
   `game-specification.md` (or the relevant canonical doc), with no gap the
   implementer would have to guess across (`project-manifest.md` → AI Development
   Rules; `game-specification.md` §36).
2. **Structured data exists and validates.** Every numeric/game value the task
   needs is present in `docs/02-data/*.yaml` and passes build-time validation
   (`game-specification.md` §31.1, `testing.md` §4). Game logic never hardcodes
   values (`coding-standards.md` §4).
3. **No open design blocker applies.** The task is not gated by an unresolved
   blocker in `game-specification.md` §33 (commander effects, day-limit scoring,
   special-terrain/property art, listed edge cases). If it is, the blocker is
   resolved first — typically via an ADR (`decisions/README.md`) — before the
   task becomes Ready.
4. **Domain entities are defined.** Every entity, field and relationship the task
   touches exists in `domain-model.md` with the canonical name
   (`coding-standards.md` §4).
5. **Layer placement is clear.** It is unambiguous which layer/package owns the
   work and which dependencies are allowed (`architecture.md` §3–§4). Engine work
   respects purity and the forbidden-dependency list
   (`rules.yaml` → `engine_contract`).
6. **Acceptance is identifiable.** The behavior maps to at least one acceptance
   scenario (`game-specification.md` §35) or `required_validation_tests`
   category, so "done" is verifiable (`testing.md` §5, §10).
7. **Security/concurrency/versioning implications are understood** where relevant:
   server authority, fog projection, optimistic concurrency and data-version
   pinning are accounted for, not discovered mid-implementation
   (`architecture.md` §8–§9, `backend.md` §8, §11).
8. **Cross-references resolve.** The documents the task relies on exist and their
   cited sections are valid (`master-index.md` → Rules).

Items that genuinely do not apply to a task (e.g. a pure-frontend rendering task
has no new structured data) are marked N/A, not silently skipped.

---

# 4. When a task is *not* Ready

If any check fails, the task is **blocked**. The correct response is fixed by the
Final Principle (`game-specification.md` §36):

```text
Do not guess.
Do not copy a later Advance Wars entry.
Do not hardcode a convenient interpretation.
Mark the task blocked and update the specification first.
```

Blocked-because-of-a-design-decision (§33) is resolved by recording an ADR
(`decisions/README.md`); blocked-because-of-a-documentation-gap is resolved by
updating the canonical document, after which the task is re-evaluated against
this checklist.

---

# 5. Who applies it and when

- **Every contributor — human or AI — applies the checklist before writing code**
  (`project-manifest.md` → AI Development Rules #5: *Respect Definition of Ready
  before implementation*).
- **AI agents** additionally follow the loading discipline of
  `project-manifest.md`: read the index, load only the required documents, and
  stop and request documentation updates when a check fails rather than inventing
  behavior.

---

# 6. Cross-references

- `project-manifest.md` — Documentation Before Code, AI Development Rules,
  Architecture Rules.
- `game-specification.md` — §31.1 (data validation), §33 (open design blockers),
  §34 (Definition of Done), §35 (acceptance scenarios), §36 (do-not-guess).
- `architecture.md` — §3–§4 layers and package boundaries, §8–§9 determinism and
  information security.
- `domain-model.md` — canonical entities the task must reference.
- `coding-standards.md` — §4 no hardcoded game data, §12 code-change Done bar.
- `testing.md` — §4 data validation, §5 engine tests, §10 acceptance scenarios,
  §11 Functional Definition of Done.
- `decisions/README.md` — ADR format for resolving §33 blockers.
