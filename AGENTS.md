# Arkyv Engine agent guide

Use this file as the compact operating map for the repository. Read `README.md` for the complete product and operator documentation, then inspect the files involved in the requested behavior before editing. Prefer repository evidence and version-matched official documentation over generic framework assumptions.

## What this repository is

Arkyv Engine is a self-hosted multiplayer text-world engine:

- Next.js 15 Pages Router, React 19, and Tailwind CSS provide the landing site, saved-world flow, player terminal, and visual admin studio.
- SpacetimeDB 2.0.1 runs the authoritative world state as a Rust WASM module.
- `generated/` contains TypeScript bindings generated from the Rust module.
- OpenAI or Grok can produce NPC dialogue. RetroDiffusion provides room, NPC, and item images through its API.
- Browser localStorage holds named SpacetimeDB identity tokens. Shared rooms, actors, objects, and rules live in the database.

The public `arkyv.org` deployment is a marketing site and does not host worlds. A playable installation must run its own Next.js app, SpacetimeDB node, and published Arkyv module.

## Clone and run locally

Prerequisites: Node.js 18 or newer, Rust, the `wasm32-unknown-unknown` target, and the SpacetimeDB CLI pinned to 2.0.1.

```bash
git clone https://github.com/SeloSlav/arkyv-engine.git
cd arkyv-engine
npm install
cp .env.example .env.local
spacetime version install 2.0.1
spacetime version use 2.0.1
rustup target add wasm32-unknown-unknown
```

On Windows PowerShell, use `Copy-Item .env.example .env.local` instead of `cp` if needed.

Keep these three processes separate:

```bash
# Terminal 1: local database node
spacetime start

# Terminal 2: publish the Rust module and regenerate bindings
npm run spacetime:deploy

# Terminal 3: Next.js on http://localhost:3005
npm run dev
```

Open `http://localhost:3005`, create a saved world, and then open `/admin`. The first identity connected to a fresh database becomes the administrator.

The minimum `.env.local` for a local runtime is:

```env
NEXT_PUBLIC_ARKYV_SITE_MODE=runtime
NEXT_PUBLIC_SPACETIMEDB_URI=http://127.0.0.1:3000
NEXT_PUBLIC_SPACETIMEDB_DB_NAME=arkyv-engine
```

NPC dialogue also needs `AI_PROVIDER=openai` with `OPENAI_API_KEY`, or `AI_PROVIDER=grok` with `GROK_API_KEY`. Generated art needs `RETRO_DIFFUSION_API_KEY`. Never expose provider keys through a `NEXT_PUBLIC_` variable or commit `.env.local`.

## Customize a world without changing code

Use the product UI first when the request is about a particular world rather than the engine itself:

1. Create or select a saved world on the local runtime.
2. Open `/admin` and create regions, rooms, directional exits, NPCs, room scenes, patrols, and world rules.
3. Use RPG Systems Studio for stats, resources, levels, abilities, items, equipment, factions, quests, loot, spawn points, and death rules.
4. Open `/play` to test movement, dialogue, combat, inventory, multiplayer state, and authored content.
5. Iterate in `/admin`; editor changes are immediately part of the same live world.

Do not hard-code one operator's rooms or characters into frontend components. The shared world belongs in SpacetimeDB and should be authored through reducers, normally through the admin UI.

## Where to make engine changes

| Area | Start here |
| --- | --- |
| Public landing page | `pages/index.js`, `styles/global.css` |
| Saved-world identity flow | `contexts/AuthContext.js`, `lib/savedWorlds.js` |
| Visual world editor | `pages/admin.js` |
| RPG rules editor | `components/admin/RpgSystemsEditor.js` |
| Player runtime | `pages/play.js`, `components/ArkyvTerminal.js` |
| Client connection and reducers | `lib/spacetimedbClient.js` |
| Schema, authorization, and game rules | `spacetimedb/src/lib.rs` |
| AI and RetroDiffusion adapters | `pages/api/arkyv/` |
| Generated client types | `generated/` (regenerate, do not hand-edit) |
| Runtime versus marketing routing | `lib/siteMode.js`, `middleware.js` |

This is a Pages Router application. Do not introduce an App Router subtree or migrate routing unless the user explicitly asks for it.

## SpacetimeDB contract

- Keep the module and JavaScript SDK pinned to SpacetimeDB 2.0.1 unless a version upgrade is the task.
- Reducers are the only write path. The browser can request actions and render replicated state, but must not calculate authoritative combat, inventory, progression, fuel, quest, or identity outcomes.
- For a schema or reducer change, edit Rust first, run `npm run spacetime:check`, publish the module, and regenerate `generated/` with `npm run spacetime:deploy`.
- Generated bindings must stay aligned with `spacetimedb/src/lib.rs`; never patch generated tables as a shortcut.
- `npm run spacetime:deploy:clean` destroys the local world. Never run it unless the user explicitly asks to wipe all saved data.

## Working rules

- Inspect `git status` before editing and preserve unrelated user changes in a dirty worktree.
- Make the smallest coherent change and follow the existing component and reducer patterns.
- Never print, commit, or include SpacetimeDB identity tokens or provider secrets in screenshots, fixtures, or logs.
- Keep marketing mode disconnected from SpacetimeDB. Runtime-only routes on the canonical marketing host must continue to redirect to setup guidance.
- When external behavior matters, retrieve documentation matching Next.js 15.5.9 or SpacetimeDB 2.0.1. Do not silently apply current-major examples to these pinned versions.
- Test observable user behavior. Do not assert implementation details when a reducer, UI state, or rendered result can be checked directly.

## Validation

Run checks in proportion to the change:

```bash
npm run lint
npm run build
npm run spacetime:check
```

For a focused frontend edit, lint the changed files first, then run the production build. For Rust or generated-binding changes, run the Rust check before deploying. The RPG smoke scripts require a separately published fresh database named `arkyv-engine-runtime-test`; follow `README.md` and never point destructive test setup at the main `arkyv-engine` world.

Before handing off, report what changed, which checks ran, and any check that could not run because a local service or API key was unavailable.
