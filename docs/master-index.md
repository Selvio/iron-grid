# Iron Grid — Master Index

**Version:** 2.0
**Status:** Living document
**Location:** `docs/master-index.md` (repository entry point)

## Purpose

This document is the entry point for every human and AI contributor.
Before implementing any feature, identify the task category below and
load only the required documents.

This index describes the **actual** documentation layout on disk. If a
document is added, removed or moved, this index must be updated in the
same change.

------------------------------------------------------------------------

# Documentation Structure

## 00-overview

| Document | Purpose |
|---|---|
| `project-manifest.md` | Project vision, principles, MVP scope (canonical), workflow and rules. |
| `project-overview.md` | High-level executive summary for onboarding. |

## 01-specification

| Document | Purpose |
|---|---|
| `game-specification.md` | **Single source of truth for gameplay behavior.** Merges researched Advance Wars 2 mechanics with the deliberate Iron Grid adaptations. |
| `assets-inventory.md` | Complete inventory and mapping of the Pangea Wars asset pack. |

## 02-data

| File | Purpose |
|---|---|
| `units.yaml` | Unit definitions. |
| `weapons.yaml` | Weapon definitions. |
| `damage-chart.yaml` | Base damage matrix. |
| `terrain.yaml` | Logical terrain definitions. |
| `properties.yaml` | Property definitions (capture, income, repair, production). |
| `commanders.yaml` | Commander and faction schema (design-blocked). |
| `maps.yaml` | Official map schema and validation contract. |
| `rules.yaml` | Canonical engine-level rules (match flow, combat, RNG, concurrency). |

## 03-architecture

| Document | Purpose |
|---|---|
| `architecture.md` | System architecture and package boundaries. |
| `domain-model.md` | **Canonical, technology-agnostic domain entities and relationships** (Match, Player, Unit, Property, Event, match state). The engine state shape and the database schema both derive from this. |
| `frontend.md` | Next.js + Phaser implementation. |
| `backend.md` | APIs, engine integration, replay, auth, concurrency. |
| `database.md` | How the domain model maps to PostgreSQL 17 + Drizzle: tables, migrations, append-only event log, data-version pinning, optimistic concurrency. |

## 04-development

| Document | Purpose |
|---|---|
| `coding-standards.md` | Coding conventions. |
| `testing.md` | Testing strategy and acceptance scenarios. |
| `roadmap.md` | Milestones and execution order. |
| `definition-of-ready.md` | The gate a task must pass **before** implementation starts (entry gate; the Definition of Done is the exit gate). |
| `milestones/` | Per-milestone execution-detail: the ticket breakdown for a milestone, produced when it starts (e.g. `milestones/m0-foundations.md`). |

## 05-design

| Document | Purpose |
|---|---|
| `design-reference.md` | **Illustrative** UI/UX reference: pointer to the Claude Design mockup of the main flows and the battlefield, its design system and coverage. Non-authoritative — subordinate to `game-specification.md` and `frontend.md`. |

## decisions

Architecture Decision Records (ADRs). Each ADR captures one functional
or technical decision, including the resolution of an open design
blocker from `game-specification.md` §33. See `decisions/README.md` for
the format.

------------------------------------------------------------------------

# Document Priority

If two documents conflict, the higher entry wins:

1.  `project-manifest.md`
2.  `game-specification.md`
3.  YAML data files (`02-data`)
4.  Architecture documents (`03-architecture`)
5.  Source code

Source code is never the source of truth.

> The `05-design` reference is **illustrative only** and sits outside this
> precedence order: it never overrides behavior or architecture. If the design
> mockup and a higher document disagree, the document wins and the design is
> updated to match.

> Note: `game-specification.md` already merges the researched Advance
> Wars 2 behavior with the Iron Grid adaptations. There is no separate
> Advance Wars reference document; the researched rules and their
> citations live inside the specification.

------------------------------------------------------------------------

# AI Loading Guide

> Any task that produces code also loads `architecture.md` (layer and package
> boundaries), `coding-standards.md` (conventions) and `testing.md` (test
> strategy and the Definition of Done), and must pass `definition-of-ready.md`
> before implementation starts. They are omitted from the per-task lists below to
> avoid repetition, but they are binding on every implementation task.

## Gameplay task

Load:
- `project-manifest.md`
- `game-specification.md`
- `rules.yaml`
- relevant YAML data files

## Frontend task

Load:
- `project-manifest.md`
- `frontend.md`
- `game-specification.md`
- `design-reference.md` (illustrative UI/UX reference)
- relevant YAML data files

## Backend task

Load:
- `project-manifest.md`
- `backend.md`
- `domain-model.md`
- `database.md`
- `rules.yaml`
- relevant YAML data files

## Database task

Load:
- `project-manifest.md`
- `domain-model.md`
- `database.md`
- `rules.yaml`

## Art task

Load:
- `assets-inventory.md`
- `game-specification.md`

------------------------------------------------------------------------

# Rules

-   Never invent missing behavior. Mark the task blocked and update the
    specification first.
-   Never duplicate documented rules. Every rule lives in exactly one
    place.
-   Prefer structured YAML data over prose for numeric game values.
-   Update documentation before code.
-   Every feature must satisfy the Definition of Ready.
