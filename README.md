# Arkyv Engine

![Arkyv Engine](./public/arkyv_social_card.jpg)

Arkyv Engine is an open-source text-based multi-user dungeon built with Next.js, SpacetimeDB, and AI. Players explore connected regions, create multiple characters, chat in real time, and converse with AI-driven NPCs. Administrators build the world through a visual room editor.

This repository uses **SpacetimeDB 2.0.1** for its authoritative backend. The previous hosted database, authentication, storage, and edge-function dependencies have been removed.

## Features

- Realtime multiplayer room and region chat
- Rust reducers for commands, movement, profiles, characters, and world editing
- AI-powered NPC conversations with OpenAI, Grok, or a local OpenAI-compatible model server
- Visual region, room, exit, NPC, and RPG systems editor
- Admin-authored NPC patrol routes, friendly/neutral/hostile disposition, guards, attack-on-sight behavior, combat cadence, and respawning
- Region-level safe/PvP rules, persistent wanted states, guard enforcement, and configurable fallback recovery rooms
- Multiple named initial/respawn points with fixed, priority, random, nearest, and same-region-nearest selection, plus origin/faction/death-region eligibility
- Admin-authored death penalties, finite lives, lootable corpses, ability revival, respawn delay/protection, item/gold/XP loss, resource restoration, and optional hardcore permanent character death
- Factions with configurable reputation ranges, standing thresholds, combat penalties, quest requirements, and rewards
- NPC-given quests with prerequisites, timers, failure rules, branches, follow-ups, and explore, acquire, deliver, pay, interact, escort, survive, defeat, and conversation objectives
- Admin-defined races, classes, backgrounds, levels, XP curves, HP/MP/energy/focus resources, regeneration, abilities, magic, items, equipment slots, and hero stats
- Composable ability effects for AoE, DoT/HoT, buffs, debuffs, stuns, interrupts, cleanses, teleports, revives, and summons
- Authoritative inventory limits, multi-item ring/trinket slots, weapon attack speed, durability/repair, ability costs/cooldowns/cast times, hit/crit/dodge/parry/block/resistance, threat, assists, defeat, chests, and enemy loot
- Authored currencies, NPC vendors, player item/gold transfers, banks, crafting stations, recipes, and ingredients
- Talent-gated abilities, class/origin restrictions, prerequisite abilities, profession ranks, learned recipes, item rarity/level/binding, two-handed equipment, finite bank capacity, and automatic vendor restocking
- NPC-level authored dialogue trees with repeatable one-line replies, conditional responses, doors, locks, keys, traps, room-entry triggers, and scheduled or turn-driven world simulation
- Parties with shared kill credit, assist XP, leader/round-robin/free-for-all loot, guilds, friends, blocks, private party/guild chat, and bilateral server-validated player trade
- Private whispers, player reports, mutes, bans, kicks, administrator audits, content validation, server snapshots, and portable world export/import
- Permissioned administrator roles for world, systems, quests, economy, lifecycle, moderation, and role management
- Local saved worlds backed by persistent SpacetimeDB identity tokens
- Explicit identity backup and restore through a local JSON file (the file contains tokens and must be kept secret)
- Multiple characters per saved world
- Uploaded room scenes, plus optional RetroDiffusion or local Stable Diffusion generation for rooms, NPC portraits, and inventory item art
- Self-hosted persistent state with no email/password service

## Stack

- Frontend: Next.js 15, React 19, Tailwind CSS
- Backend: SpacetimeDB 2.0.1 and a Rust WASM module
- Realtime: generated SpacetimeDB TypeScript bindings
- Identity: SpacetimeDB signed tokens stored in browser localStorage
- AI: OpenAI, Grok, or a local OpenAI-compatible server such as Ollama
- Images: direct room uploads or optional generation through RetroDiffusion or a local Stable Diffusion WebUI/Forge API, with data URLs stored in SpacetimeDB

## Prerequisites

