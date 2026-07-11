# Iron Grid — System Architecture

**Version:** 1.0
**Status:** Definitive baseline
**Audience:** Backend, frontend, engine, QA, AI contributors

> This document is the highest-level technical view of Iron Grid. It defines the
> system layers, package boundaries and the authoritative action lifecycle.
>
> It **references** rather than restates lower-level sources. The engine contract
> is canonical in `rules.yaml` (`engine_contract`); the domain entities are
> canonical in `domain-model.md`; game values are canonical in the `02-data`
> YAML files. This document must never redefine them.

---

# 1. Purpose and scope

This document answers: *how do the pieces of Iron Grid fit together, and which
piece is allowed to depend on which?*

It covers:

- Architectural principles that constrain every layer.
- The four system layers and their dependency direction.
- The target package layout of the pnpm workspace.
- The pure game engine and its role.
- The game-data pipeline.
- The authoritative request/action lifecycle.
- The determinism, replay and information-security boundaries.
- The mapping from layer to concrete technology.
- The migration from the current single-package scaffold.

It does **not** cover:

- Entity shapes and relationships → see `domain-model.md`.
- React/Phaser implementation detail → see `frontend.md`.
- API routes, engine integration and auth detail → see `backend.md`.
- PostgreSQL/Drizzle schema and persistence → see `database.md`.
- Gameplay behavior → see `game-specification.md`.

---

# 2. Architectural principles

These consolidate the Architecture Rules of `project-manifest.md` and the
Deterministic Engine Contract of `game-specification.md` §30. They are binding.

| Principle | Meaning |
|---|---|
| Server-authoritative | Clients never decide game rules. The server validates every action. |
| Pure deterministic engine | The engine is a pure function of `(state, action, gameData, randomSource)`. Same input always yields the same output. |
| Engine independence | The engine depends on nothing framework-specific: not React, Phaser, Next.js, the database, Drizzle, Auth.js or Resend. |
| Data-driven | Game logic never hardcodes unit, terrain or commander names. All values come from structured data. |
| Event-based replay | Every confirmed action produces append-only replay events sufficient to reproduce it exactly. |
| Server-side visibility | Visibility is calculated server-side; the client only ever receives a filtered view. |

The rest of this document explains how the layer and package structure makes
these principles physically enforceable rather than merely aspirational.

---

# 3. System layers

Iron Grid has four layers. Dependencies point **outer-to-inner only**: an outer
layer may depend on an inner one, never the reverse. The engine sits at the
center and depends on nothing but game data.

```text
┌─────────────────────────────────────────────────────────────┐
│  Frontend            React UI + Phaser rendering             │
│  (app/)              non-authoritative previews only         │
└───────────────────────────────┬─────────────────────────────┘
                                 │ HTTP (actions ↑ / filtered views ↓)
┌───────────────────────────────┴─────────────────────────────┐
│  Backend             Next.js API routes, persistence,        │
│  (app/api, app/…)    auth, notifications, concurrency guard  │
└───────────────────────────────┬─────────────────────────────┘
                                 │ calls pure functions
┌───────────────────────────────┴─────────────────────────────┐
│  game-engine         validate / apply / project / preview    │
│  (packages/)         pure TypeScript, no framework deps      │
└───────────────────────────────┬─────────────────────────────┘
                                 │ consumes typed GameData
┌───────────────────────────────┴─────────────────────────────┐
│  game-data           loads + validates docs/02-data YAML     │
│  (packages/)         → typed, versioned GameData             │
└──────────────────────────────────────────────────────────────┘
```

**Dependency rule:** nothing points *into* the engine except `GameData`. The
engine does not import from the backend, the frontend or the data loader's I/O
code — it receives already-parsed data as an argument. This is what makes the
engine testable in isolation and deterministic.

---

# 4. Package layout (target)

The repository is a **pnpm workspace**. The Next.js application remains at the
repository root; the engine and data live as real workspace packages under
`packages/`.

```text
iron-grid/
├── app/                     Next.js (root): pages, API routes, React UI, Phaser
├── packages/
│   ├── game-engine/         pure TypeScript engine — framework deps forbidden
│   └── game-data/           loads + Zod-validates docs/02-data → typed GameData
├── docs/
│   └── 02-data/*.yaml       canonical game data (source of truth — does not move)
├── pnpm-workspace.yaml      packages: ['packages/*']
├── package.json             the web application (root)
└── ...
```

