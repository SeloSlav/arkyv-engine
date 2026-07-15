# Arkyv Engine

![Arkyv Engine](./public/arkyv_social_card.jpg)

Arkyv Engine is an open-source text-based multi-user dungeon built with Next.js, SpacetimeDB, and AI. Players explore connected regions, create multiple characters, chat in real time, and converse with AI-driven NPCs. Administrators build the world through a visual room editor.

This repository uses **SpacetimeDB 2.0.1** for its authoritative backend. The previous hosted database, authentication, storage, and edge-function dependencies have been removed.

## Features

- Realtime multiplayer room and region chat
- Rust reducers for commands, movement, profiles, characters, and world editing
- AI-powered NPC conversations with OpenAI or Grok
- Visual region, room, exit, NPC, and RPG systems editor
- Admin-defined items, containers, fuel burners, weapons, armor, consumables, equipment slots, and hero stats
- Authoritative inventory, equipment, fuel consumption, stat effects, and combat reducers
- Local saved worlds backed by persistent SpacetimeDB identity tokens
- Multiple characters per saved world
- Optional RetroDiffusion room images and NPC portraits
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
| `region` | Region metadata and color themes |
| `room` | Locations, descriptions, images, and elevation |
| `exit` | Directed room connections |
| `npc` | NPC placement, personality, behavior, and portraits |
| `profile` | One identity-owned saved-world profile |
| `character` | Identity-owned player characters |
| `command` | Private command audit and pending AI work |
| `room_message` | Realtime terminal messages |
| `region_chat` | Realtime regional chat |
| `stat_definition` | Admin-defined hero attributes and optional health/power/defense roles |
| `object_definition` | Reusable item, container, fixture, weapon, armor, and consumable primitives |
| `world_object` | Concrete objects placed in rooms, containers, inventories, or equipment slots |
| `actor_stat` | Sparse character/NPC stat overrides; absent rows inherit definition defaults |

Reducers are the only write path. They validate identity ownership for profiles and characters, require admin status for world editing, process deterministic commands server-side, and complete AI NPC responses returned by the stateless Next.js AI route.

The frontend consumes generated bindings in `generated/`. The client data layer in `lib/spacetimedbClient.js` reads the subscribed SpacetimeDB cache, invokes reducers for every mutation, and attaches native table insert listeners for realtime UI updates.

## RPG systems studio

Administrators can open `/admin` and use **RPG Systems Studio** to create game rules from reusable primitives. The built-in starter kit is optional and contains Health, Strength, Defense, firewood, a wooden box, a fuel-burning campfire, a sword, armor, and a healing potion. It can be installed repeatedly without overwriting edited definitions.

The studio has four authoring surfaces:

- **Object primitives** define presentation, portability, stacking, container capacity, fuel production/acceptance, elapsed-time burn rate, equipment slot, weapon and armor values, stat scaling, equipment modifiers, and consumable stat effects.
- **Hero stats** define numeric ranges, defaults, visibility, and optional system roles. Combat discovers Health, Combat Power, and Defense through these roles, so display names and additional custom stats remain game-specific.
- **Placed objects** instantiate a primitive in a room, actor inventory, equipment slot, or another container. Instance state includes quantity, durability, remaining fuel, active/burning state, and a JSON extension object.
- **Actor values** optionally override defaults for a particular hero or NPC. Actors without overrides automatically use the stat definition defaults.

Fuel burners consume fuel according to elapsed server time whenever their state is observed or changed. Fuel objects declare a fuel value and tags; burners declare accepted tags and a burn rate. For example, putting a `fuel`-tagged log into a campfire converts the stack into fuel time, and the campfire remains burning until that fuel is exhausted or it is extinguished.

Players can use the inventory/stat panel on `/play` or the corresponding terminal commands:

```text
inventory                     list carried and equipped objects
stats                         show visible hero stats and equipment bonuses
take <item>                   move a portable room object into inventory
drop <item>                   place a carried object in the current room
examine <object>              inspect state, fuel, or container contents
put <item> in <container>     store an item or add accepted fuel
take <item> from <container>  retrieve a contained item
equip <item>                  equip it in its admin-defined slot
unequip <item-or-slot>        return equipped gear to inventory
light <object>                start a fueled burner
extinguish <object>           stop burning without discarding fuel
use <item>                    apply its configured stat effect
attack <target>               resolve configured stats, weapon, and armor
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
```

The PowerShell deploy scripts invoke the installed Windows CLI at `SpacetimeDB/bin/2.0.1`. On macOS or Linux, run the equivalent commands directly:

```bash
spacetime publish --no-config -p ./spacetimedb arkyv-engine -y
spacetime generate --no-config --include-private -p ./spacetimedb -l typescript -o ./generated -y
```

## AI and generated images

Game state never passes through the AI provider. NPC conversation requests contain only the NPC prompt, recent conversation context, and the player's current message. The response is committed through an authenticated SpacetimeDB reducer.

RetroDiffusion returns base64 PNGs. Arkyv stores them as data URLs in `room.image_url` or `npc.portrait_url`, avoiding a separate object-storage service. Large or numerous images will increase replicated database size; production operators may replace this with their own object storage and persist only URLs.

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
spacetimedb/
  Cargo.toml             Rust module pinned to SpacetimeDB 2.0.1
  src/lib.rs             Tables, authorization, reducers, and seed data
  deploy-local*.ps1      Publish/generate scripts
```

## Migrating an older checkout

This change introduces a new SpacetimeDB schema and does not automatically import data from an existing hosted PostgreSQL project. Preserve any old deployment until its regions, rooms, exits, NPCs, and player records have been exported. A custom one-time importer can then call admin reducers for the shared world data.

## License

MIT. See [LICENSE](./LICENSE).
