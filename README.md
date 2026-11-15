# Sunburst Hollow: browser proof of concept

A cozy, non-violent meerkat colony sim shown as an ant-farm cutaway. Design spec: [`doc/spec.txt`](doc/spec.txt).
This PoC covers **all four spec milestones**:
- **M1 + M2:** the cutaway burrow, digging, Tier 1 rooms, the day/night loop, foraging, the Martial Eagle and the Cape Cobra, Sentry alarms, bolt-holes and the Sand-Kick Mob.
- **M3:** the 4-season weather loop, Sniff & Dig, accessory crafting, and three 15-second room mini-games.
- **M4:** Tier 2/3 grand rooms, spatial synergies, room themes, neighbouring packs that visit to trade, and the seasonal Burrow Pageant.

## Run it

```sh
npm install
npm run dev        # http://localhost:5173  (add ?seed=42 for a fixed map)
npm test           # simulation unit tests (Vitest)
npm run build      # static build in dist/
```

> On this machine Node lives in `/opt/homebrew/bin`, which isn't on the default shell PATH: `export PATH=/opt/homebrew/bin:$PATH`.

## How to play

| Action | Mouse / keyboard | Touch |
| --- | --- | --- |
| Look around | drag (Look tool), right-drag, WASD/arrows | one-finger drag |
| Zoom | scroll wheel, Q / Z | pinch |
| Assign a job | drag a meerkat: **surface** = Forager, **dirt** = Digger, **perch** = Sentry. Or tap a roster row to open its card | same |
| Dig tunnels | ⛏️ Dig tool, drag across dirt | same |
| Rooms | 🏠 Build ▸ pick a room, then click to place | drag the ghost, release to place |
| Mini-games / crafting | tap a built room marked **▶** (Perch, Cellar, Sun-Parlor) or the Workshop | same |
| Roles & gear | tap a meerkat in the 🐾 Mob list to open its card | same |
| Room card (themes, play, craft) | tap any built room | same |
| Trade | tap a visiting scout (💬 bubble) | same |
| Pageant preview, synergies, blueprints | 🏆 button in the top bar | same |
| Sniff & Dig | 👃 button (Golden Sun and the Long Dry only) | same |
| Bolt-hole | 🕳️ tool, tap the ground | same |
| Evacuate | 📯 Alarm button or `Space` | Alarm button |
| Rally against a cobra | tap the revealed cobra | same |
| Speed | `1` `2` `3`, `P` to pause | top-right buttons |

Dev-only keys (also enabled with `?debug`):
- `E` spawns an eagle and `C` spawns a cobra.
- `N` skips to the next phase and `X` jumps to the next season.
- `M` gives 10 🌾, 10 💎, 5 ⭐ and a full pantry.
- `G` runs a Burrow Pageant now and `V` sends a visiting scout.

In devtools, `window.world` is the live simulation and `window.game` is the Phaser game.

### Seasons (Milestone 3)
A season lasts `CFG.SEASON_DAYS` days. The spec says 10; the PoC uses 5 so a playtest sees the whole year.

| Season | Soil | Food | Weather |
| --- | --- | --- | --- |
| 🌧️ Emerald Rains | +25% dig | berries regrow fast | Flash downpour: every bush refills, surface is slower |
| ☀️ Golden Sun | normal | melons spawn far out, hidden grubs | Heatwave 12–3 PM: **Sweaty** (−30% speed, double tiring) unless wearing a 👒 Sun Hat |
| 🌪️ Dust Winds | normal | scarce food, 💎 gem nodes | Haboob: Sentry radar −65% and **Dusty** unless wearing 🥽 Amber Goggles |
| ❄️ The Long Dry | −30% dig | bushes bare, no regrowth, hidden grubs | Dawn frost: **Chilly** until meerkats huddle in a sunbeam |

**Materials:** 🌾 grass comes from grass tufts. 💎 gems turn up while digging (more often in clay), from Dust Winds gem nodes, and from Horizon Spotter.

**Gear** is crafted at the 🧵 Tinkering Workshop:

| Gear | Cost | Effect |
| --- | --- | --- |
| 👒 Sun Hat | 4🌾 | No heatwave Sweaty |
| 🌰 Acorn-Cap Helmet | 2🌾 1💎 | +25% digging |
| 🥽 Amber Goggles | 1🌾 2💎 | See through haboobs, never Dusty |
| 🎒 Gourd Pack | 3🌾 2💎 | Carry 6 items instead of 4 |

**Mini-games** can be played once per room per day. They last 15 seconds, and a **Perfect!** round doubles the reward.

| Mini-game | Room | How to play | Reward |
| --- | --- | --- | --- |
| 🔭 Horizon Spotter | Perch | Sweep binoculars through the heat haze and tag what you see | Berry patches: food. Buried loot: gems. Shadows: +25% radar today |
| 🧺 Trail-Mix Sort | Cellar | Drag falling snacks into matching baskets and flick dung beetles away | Food |
| 🪮 Burr & Beetle Brush | Sun-Parlor | Rub off the dust and pop the tail burrs | Cures Dusty/Burr-tangled, Groomed (+10% speed), morale |

