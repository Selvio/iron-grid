# Iron Grid - Project Manifest

**Version:** 1.0\
**Status:** Draft (Living Document)\
**Audience:** All contributors (human and AI) — the canonical top-level charter

------------------------------------------------------------------------

# Vision

Iron Grid is a modern web-based tactical strategy game inspired by
**Advance Wars 2: Black Hole Rising**.

The goal is to faithfully reproduce the gameplay mechanics of Advance
Wars while introducing:

-   Modern web technology
-   Asynchronous online multiplayer
-   Cross-device persistence
-   A completely data-driven architecture
-   AI-assisted development

The MVP focuses exclusively on **private asynchronous 1v1 matches**.

------------------------------------------------------------------------

# Core Principles

## Documentation Before Code

No feature may be implemented until its behavior is fully documented.

## Single Source of Truth

Every rule exists in only one place.

-   `game-specification.md` defines gameplay behavior. It merges the
    researched Advance Wars 2 mechanics with the deliberate Iron Grid
    adaptations, and cites its research sources inline.
-   YAML files define game data (units, weapons, terrain, properties,
    commanders, damage, maps, engine rules).
-   Architecture documents define the technical implementation.

## Data-Driven Engine

Game logic must never depend on hardcoded unit names.

All gameplay comes from structured data.

## Server Authoritative

Clients never decide game rules.

The server validates every action.

## Deterministic Simulation

The same input must always produce the same output.

This guarantees replay consistency.

------------------------------------------------------------------------

# MVP Scope

This is the **canonical** MVP scope. Other documents summarize it but
must not contradict it. Detailed functional exclusions are enumerated in
`game-specification.md` §32.

Included:

-   Private asynchronous 1v1 matches
-   Magic-link authentication
-   Four commanders (one per faction)
-   Official maps
-   Replay of opponent turn
-   Fog of war
-   Email notifications
-   Full Advance Wars 2 mechanics supported by available assets

Excluded:

-   Campaign
-   AI opponents
-   Ranked matchmaking
-   Public lobbies
-   Spectator mode
-   Weather
-   Custom maps
-   Map editor
-   Additional units not present in Advance Wars 2

------------------------------------------------------------------------

# Technology Stack

Frontend

-   Next.js
-   TypeScript
-   Phaser

Backend

-   Next.js API
-   PostgreSQL 17
-   Drizzle ORM
-   Auth.js
-   Resend

Deployment

-   Neon PostgreSQL
-   Vercel

------------------------------------------------------------------------

# Development Workflow

Research

↓

Documentation

↓

Review

↓

Implementation

↓

Testing

↓

Release

------------------------------------------------------------------------

# Documentation Rules

-   Never duplicate information. Every rule lives in exactly one place.
-   Gameplay behavior belongs in `game-specification.md`, including the
    Advance Wars 2 research and its citations.
-   Game data belongs in YAML files.
-   Code is never the source of truth.

------------------------------------------------------------------------

# AI Development Rules

Every AI agent must:

1.  Read the project index before starting.
2.  Load only the documentation required for the task.
3.  Never invent undocumented behavior.
4.  Stop and request documentation updates when requirements are
    missing.
5.  Respect Definition of Ready before implementation.

------------------------------------------------------------------------

# Architecture Rules

-   The game engine is independent of Phaser.
-   The game engine is independent of React.
-   The game engine is independent of the database.
-   Replay is event-based.
-   Fog of war is calculated on the server.
-   The engine is fully data-driven.

------------------------------------------------------------------------

# Project Motto

> Documentation is the product. Code is the implementation.

------------------------------------------------------------------------

# Cross-references

-   `game-specification.md` — single source of truth for gameplay behavior.
-   `architecture.md` — system layers and package boundaries.
-   `definition-of-ready.md` — the gate every feature must pass before
    implementation (AI Development Rule #5).
-   `master-index.md` — full documentation map, priority order and loading guide.