| Package | Responsibility | Allowed dependencies | Forbidden dependencies |
|---|---|---|---|
| `packages/game-engine` | Pure rules: validation, state transitions, projection, previews. | TypeScript standard library only. | `next`, `react`, `phaser`, `drizzle-orm`, `pg`, `@neondatabase/serverless`, `resend`, `@auth/core` (see `rules.yaml` → `engine_contract.forbidden_dependencies`). |
| `packages/game-data` | Read the canonical YAML, validate it (Zod), expose a typed `GameData` object with an explicit version. | `zod`, a YAML parser (`js-yaml` or equivalent). May depend on `game-engine` types. | Framework/runtime deps of backend and frontend. |
| `app/` (root) | Next.js web app: API routes (backend) + React/Phaser (frontend). | Full stack: Next, React, Phaser, Drizzle, Auth.js, Resend. | May **not** be imported by `game-engine` or `game-data`. |

Because `game-engine` is a separate package with its own `package.json`, the
forbidden dependencies are **physically impossible to import** — they are not in
its dependency tree. This enforces the independence principle at the tooling
level, not just by convention.

---

# 5. The pure engine

The engine is the heart of the system. Its full contract is **canonical in
`rules.yaml` → `engine_contract`**; this section summarizes it and must not
diverge from it.

**Required public functions** (`rules.yaml` → `engine_contract.required_public_functions`):

- `validateAction`
- `applyAction`
- `projectStateForPlayer`
- `calculateLegalActions`
- `calculateMovementRange`
- `calculateVisibility`
- `calculateCombatPreview`
- `resolveStartOfTurn`
- `evaluateVictory`

**Core API shape** (from `game-specification.md` §30):

```ts
validateAction(state, action, gameData): ValidationResult

applyAction(state, action, gameData, randomSource): {
  nextState,
  events,
  stateVersion
}

projectStateForPlayer(state, playerId, gameData): PlayerView
```

**Purity** (`rules.yaml` → `engine_contract.purity`): state is treated as
immutable, there is no external I/O, no wall-clock access, and randomness comes
only from an injected deterministic source.

**Determinism** (`rules.yaml` → `engine_contract.determinism`): the same input
always produces the same output; an active match is locked to the game-data
version it started with; replay never rerolls randomness.

Entity shapes referenced by these signatures (`state`, `action`, `events`,
`PlayerView`) are defined in `domain-model.md`, not here.

---

# 6. Game-data pipeline

The engine is data-driven and receives `gameData` as an argument. That object is
produced by the `game-data` package from the canonical YAML:

```text
docs/02-data/*.yaml          (canonical source of truth — never duplicated)
        │
        │  read + Zod validation (build time)
        ▼
packages/game-data           → typed GameData { version, units, weapons, terrain, … }
        │
        ▼
packages/game-engine         ← receives gameData on every call
```

- **Validation** happens at build time and covers schema, unique IDs,
  cross-references and the checks enumerated in `game-specification.md` §31.1
  (e.g. complete damage coverage, valid movement types, valid map dimensions).
- **Version pinning:** `GameData` carries an explicit version. Each active match
  records the version it started with; a later balance change must never silently
  mutate active matches (`game-specification.md` §31.2). The pinning is *stored*
  and *enforced* by the backend/persistence layer — see `backend.md` and
  `database.md` — but the versioned `GameData` originates here.

The YAML stays in `docs/02-data` because *documentation is the product*: the data
files are simultaneously the human-readable spec and the machine-read source. The
`game-data` package reads them; it does not copy them.

---

# 7. Request / action lifecycle

Every gameplay mutation follows one authoritative sequence, owned by the backend
and executed against the engine (`game-specification.md` §24.1). No client may
treat its own simulation as authoritative.

```text
client submits action + expectedStateVersion
        │
        ▼
backend: authenticate + authorize match membership
        │
        ▼
backend: optimistic-concurrency guard  ── stale? ──►  reject (typed conflict)
        │  (verify active player + version)
        ▼
engine: validateAction(state, action, gameData)  ── invalid? ──►  reject
        │
        ▼
engine: applyAction(state, action, gameData, randomSource)
        │        (randomSource seeded deterministically by the server)
        ▼
backend: persist next state + append events + assign sequence number
        │
        ▼
engine: evaluateVictory(nextState)
        │
        ▼
engine: projectStateForPlayer(nextState, viewerId)   (once per player)
        │
        ▼
backend: return player-filtered view to each client
```

