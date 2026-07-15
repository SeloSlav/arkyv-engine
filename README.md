# Arkyv Engine

![Arkyv Engine](./public/arkyv_social_card.jpg)

Arkyv Engine is an open-source text-based multi-user dungeon built with Next.js, SpacetimeDB, and AI. Players explore connected regions, create multiple characters, chat in real time, and converse with AI-driven NPCs. Administrators build the world through a visual room editor.

This repository uses **SpacetimeDB 2.0.1** for its authoritative backend. The previous hosted database, authentication, storage, and edge-function dependencies have been removed.

## Features

- Realtime multiplayer room and region chat
- Rust reducers for commands, movement, profiles, characters, and world editing
- AI-powered NPC conversations with OpenAI or Grok
- Visual region, room, exit, NPC, and RPG systems editor
- Admin-authored NPC patrol routes, friendly/neutral/hostile disposition, attack-on-sight behavior, combat cadence, and respawning
- Region-level safe/PvP rules with configurable player recovery rooms
- Admin-defined levels, XP curve, HP/MP/energy/focus resources, regeneration, abilities, magic, items, equipment slots, and hero stats
- Authoritative inventory limits, multi-item ring/trinket slots, weapon attack speed, ability costs/cooldowns, combat, defeat, chests, and enemy loot
- Local saved worlds backed by persistent SpacetimeDB identity tokens
- Multiple characters per saved world
- Optional RetroDiffusion room scenes, NPC portraits, and inventory item art
- Self-hosted persistent state with no email/password service

## Stack

- Frontend: Next.js 15, React 19, Tailwind CSS
- Backend: SpacetimeDB 2.0.1 and a Rust WASM module
- Realtime: generated SpacetimeDB TypeScript bindings
- Identity: SpacetimeDB signed tokens stored in browser localStorage
- AI: OpenAI or Grok
- Image generation: RetroDiffusion, with generated data URLs stored in SpacetimeDB

## Prerequisites