- Node.js 18 or newer
- Rust and the `wasm32-unknown-unknown` target
- [SpacetimeDB](https://spacetimedb.com/install) CLI **2.0.1**
- An OpenAI or Grok API key, or a locally running OpenAI-compatible text model server, for dynamic NPC dialogue and editor writing tools
- A RetroDiffusion API key or a locally running Stable Diffusion WebUI/Forge API only if AI image generation is wanted; manual room uploads need neither

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

The easiest path uses one setup command and one development command.

1. Install JavaScript dependencies:

   ```bash
   npm install
   ```

2. Create `.env.local` and choose a text provider. For local Ollama:

   ```bash
   npm run setup:local -- --text=local
   ollama pull qwen2.5:7b
   ```

   For OpenAI or Grok instead:

   ```bash
   npm run setup:local -- --text=openai
   # or: npm run setup:local -- --text=grok
   ```

   Then add the selected hosted key to `.env.local`. The setup script never replaces existing secrets.

3. Optionally select local image generation:

   ```bash
   npm run setup:local -- --image=local
   ```

   This presets the AUTOMATIC1111/Forge API at `http://127.0.0.1:7860`. You can combine both local selections in one command:

   ```bash
   npm run setup:local -- --text=local --image=local
   ```

4. Verify prerequisites and configuration:

   ```bash
   npm run setup:check
   ```

5. Start everything:

   ```bash
   npm run dev:all
   ```

`dev:all` reuses or starts the local SpacetimeDB node, waits for it to become ready, publishes the `arkyv-engine` module without deleting data, regenerates TypeScript bindings, starts Ollama when local text is selected and Ollama is installed, checks optional image generation, and starts Next.js. Press `Ctrl+C` once to stop the processes it started. It does not pull large models automatically. For frontend-only restarts after a successful publish, `npm run dev:all:fast` skips publish and binding generation.

Open [http://localhost:3005](http://localhost:3005), visit **Saved Worlds**, and create a save.

The first identity connected to a fresh database becomes its administrator and can open `/admin`.

`NEXT_PUBLIC_ARKYV_SITE_MODE=runtime` enables the saved-world, play, profile, and editor routes on self-hosted domains. A project/marketing deployment that does not provide world hosting should set it to `marketing`; those routes then redirect to the self-hosting guide and the browser never opens a SpacetimeDB connection. The canonical `arkyv.org` and `www.arkyv.org` hostnames always use marketing mode.

The commands are ordinary package scripts, so pnpm users can run `pnpm setup:local -- --text=local` and `pnpm dev:all`. The repository continues to use `package-lock.json` and documents npm as its default.

### Manual multi-terminal mode

If you prefer to manage each process separately:

```bash
# Terminal 1
spacetime start

# Terminal 2
npm run spacetime:deploy

# Terminal 3
npm run dev
```

Use this mode for remote databases or a local SpacetimeDB node on a custom port. `dev:all` is deliberately limited to the default loopback node on port `3000` so it cannot accidentally manage or publish to a remote service.

### Fully local AI

All text-generation features use the same provider setting: NPC responses, room and region writing, NPC names/descriptions/personalities, and palette suggestions. The easiest local setup is [Ollama's OpenAI-compatible API](https://docs.ollama.com/api/openai-compatibility):

```bash
ollama pull qwen2.5:7b
ollama serve
```

Then use:

```env
AI_PROVIDER=local
LOCAL_AI_BASE_URL=http://127.0.0.1:11434/v1
LOCAL_AI_MODEL=qwen2.5:7b
```

`LOCAL_AI_API_KEY` is optional and can remain blank for a default Ollama installation. `LOCAL_AI_FAST_MODEL`, `LOCAL_AI_SMART_MODEL`, and `LOCAL_AI_VISION_MODEL` can override the default model for particular task classes. The same configuration works with llama.cpp, LM Studio, vLLM, LocalAI, or another server that implements OpenAI-compatible `POST /v1/chat/completions`; change the base URL and model name to match that server.

For fully local room, portrait, and item images, install [AUTOMATIC1111 Stable Diffusion WebUI](https://github.com/AUTOMATIC1111/stable-diffusion-webui) or its API-compatible [Forge variant](https://github.com/lllyasviel/stable-diffusion-webui-forge), add a checkpoint whose license fits your use, and launch the server with its API enabled:

```text
COMMANDLINE_ARGS=--api
```

On Windows, put `set COMMANDLINE_ARGS=--api` in `webui-user.bat`. Then configure Arkyv:

```env
IMAGE_PROVIDER=local
LOCAL_IMAGE_BASE_URL=http://127.0.0.1:7860
# Optional: exact checkpoint name shown in the WebUI
LOCAL_IMAGE_MODEL=
```

Arkyv calls the WebUI-compatible `POST /sdapi/v1/txt2img` endpoint and continues storing the returned PNG as a SpacetimeDB data URL. `LOCAL_IMAGE_STEPS`, `LOCAL_IMAGE_CFG_SCALE`, `LOCAL_IMAGE_SAMPLER`, `LOCAL_IMAGE_PROMPT_PREFIX`, and `LOCAL_IMAGE_NEGATIVE_PROMPT` are optional quality/style controls. If the image API uses `--api-auth`, set `LOCAL_IMAGE_API_AUTH=username:password`.

Keep local model servers bound to a trusted interface. They normally do not need to be reachable by players or by the public internet; only the Arkyv Next.js server needs access.

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
- **Back up / restore**: export or import all local saved-world labels and identity tokens from the picker. Duplicate tokens are ignored during restore.

Tokens exist only in the browser profile where they were created unless the user explicitly exports a recovery file. Anyone who obtains a token or recovery file can act as that identity, so do not publish either or include them in screenshots and logs.

Saved worlds are player identities within the same shared MUD database. Regions, rooms, exits, NPCs, and public chat are shared; profiles and character rosters are identity-owned.

## Backend architecture

The Rust module in `spacetimedb/src/lib.rs` defines these public replicated tables:

| Table | Purpose |
| --- | --- |
| `region` | Region metadata, color themes, PvP policy, and defeat recovery room |
| `room` | Locations, descriptions, images, and elevation |
| `exit` | Directed room connections |
| `npc` | Placement, personality, patrol, faction, disposition, guard policy, aggression, XP reward, defeat, respawn, and portraits |
| `profile` | One identity-owned saved-world profile |
| `character` | Identity-owned player characters |
| `command` | Private command audit and pending AI work |
| `room_message` / private `private_message` | Public room events and recipient-scoped whispers, group chat, trades, and system messages exposed only through the caller's view |
| `region_chat` | Realtime regional chat |
| `stat_definition` | Admin-defined attributes, resource roles, level growth, and regeneration |
| `object_definition` | Reusable item, container, fixture, weapon, armor, and consumable primitives, including attack speed and inventory bonuses |
| `world_object` | Concrete objects placed in rooms, containers, inventories, or equipment slots |
| `actor_stat` | Sparse character/NPC stat overrides; absent rows inherit definition defaults |
| `loot_table_entry` | Independently rolled object drops for defeated NPCs |
| `progression_config` | Maximum level, XP curve formula, stat-point awards, and inventory capacity rules |
| `actor_progression` | Persistent actor level, XP within the current level, and unspent stat points |
| `ability_definition` | Authored magic/techniques with targeting, costs, pacing, power, scaling, and mitigation |
| `ability_effect_definition` | Ordered damage, healing, status, movement, revival, summon, and area effects |
| `actor_status_effect` | Active buffs, debuffs, stuns, and periodic effects |
| `actor_ability` | Explicit ability grants in addition to automatic level unlocks |
| `actor_cooldown` | Server-authoritative readiness for basic attacks and abilities |
| `equipment_slot_definition` | Wearable slot names, order, and capacity, such as two rings or two trinkets |
| `faction_definition` | Reputation bounds, hostile/friendly thresholds, and attack/kill consequences |
| `actor_faction_reputation` | Persistent per-actor standing with each encountered faction |
| `actor_crime` | Safe-region wanted state, severity, protected faction, and expiry |
| `quest_definition` | Quest giver, turn-in NPC, prerequisites, repeatability, and XP/gold/reputation rewards |
| `quest_objective` | Ordered explore, acquire, defeat, and conversation requirements |
| `quest_item_reward` | Portable object rewards granted at a successful turn-in |
| `quest_rule` / `quest_choice` | Prerequisites, limits, timers, failure, follow-ups, and player-selected branches |
| `actor_quest` | Accepted, ready, and completed quest lifecycle per actor |
| `actor_quest_progress` | Server-observed progress for each accepted objective |
| `actor_wallet` | Persistent gold balance per actor |
| `character_option_definition` / `character_option_grant` | Race, class, and background choices with starting stats, items, abilities, gold, and rooms |
| `currency_definition` / `actor_currency` | Authored currencies and actor balances |
| `vendor_definition` / `vendor_stock` | NPC shops, prices, stock, buyback, and reputation access |
| `crafting_recipe` / `crafting_ingredient` / `crafting_batch` | Immediate crafting plus timed cooking/processing inside authored station containers |
| `admin_role_definition` / `admin_role_assignment` | Permission keys and saved-world administrator assignments |
| `spawn_point` | Named initial-entry and respawn locations with eligibility and priority |
| `world_lifecycle_config` | World-wide initial spawn, death, loss, recovery, protection, and hardcore rules |
| `actor_life_state` | Alive/dead state, respawn eligibility, selected point, death count, and protection window |
| `actor_death_record` | Permanent death audit including location, cause, mode, destination, and applied losses |
| `ability_unlock_rule` / `actor_talent_pool` | Class/origin, quest, reputation, prerequisite, exclusivity, and talent-point learning rules |
| `object_rule` / `bank_config` / `vendor_restock_rule` | Item rarity, binding, durability and equipment rules; bank access/capacity/death policy; finite-stock replenishment |
| `profession_definition` / `recipe_rule` | Crafting progression, learned recipes, rank requirements, success chance, and cooldowns |
| `dialogue_node` / `dialogue_choice` / `world_trigger` / `exit_rule` | Authored conversations, conditional actions, room events, and doors/locks/keys/traps |
| `party` / `guild` / private social and trade tables | Group membership, leadership, private relationships, offers, confirmation, and atomic exchange |
| `player_report` / private sanction, audit, snapshot tables / `content_issue` | Moderation workflow, operator history, portable snapshots, and broken-reference validation |
| `world_simulation_config` | Turn-driven or scheduled NPC/world advancement and vendor restocking policy |

Reducers are the only write path. They validate identity ownership for profiles and characters, require admin status for world editing, process deterministic commands server-side, and complete AI NPC responses returned by the stateless Next.js AI route.

The frontend consumes generated bindings in `generated/`. The client data layer in `lib/spacetimedbClient.js` reads the subscribed SpacetimeDB cache, invokes reducers for every mutation, and attaches native table insert listeners for realtime UI updates.

## RPG systems studio

Administrators can open `/admin` and use **RPG Systems Studio** to create game rules from reusable primitives. The built-in starter kit is optional and contains Health, Mana, Energy, Focus, Strength, Defense, starter abilities, wearable slots, firewood, a wooden box, a fuel-burning campfire, a sword, armor, and a healing potion. It can be installed repeatedly without overwriting edited definitions.

The studio includes these authoring surfaces:

- **Object primitives** define presentation and pixel-art imagery, portability, stacking, container capacity, fuel production/acceptance, elapsed-time burn rate, base merchant value and tradeability, wearable slot, weapon damage, armor, basic-attack cooldown, inventory-slot bonuses, stat scaling, equipment modifiers, and consumable effects.
- **Hero stats** define numeric ranges, level-one bases, per-level gains, passive regeneration, visibility, and optional Health, Mana, Energy, Focus, Combat Power, and Defense roles. Additional resources and attributes can remain fully custom.
- **Abilities & magic** defines learning, targeting, cost and cast pacing, followed by an ordered effect composer for direct/periodic damage or healing, resources, buffs/debuffs, stuns, interrupts, cleanses, area scopes, teleports, revives, and summons.
- **Combat rules** controls hit, critical damage, dodge, parry, block, armor effectiveness, school resistance, PvP scaling, global cooldown, NPC threat, and assist XP.
- **Factions & reputation** define starting/minimum/maximum reputation, hostile and friendly thresholds, reputation lost for attacks and kills, and direct actor-standing adjustments for moderation.
- **Quests** defines giver and turn-in NPCs, prerequisites, timers, death failure, completion limits, branches, follow-ups, objective sequences, consumption, and XP/gold/reputation/item rewards.
- **Character creation** defines races, classes, and backgrounds with structured stat, item, ability, gold, and starting-room grants.
- **Economy** defines currencies, NPC vendors and stock, buyback, reputation gates, immediate recipes, and timed cooking/processing recipes. A timed recipe selects its ingredient items, exact station container (campfire, furnace, oven, and so on), elapsed duration, active-station requirement, output, and the output item's base merchant value.
- **Admin roles** assigns explicit permissions to saved-world profiles. An unassigned founding administrator remains the unrestricted owner.
- **Spawn & death** creates named entry/recovery points and configures origin/faction/death-region eligibility, graph-nearest/fixed/priority/random respawn, finite lives, lootable corpses, ability revival, delays, protection, losses, restoration, quest/wanted resets, and hardcore mode.
- **Levels & inventory** defines the level cap, XP needed for level two, percentage threshold growth, stat points per level, base inventory slots, and slots gained per level. A live preview shows the first ten thresholds, and actor levels can be adjusted for testing or moderation.
- **Equipment slots** define stable wearable locations, display order, and capacity. Ordinary slots default to one object, while the starter Finger and Trinket slots accept two.
- **Placed objects** instantiate a primitive in a room, actor inventory, equipment slot, or another container. Instance state includes quantity, durability, remaining fuel, active/burning state, and a JSON extension object.
- **Enemy loot** assigns portable object definitions to NPCs with independent drop chances and minimum/maximum quantities.
- **Actor values** optionally override defaults for a particular hero or NPC. Actors without overrides automatically use the stat definition defaults.
- **Engine systems** adds visual, reducer-validated fields for talent rules, item policy, banks, restocking, professions, recipe learning, dialogue trees, door rules, triggers, and simulation, with an optional expert JSON view. It also provides content health, complete world-content snapshots/import, moderation, reports, balances, and administrator audit history. The tab and its individual systems are filtered by the current administrator role.

The XP requirement for each level starts at `base_xp` and is multiplied by `100% + growth_percent` for each subsequent level. XP is stored as progress within the current level, so changing the curve does not rewrite historical totals. When an NPC is defeated, its authored XP reward goes to the defeating player; crossing one or more thresholds applies every stat's per-level gain and reveals auto-learned abilities.

Region dialogs define whether player-versus-player combat is allowed throughout that region and a legacy recovery-room fallback used only when no eligible spawn point exists. NPC dialogs define faction membership; friendly, neutral, or hostile disposition; guard status and greeting; whether the guard protects players and NPCs; wanted duration; attack-on-sight policy; attack and respawn timing; XP reward; an ordered patrol route; and an authored dialogue tree. An authored opening line takes priority over AI for that NPC. A line with no player responses simply repeats whenever a player talks to the NPC, while responses can lead to follow-up lines or end the conversation. Patrol stops must be joined by directed exits. World behavior advances deterministically as players issue commands, and `wait` explicitly advances a turn without taking another action.

Friendly NPCs cannot be damaged, but attempting to attack them still counts as a negative action. Neutral NPCs can be attacked and retaliate. Hostile NPCs may attack automatically when configured. In safe regions, attempted player attacks and attacks on protected NPCs create a timed wanted state; a present guard responds immediately, and guards in the same region remain hostile until that state expires. Attacking or killing a non-hostile faction NPC also applies the faction's authored reputation penalty. A faction guard attacks actors whose standing is at or below its hostile threshold. Basic attacks use the equipped weapon's server-enforced cooldown. Abilities apply the same law and reputation rules before enforcing learning, valid targets, costs, cooldown/cast pacing, scaling, and mitigation. Defeated NPCs leave authored drops in the room and either remain defeated or return to their spawn room after their configured delay.

Player defeat is a server-authoritative lifecycle. The default policy remains forgiving: immediate recovery, full health/resources, and no item, gold, or XP loss. Administrators can instead delay recovery and require `respawn`, select a specific or random point, choose highest priority, or find the physically nearest eligible point by breadth-first distance across the room/exit graph. Same-region-nearest prefers the death region and falls back to world-wide nearest. Ties favor higher point priority and then stable name/id order. Spawn protection blocks NPC and player attacks and ends early when the protected player attacks.

Inventory consequences can keep everything; drop or destroy inventory only; drop or destroy inventory plus equipment; or independently roll an authored percentage for each eligible stack. Equipment can be included in percentage loss. Definitions tagged `soulbound` or `keep-on-death` ignore ordinary death-loss rules. Gold loss and XP loss are separate percentages; XP loss applies only to progress within the current level and never removes a level. Health and mana/energy/focus-style resources restore by separate percentages. Administrators may optionally reset unfinished quests and clear wanted states.

Hardcore mode permanently deletes the defeated character and its remaining actor-owned runtime state. Items already dropped by the configured death rule remain in the death room; anything still attached to the deleted character is destroyed. The saved-world identity, other characters, shared world, and immutable death record remain, allowing the player to create a replacement character. The account-level traveler profile is not deleted if it is used without a selected character.

Quest progress is derived from world events rather than client claims. Entering a room records exploration, taking or losing items refreshes possession objectives, talking to an NPC records conversation objectives, and a server-resolved NPC defeat records NPC and faction kills. Players must accept a quest before those events count and return to its configured turn-in NPC. Turn-in revalidates every objective and inventory requirement before consuming configured quest items and granting rewards.

Inventory capacity counts top-level stacks, not individual units in a stack. Level rules and equipped items can add capacity. Taking loot or unequipping a capacity-granting item is rejected when it would overflow the pack. Equipping respects the authored slot capacity and replaces the oldest occupied item only once that capacity is full.

Chests use the same primitives as every other container: place a container instance in a room, then place object instances inside it. Players can inspect the chest, take individual contents, or collect all portable contents. No separate chest-only item model is required.

Fuel burners consume fuel according to elapsed server time whenever their state is observed or changed. Fuel objects declare a fuel value and tags; burners declare accepted tags and a burn rate. For example, putting a `fuel`-tagged log into a campfire converts the stack into fuel time, and the campfire remains burning until that fuel is exhausted or it is extinguished.

Players can use the inventory/stat panel on `/play` or the corresponding terminal commands:

```text
inventory                     list carried/equipped objects and used/available slots
stats                         show level, XP, resource pools, growth, and equipment bonuses
abilities                     list learned, locked, granted, ready, and cooling-down abilities
cast <ability> at <target>    use an enemy/ally ability; self abilities omit the target
quests                        show active objectives, nearby offers, turn-in state, and gold
quest <npc>                   inspect quests offered or received by a nearby NPC
accept <quest>                accept an available quest from its nearby giver
turn in <quest>               validate and complete a quest at its turn-in NPC
choose <option>               commit an authored quest branch
reputation                    show numeric and named standing with every faction
origins                       list authored race, class, and background choices
shop / shop <vendor>          inspect nearby vendor stock and currency balance
buy <item> [quantity]         purchase server-authored vendor stock
sell <item>                   sell one carried item to a nearby vendor
repair <item>                 restore damaged equipment at a nearby vendor
bank                          inspect banked items
bank deposit/withdraw <item>  move items between inventory and bank
give <item> to <player>       transfer an inventory item to a nearby player
pay <amount> gold to <player> transfer gold to a nearby player
pay <amount> <currency> to <player> transfer any player-tradeable authored currency
party create/invite/accept/say   create and communicate with a temporary group
party loot <rule>               choose leader, round_robin, or free_for_all drops
guild create/invite/accept/say  create and communicate with a persistent guild
friend add / block / unblock    manage private social relationships
trade <player>                  open a bilateral trade; add offers, review, confirm, or cancel
report <player> <reason>        submit a private moderation report
talents / learn <ability>       inspect and spend authored talent points
respec talents                  refund talent-spent abilities
respond <choice>                continue an authored NPC dialogue
open/close/lock/unlock <exit>   interact with an authored door
recipes / craft <recipe>      inspect recipes or execute an immediate recipe
cook <recipe> in <station>    process ingredients placed inside a station over time
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
respawn                       return when the configured recovery delay has elapsed
```

All runtime mutations occur in the Rust module. The browser only sends commands and renders replicated state; it does not calculate authoritative damage, fuel, inventory ownership, or stat changes.

## Development commands

```bash
npm run setup:local                # Create/preset .env.local without replacing secrets
npm run setup:check                # Check prerequisites and configured local providers
npm run dev:all                    # Start DB, publish/generate, and run Next.js
npm run dev:all:fast               # Reuse DB and skip publish/generate
npm run dev                       # Next.js on port 3005
npm run build                     # Production build
npm run lint                      # ESLint
npm run spacetime:check           # Check the Rust module
npm run spacetime:deploy          # Publish and regenerate bindings
npm run spacetime:deploy:clean    # Wipe, publish, and regenerate bindings
npm run audit:admin               # Verify authored-system editor/reducer/export coverage
npm run smoke:rpg:compile         # Compile the isolated RPG reducer smoke test
npm run smoke:rpg                 # Run it against arkyv-engine-runtime-test
npm run smoke:cooking             # Run the focused timed-cooking contract test
npm run smoke:admin               # Run admin CRUD, placement, and dependency checks
```

The runtime smoke tests expect a fresh disposable local database. Publish the module to that name before running them, then delete the test database afterward. The broad RPG suite verifies authoritative room and door checks, private messages, parties and enforced loot ownership, bilateral trade, authored dialogue and recipe learning, timed cooking and merchant value, safe/open PvP, attack cooldowns, inventory overflow, patrol movement, XP/levels/talents, ability costs, resource regeneration, equipment capacity, hostile attacks, graph-nearest delayed recovery, bank/death policies, enemy drops, guards/crimes, faction reputation, quest paths and rewards, validation, and hardcore character deletion without touching the main `arkyv-engine` world. The focused admin suite verifies referenced-record editing, all advanced systems, nested placement integrity, and dependency-safe deletion.

The PowerShell deploy scripts invoke the installed Windows CLI at `SpacetimeDB/bin/2.0.1`. On macOS or Linux, run the equivalent commands directly:

```bash
spacetime publish --no-config -p ./spacetimedb arkyv-engine -y
spacetime generate --no-config --include-private -p ./spacetimedb -l typescript -o ./generated -y
```

## AI and generated images

Game state never passes through the AI provider. NPC conversation requests contain only the NPC prompt, recent conversation context, and the player's current message. The response is committed through an authenticated SpacetimeDB reducer. Every `/api/arkyv/*` provider request must also present the active saved-world token; middleware validates it through SpacetimeDB and applies identity-scoped request limits before a provider key can be used. Provider keys remain server-only.

Room authors can upload their own PNG, JPEG, or WebP scene directly in the room editor without configuring an image provider. RetroDiffusion and the local Stable Diffusion adapter are optional and return base64 PNGs. Arkyv stores uploaded and generated images as data URLs in `room.image_url`, `npc.portrait_url`, or `object_definition.image_url`, avoiding a separate object-storage service. Room uploads are limited to 1.5 MB and 4096×4096 pixels. The object editor requests centered 128×128 pixel-art assets so inventory cards remain readable and scale cleanly with nearest-neighbor rendering. Large or numerous images will increase replicated database size; production operators may replace this with their own object storage and persist only URLs.

## Docker

The included Dockerfile and Compose service run Next.js on [http://localhost:3005](http://localhost:3005), leaving host port `3000` available for SpacetimeDB. Run the database node separately and publish the module before starting the app container. The default browser-facing database URI is:

```env
NEXT_PUBLIC_SPACETIMEDB_URI=http://127.0.0.1:3000
```

`NEXT_PUBLIC_` values are embedded during `docker compose build`. For a hosted deployment, set this variable to the public browser-reachable SpacetimeDB endpoint and rebuild the image.

Docker Desktop users should point local providers at the host rather than at the application container:

```env
LOCAL_AI_BASE_URL=http://host.docker.internal:11434/v1
LOCAL_IMAGE_BASE_URL=http://host.docker.internal:7860
```

The Compose file maps `host.docker.internal` to the host gateway on Linux as well. Server-only provider settings are loaded from `.env.local`.

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
  src/expansion.rs       Private messaging, social/trade, talents, scripting, item/economy policy, moderation, snapshots, and validation
  deploy-local*.ps1      Publish/generate scripts
```

## Migrating an older checkout

This change introduces a new SpacetimeDB schema and does not automatically import data from an existing hosted PostgreSQL project. Preserve any old deployment until its regions, rooms, exits, NPCs, and player records have been exported. A custom one-time importer can then call admin reducers for the shared world data.

## License

MIT. See [LICENSE](./LICENSE).
