# Iron Grid - Project Overview

**Version:** 1.0

## Executive Summary

Iron Grid is a modern web adaptation inspired by **Advance Wars 2: Black
Hole Rising**. The objective is to faithfully reproduce the original
tactical gameplay while delivering an asynchronous online multiplayer
experience for the web.

Iron Grid is **not** a remake. It has its own identity, commanders,
factions, branding and UI, while preserving the core mechanics of
Advance Wars 2 wherever possible.

------------------------------------------------------------------------

# MVP Goals

-   Faithful AW2 gameplay.
-   Private asynchronous 1v1 matches.
-   Server-authoritative simulation.
-   Deterministic replay system.
-   Modern web experience.
-   Fully data-driven game engine.
-   AI-first development process.

------------------------------------------------------------------------

# Gameplay Scope

The MVP delivers private asynchronous 1v1 matches with four factions,
official maps, fog of war, ground/air/naval combat, opponent-turn
replay, turn timers with Claim Victory, magic-link authentication and
email notifications.

It excludes campaign, AI opponents, ranked ladder, spectator mode,
public matchmaking, weather, map editor and user-generated content.

> The **canonical** MVP scope lives in `project-manifest.md` (MVP
> Scope). Detailed functional exclusions are enumerated in
> `game-specification.md` §32. This summary must not contradict them.

------------------------------------------------------------------------

# Design Philosophy

-   Reproduce gameplay, not copyrighted content.
-   Prefer deterministic systems.
-   Every mechanic must be documented before implementation.
-   Keep the engine independent from rendering and persistence.
-   Favor structured configuration over hardcoded logic.

------------------------------------------------------------------------

# Technical Vision

Frontend - Next.js - Phaser - TypeScript

Backend - Next.js API - PostgreSQL - Drizzle ORM - Auth.js - Resend

Engine - Standalone package - Pure TypeScript - No framework
dependencies - Fully data-driven

------------------------------------------------------------------------

# Multiplayer Flow

1.  Player creates a private match.
2.  Select official map.
3.  Configure fog and turn timer.
4.  Invite opponent by link or code.
5.  Randomly determine first picker.
6.  Commander selection.
7.  Both players confirm Ready.
8.  Randomly determine first turn.
9.  Match begins.

------------------------------------------------------------------------

# Success Criteria

-   Gameplay feels nearly identical to Advance Wars 2.
-   Every match is reproducible through replay events.
-   No gameplay logic exists only in the client.
-   Documentation remains the primary source of truth.