**Optimistic concurrency** (`game-specification.md` §25): every action carries an
`expectedStateVersion`. The server locks or transactionally guards the match,
verifies the active player and the version, applies the action, increments the
version and rejects stale actions with a typed conflict. Two concurrent actions
can never both commit.

---

# 8. Determinism and replay boundary

Randomness is confined to a single, server-owned mechanism so that replays are
exact (`game-specification.md` §12.6, §24.5):

- The **server owns the match seed**. The engine never reads a global RNG or the
  wall clock; it consumes only the injected `randomSource`.
- Each random-consuming event uses an explicit deterministic sequence index.
- The chosen luck result is **persisted in the combat event**.
- **Replaying an event never rerolls** — it reads the stored result.
- Clients never generate authoritative randomness.

Consequently, given the same starting state, pinned game-data version, seed and
action sequence, the entire match is reproducible. Replay events carry enough
resolved data (final path, luck rolls, damage, HP before/after) to render without
recalculation.

---

# 9. Information security and state projection

The server is authoritative over what each player is allowed to know. This is an
architecture rule; the gameplay rules that decide what is visible live in
`game-specification.md` §18 and are not restated here.

- Player-specific projection (`projectStateForPlayer`) runs in the backend,
  **before** any data leaves the server. The server never ships full hidden state
  and trusts the client to conceal it (`game-specification.md` §18.1, §29).
- Whatever visibility and hidden-information rules a match uses are applied here,
  server-side — including always-hidden information such as loaded cargo identity
  and submerged submarine positions.
- Replay events are filtered per player: a player sees only what they could
  observe at the moment each event occurred.
- Phaser never hides information — it only renders the already-filtered view it
  receives. Any preview the client computes for responsiveness is
  non-authoritative and is re-checked by the server.

---

# 10. Technology mapping

| Layer | Package/location | Technology | Present in scaffold? |
|---|---|---|---|
| Engine | `packages/game-engine` | Pure TypeScript | To add |
| Data | `packages/game-data` | TypeScript + Zod + YAML parser | To add |
| Backend | `app/api`, server code | Next.js API routes, Drizzle ORM, Auth.js, Resend | Next present; Drizzle/Auth.js/Resend to add |
| Frontend | `app/` | React 19, Phaser | React present; Phaser to add |
| Persistence | (backend) | PostgreSQL 17 (Neon), Drizzle | To add |
| Deployment | — | Vercel + Neon | — |

"To add" items are documented here as the target; installing them is a code-phase
task, not part of this documentation work.

---

# 11. Migration from the current scaffold

The repository is currently a single Next.js app at the root (Next 16.2.10, React
19.2.4), with `pnpm-workspace.yaml` containing only `allowBuilds` and no
`packages/` directory. The target layout is reached by:

1. Add `packages: ['packages/*']` to `pnpm-workspace.yaml`.
2. Create `packages/game-engine` with its own `package.json` and **no** framework
   dependencies (enforcing `engine_contract.forbidden_dependencies`).
3. Create `packages/game-data` depending on `zod` + a YAML parser, reading from
   `docs/02-data`.
4. Reference both from the root app via the `workspace:*` protocol.
5. Add the remaining runtime dependencies (Drizzle, Phaser, Auth.js, Resend) to
   the root app as their features are implemented.

This section is **descriptive**. The migration is executed in dedicated code
phases under the Definition of Ready, not by documentation changes.

---

# 12. Cross-references

- `domain-model.md` — canonical entities and relationships used by the engine.
- `frontend.md` — Next.js + Phaser rendering and interaction.
- `backend.md` — API routes, engine integration, replay, auth, concurrency.
- `database.md` — PostgreSQL + Drizzle persistence, append-only events, version
  pinning.
- `rules.yaml` → `engine_contract` — canonical engine functions, purity and
  determinism rules.
- `game-specification.md` §30 (engine contract), §31 (structured data),
  §24–§25 (replay and concurrency), §18/§29 (visibility and security).