- Node.js 18 or newer
- Rust and the `wasm32-unknown-unknown` target
- [SpacetimeDB](https://spacetimedb.com/install) CLI **2.0.1**
- An OpenAI or Grok API key for dynamic NPC dialogue
- A RetroDiffusion API key only if image generation is needed

Install and select the pinned SpacetimeDB release:

```bash
spacetime version install 2.0.1
spacetime version use 2.0.1
rustup target add wasm32-unknown-unknown
```

Verify the active version:

```bash
spacetime --version
```

The output should report `spacetimedb tool version 2.0.1`.

## Local setup

1. Install JavaScript dependencies:

   ```bash
   npm install
   ```

2. Copy the environment template:

   ```bash
   cp .env.example .env.local
   ```

3. Configure `.env.local`:

   ```env
   NEXT_PUBLIC_ARKYV_SITE_MODE=runtime
   NEXT_PUBLIC_SPACETIMEDB_URI=http://127.0.0.1:3000
   NEXT_PUBLIC_SPACETIMEDB_DB_NAME=arkyv-engine

   AI_PROVIDER=openai
   OPENAI_API_KEY=sk-your-key
   # GROK_API_KEY=your-key

   # Optional
   RETRO_DIFFUSION_API_KEY=your-key
   ```

4. Start the standalone SpacetimeDB node and leave it running:

   ```bash
   spacetime start
   ```

5. Publish the module and regenerate TypeScript bindings:

   ```bash
   npm run spacetime:deploy
   ```

   This publishes database `arkyv-engine` from `spacetimedb/` and generates the client in `generated/`.

6. Start Next.js:

   ```bash
   npm run dev
   ```

7. Open [http://localhost:3005](http://localhost:3005), visit **Saved Worlds**, and create a save.

The first identity connected to a fresh database becomes its administrator and can open `/admin`.

`NEXT_PUBLIC_ARKYV_SITE_MODE=runtime` enables the saved-world, play, profile, and editor routes on self-hosted domains. A project/marketing deployment that does not provide world hosting should set it to `marketing`; those routes then redirect to the self-hosting guide and the browser never opens a SpacetimeDB connection. The canonical `arkyv.org` and `www.arkyv.org` hostnames always use marketing mode.

### Clean local reset

To intentionally wipe all local Arkyv data and republish the module:

```bash
npm run spacetime:deploy:clean
```

This operation deletes all saved profiles, characters, rooms, chats, and generated content from database `arkyv-engine`. Browser tokens remain in localStorage until their saves are deleted or browser storage is cleared.

## Saved worlds

Arkyv does not use email addresses or passwords. A saved world is a local label for one SpacetimeDB identity:

- **Create**: connect without a token; SpacetimeDB issues a new signed token and identity.
- **Log out**: disconnect and return to the saved-world picker without deleting anything.
- **Switch**: reconnect with another saved token and load that identity's profile and characters.
- **Delete**: call the identity-authorized deletion reducer, remove the profile, characters, private commands, and actor-owned chat/messages, then remove its token from localStorage.

Tokens exist only in the browser profile where they were created. Back up browser storage if a local identity must be preserved. Anyone who obtains a token can act as that identity, so do not publish tokens or include them in screenshots and logs.

Saved worlds are player identities within the same shared MUD database. Regions, rooms, exits, NPCs, and public chat are shared; profiles and character rosters are identity-owned.

## Backend architecture

The Rust module in `spacetimedb/src/lib.rs` defines these public replicated tables:

| Table | Purpose |
| --- | --- |
| `region` | Region metadata, color themes, PvP policy, and defeat recovery room |
| `room` | Locations, descriptions, images, and elevation |
| `exit` | Directed room connections |
| `npc` | Placement, personality, patrol, disposition, aggression, XP reward, defeat, respawn, and portraits |
| `profile` | One identity-owned saved-world profile |
| `character` | Identity-owned player characters |
| `command` | Private command audit and pending AI work |
| `room_message` | Realtime terminal messages |
| `region_chat` | Realtime regional chat |
| `stat_definition` | Admin-defined attributes, resource roles, level growth, and regeneration |
| `object_definition` | Reusable item, container, fixture, weapon, armor, and consumable primitives, including attack speed and inventory bonuses |
| `world_object` | Concrete objects placed in rooms, containers, inventories, or equipment slots |
| `actor_stat` | Sparse character/NPC stat overrides; absent rows inherit definition defaults |
| `loot_table_entry` | Independently rolled object drops for defeated NPCs |
| `progression_config` | Maximum level, XP curve formula, stat-point awards, and inventory capacity rules |
| `actor_progression` | Persistent actor level, XP within the current level, and unspent stat points |
| `ability_definition` | Authored magic/techniques with targeting, costs, pacing, power, scaling, and mitigation |
| `actor_ability` | Explicit ability grants in addition to automatic level unlocks |
| `actor_cooldown` | Server-authoritative readiness for basic attacks and abilities |
| `equipment_slot_definition` | Wearable slot names, order, and capacity, such as two rings or two trinkets |

Reducers are the only write path. They validate identity ownership for profiles and characters, require admin status for world editing, process deterministic commands server-side, and complete AI NPC responses returned by the stateless Next.js AI route.

The frontend consumes generated bindings in `generated/`. The client data layer in `lib/spacetimedbClient.js` reads the subscribed SpacetimeDB cache, invokes reducers for every mutation, and attaches native table insert listeners for realtime UI updates.

## RPG systems studio

Administrators can open `/admin` and use **RPG Systems Studio** to create game rules from reusable primitives. The built-in starter kit is optional and contains Health, Mana, Energy, Focus, Strength, Defense, starter abilities, wearable slots, firewood, a wooden box, a fuel-burning campfire, a sword, armor, and a healing potion. It can be installed repeatedly without overwriting edited definitions.

The studio has eight authoring surfaces:

- **Object primitives** define presentation and pixel-art imagery, portability, stacking, container capacity, fuel production/acceptance, elapsed-time burn rate, wearable slot, weapon damage, armor, basic-attack cooldown, inventory-slot bonuses, stat scaling, equipment modifiers, and consumable effects.
- **Hero stats** define numeric ranges, level-one bases, per-level gains, passive regeneration, visibility, and optional Health, Mana, Energy, Focus, Combat Power, and Defense roles. Additional resources and attributes can remain fully custom.
- **Abilities & magic** define damage, healing, or resource restoration; enemy/self/ally targeting; resource stat and cost; cooldown and cast pacing; power range; stat scaling; affected stat; armor mitigation; required level; automatic learning; and explicit actor grants.
- **Levels & inventory** defines the level cap, XP needed for level two, percentage threshold growth, stat points per level, base inventory slots, and slots gained per level. A live preview shows the first ten thresholds, and actor levels can be adjusted for testing or moderation.
- **Equipment slots** define stable wearable locations, display order, and capacity. Ordinary slots default to one object, while the starter Finger and Trinket slots accept two.
- **Placed objects** instantiate a primitive in a room, actor inventory, equipment slot, or another container. Instance state includes quantity, durability, remaining fuel, active/burning state, and a JSON extension object.
- **Enemy loot** assigns portable object definitions to NPCs with independent drop chances and minimum/maximum quantities.
- **Actor values** optionally override defaults for a particular hero or NPC. Actors without overrides automatically use the stat definition defaults.

The XP requirement for each level starts at `base_xp` and is multiplied by `100% + growth_percent` for each subsequent level. XP is stored as progress within the current level, so changing the curve does not rewrite historical totals. When an NPC is defeated, its authored XP reward goes to the defeating player; crossing one or more thresholds applies every stat's per-level gain and reveals auto-learned abilities.

Region dialogs define whether player-versus-player combat is allowed throughout that region and where defeated players recover. NPC dialogs define whether an NPC is friendly, neutral, or hostile; whether a hostile NPC attacks on sight; its attack and respawn timing; XP reward; and an ordered patrol route. Patrol stops must be joined by directed exits. World behavior advances deterministically as players issue commands, and `wait` explicitly advances a turn without taking another action.

Friendly NPCs cannot be attacked. Neutral NPCs can be attacked and retaliate. Hostile NPCs may attack automatically when configured. Basic attacks use the equipped weapon's server-enforced cooldown. Abilities separately enforce learning, valid targets, costs, cooldown/cast pacing, scaling, and mitigation. On defeat, players keep their inventory, recover their level-scaled base health, and move to the region recovery room. Defeated NPCs leave authored drops in the room and either remain defeated or return to their spawn room after their configured delay.

Inventory capacity counts top-level stacks, not individual units in a stack. Level rules and equipped items can add capacity. Taking loot or unequipping a capacity-granting item is rejected when it would overflow the pack. Equipping respects the authored slot capacity and replaces the oldest occupied item only once that capacity is full.

Chests use the same primitives as every other container: place a container instance in a room, then place object instances inside it. Players can inspect the chest, take individual contents, or collect all portable contents. No separate chest-only item model is required.

Fuel burners consume fuel according to elapsed server time whenever their state is observed or changed. Fuel objects declare a fuel value and tags; burners declare accepted tags and a burn rate. For example, putting a `fuel`-tagged log into a campfire converts the stack into fuel time, and the campfire remains burning until that fuel is exhausted or it is extinguished.

Players can use the inventory/stat panel on `/play` or the corresponding terminal commands:

```text
inventory                     list carried/equipped objects and used/available slots
stats                         show level, XP, resource pools, growth, and equipment bonuses
abilities                     list learned, locked, granted, ready, and cooling-down abilities
cast <ability> at <target>    use an enemy/ally ability; self abilities omit the target
take <item>                   move a portable room object into inventory
drop <item>                   place a carried object in the current room
examine <object>              inspect state, fuel, or container contents
open <container>              inspect a chest or other container
loot                          list portable room drops
loot <container>              inspect lootable container contents
put <item> in <container>     store an item or add accepted fuel
take <item> from <container>  retrieve a contained item
take all from <container>     collect every portable contained item
equip <item>                  equip it in its admin-defined slot
unequip <item-or-slot>        return equipped gear to inventory
light <object>                start a fueled burner
extinguish <object>           stop burning without discarding fuel
use <item>                    apply its configured stat effect
attack <target>               resolve configured stats, weapon, armor, and attack speed
combat                        show zone PvP rules and visible enemies
rest                          restore configured HP/MP/energy/focus pools when safe
wait                          pass a turn and advance NPC behavior
flee <direction>              leave combat through an authored exit
```

All runtime mutations occur in the Rust module. The browser only sends commands and renders replicated state; it does not calculate authoritative damage, fuel, inventory ownership, or stat changes.

## Development commands

```bash
npm run dev                       # Next.js on port 3005
npm run build                     # Production build
npm run lint                      # ESLint
npm run spacetime:check           # Check the Rust module
npm run spacetime:deploy          # Publish and regenerate bindings
npm run spacetime:deploy:clean    # Wipe, publish, and regenerate bindings
npm run smoke:rpg:compile         # Compile the isolated RPG reducer smoke test
npm run smoke:rpg                 # Run it against arkyv-engine-runtime-test
```

The smoke test expects a fresh local database named `arkyv-engine-runtime-test`. Publish the module to that name before running it, then delete the test database afterward. It verifies authoritative room checks, safe/open PvP, attack cooldowns, inventory overflow, patrol movement, XP and level growth, ability costs, resource regeneration, two-item equipment slots, hostile attacks, player recovery, and enemy drops without touching the main `arkyv-engine` world.

The PowerShell deploy scripts invoke the installed Windows CLI at `SpacetimeDB/bin/2.0.1`. On macOS or Linux, run the equivalent commands directly:

```bash
spacetime publish --no-config -p ./spacetimedb arkyv-engine -y
spacetime generate --no-config --include-private -p ./spacetimedb -l typescript -o ./generated -y
```

## AI and generated images

Game state never passes through the AI provider. NPC conversation requests contain only the NPC prompt, recent conversation context, and the player's current message. The response is committed through an authenticated SpacetimeDB reducer.

RetroDiffusion returns base64 PNGs. Arkyv stores them as data URLs in `room.image_url`, `npc.portrait_url`, or `object_definition.image_url`, avoiding a separate object-storage service. The object editor requests centered 128×128 pixel-art assets so inventory cards remain readable and scale cleanly with nearest-neighbor rendering. Large or numerous images will increase replicated database size; production operators may replace this with their own object storage and persist only URLs.

## Docker

The included Dockerfile and Compose service run Next.js on [http://localhost:3005](http://localhost:3005), leaving host port `3000` available for SpacetimeDB. Run the database node separately and publish the module before starting the app container. The default browser-facing database URI is:

```env
NEXT_PUBLIC_SPACETIMEDB_URI=http://127.0.0.1:3000
```

`NEXT_PUBLIC_` values are embedded during `docker compose build`. For a hosted deployment, set this variable to the public browser-reachable SpacetimeDB endpoint and rebuild the image.

## Project structure

```text
components/              React game, chat, admin, and saved-world UI
contexts/AuthContext.js  Local saved-world lifecycle and active identity
generated/               SpacetimeDB 2.0.1 generated TypeScript bindings
lib/
  savedWorlds.js         localStorage registry for named identity tokens
  spacetimedbClient.js   connection, subscriptions, and query adapter
pages/                   Next.js pages and stateless AI/image routes
scripts/                 Isolated end-to-end RPG runtime smoke test
spacetimedb/
  Cargo.toml             Rust module pinned to SpacetimeDB 2.0.1
  src/lib.rs             Tables, authorization, reducers, and seed data
  deploy-local*.ps1      Publish/generate scripts
```

## Migrating an older checkout

This change introduces a new SpacetimeDB schema and does not automatically import data from an existing hosted PostgreSQL project. Preserve any old deployment until its regions, rooms, exits, NPCs, and player records have been exported. A custom one-time importer can then call admin reducers for the shared world data.

## License

MIT. See [LICENSE](./LICENSE).
