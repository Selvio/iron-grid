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
| `definition-of-ready.md` | Requirements a task must satisfy before implementation. |

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

> Note: `game-specification.md` already merges the researched Advance
> Wars 2 behavior with the Iron Grid adaptations. There is no separate
> Advance Wars reference document; the researched rules and their
> citations live inside the specification.

------------------------------------------------------------------------

# AI Loading Guide

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