### Grand Burrow & Pageants (Milestone 4)

**Rooms**

| Room | Tier | Cost | Effect |
| --- | --- | --- | --- |
| 🎭 Storytelling Amphitheater | 2 | 8🍓 2💎 | +2 ⭐ Prestige every night (+3 with 5+ meerkats) |
| 🏊 Aquifer Lagoon | 3 (6⭐) | 10🍓 5💎 | Everyone wakes **Oasis Refreshed** (immune to heatwave Sweaty), dust washes off overnight, and idle meerkats swim in gourd floaties. +1 Architecture star |
| 🍄 Crystal Conservatory | 3 (10⭐) | 8🍓 7💎 | +1 food every 20 s, every season (even the Long Dry) |

Tier 3 blueprints unlock once total ⭐ Prestige reaches the threshold. A Gold ribbon also grants one outright.

**Synergies** (rooms within 2 tiles of each other):
- **Quick Drop-Off:** Cellar next to the entrance.
- **Resort Spa:** Lagoon + Sun-Parlor. Everyone wakes Groomed and gets +2 morale a day.
- **Artisan Glow:** Workshop + Conservatory. Glowing lanterns and +20% digging.

*Inspired Youth* (Playroom + Amphitheater) waits on the Pups system.

**Themes:** every room can be Sunlit Sandstone, Rootwood Manor, or Crystal Cavern (unlocked by a Bronze ribbon). Matching themes score Cozy Aesthetics.

**Neighbours:** the Dune Ridge Mob and Acacia Hollow Mob send a scout most days from day 2. Each scout offers a trade suited to the season. Accepting improves friendship, and friendlier mobs offer better rates.

**Burrow Pageant:** runs at dusk on the last day of each season. Three Elders give 1–5 stars in each of four categories:

| Category | What it judges |
| --- | --- |
| 🏛️ Architectural Grandeur | Room variety, dig depth, synergies, a lagoon |
| 🕯️ Cozy Aesthetics | Theme cohesion, tidy tunnels, lanterns and the fountain |
| 🍽️ Hospitality & Feast | Kinds of snack in the pantry this season, best mini-game score |
| 💛 Colony Spirit | Morale, clean fur, accessories |

Rewards build on each other, so a higher ribbon also gets the lower ones:

| Ribbon | Stars | Rewards |
| --- | --- | --- |
| 🥉 Bronze | 8–11 | Crystal theme and 2 rare berry bushes |
| 🥈 Silver | 12–16 | Sandstone fountain statue and better trades |
| 🏅 Gold | 17–20 | A Tier 3 Wonder Blueprint and a specialist meerkat who arrives with gear |

Every pageant also grants +1 to +8 ⭐ Prestige.

### Loop
- **Morning:** foragers huddle in the sun at the entrance.
- **Afternoon:** surface run.
- **Dusk:** everyone hauls snacks home.
- **Night:** supper (1 food each), then sleep. The clock runs at 4× once everyone is asleep.

High morale brings a wandering meerkat to join each morning, up to 6. Nothing ever dies. Failures are slapstick setbacks:
- An eagle snatches a backpack and the meerkat is dizzy for 5 s.
- A lone meerkat facing a cobra leaps in fright and sprints home.

## Code layout

```
src/sim/        Pure TypeScript simulation, no Phaser. Unit-tested and portable.
  World.ts        owns state, tick(dt), player commands, events for UI/audio
  MeerkatBrain.ts FSM + decision making (roles, needs, alarm reactions)
  Grid.ts, Pathfinder.ts (BFS), Clock.ts, AlarmEventBus.ts, JobQueue.ts, Rooms.ts, Surface.ts
  Seasons.ts, Gear.ts  season table, weather, craftable gear
  Pageant.ts, Neighbors.ts  pageant scoring, neighbour packs and trades
  predators/      Eagle.ts, Cobra.ts
src/minigames/  HorizonSpotter, TrailMixSort, BurrBrush (hosted by scenes/MiniGameScene.ts)
src/render/     Phaser drawing: procedural tiles, sky, weather, meerkat sprites, WebAudio sfx
src/scenes/     Boot, Game (camera, input, rendering), Hud (toolbar, roster, cards, goals, toasts), MiniGame, Pageant
src/config.ts   every balance number in one place
```

The sim runs at a fixed 30 Hz step, separate from rendering. Speed controls only change how many steps run per frame.

## Road to iPhone

The build uses relative asset paths (`base: './'`), has touch-first input and a responsive layout, so it can be wrapped with **Capacitor**:

```sh
npm i @capacitor/core @capacitor/ios && npm i -D @capacitor/cli
npx cap init "Sunburst Hollow" com.example.sunbursthollow --web-dir dist
npm run build && npx cap add ios && npx cap open ios   # needs Xcode
```

Before shipping, the iOS build will need:
- safe-area insets for the notch and home bar
- a landscape orientation lock
- haptics for alarms
- save/load
- real art and audio in place of the code-drawn placeholders
