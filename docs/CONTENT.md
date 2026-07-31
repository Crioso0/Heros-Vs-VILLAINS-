# Roster and worlds

This is a personal fan project, so every character carries two names:

| Field | Example | Shown when |
| --- | --- | --- |
| `alias` | Superman | `NAME_MODE.real` is on — the default |
| `name` | Paragon (Superman) | `NAME_MODE.real` is off |

The toggle lives in the Codex ("REAL NAMES" / "CODENAMES") and is saved with
your progress. Ids, art, stats and balance are identical either way — only the
label changes, so switching costs nothing and breaks nothing.

The `name` set is the one that is entirely ours: original names, original
emblems, original procedurally-drawn art, homaging the *archetype* — the flying
brick, the ring-slinger, the one in the cowl — which is how superhero fiction has
always worked. It is there so the project has a set of labels that are safe to
put in front of anyone, if it ever goes further than a personal build.
Emblems are abstract glyphs from primitives in `src/render/emblems.ts`.

Tables below list the codename first and the homage in brackets.

## Heroes

Each hero has a Leaf Mode ultimate: drop a Leaf on them and they cut loose for a
few seconds. Fill the Overdrive meter instead and **every hero on the board fires
their ultimate at once.**

### Producers

| Hero | Cost | Role | Leaf Mode |
| --- | --- | --- | --- |
| Solaris (Firestorm) | 50 | Generates 25 solar | **Solar Flare** — +150 solar instantly |
| Sunforge (Sunspot) | 150 | Generates 50 solar | **Twin Corona** — +300 solar instantly |

### Defenders

| Hero | Cost | Role | Leaf Mode |
| --- | --- | --- | --- |
| Bulwark (Luke Cage) | 50 | 4,000 HP wall | **Unbreakable** — invulnerable 10s, knocks back on contact |
| Adamant (The Thing) | 125 | 8,000 HP, blocks vaulters | **Quake Slam** — heavy lane damage and a full-lane shove |

### Shooters

| Hero | Cost | Role | Leaf Mode |
| --- | --- | --- | --- |
| Bluebolt (Blue Beetle) | 100 | Plasma bolts | **Plasma Barrage** — 40 rapid bolts |
| Frostbane (Iceman) | 175 | Slowing shots | **Absolute Zero** — freezes the whole board for 6s |
| Trickshot (Green Arrow) | 175 | Three-lane arrows | **Arrow Storm** — 60 arrows across the board |
| Websnap (Spider-Man) | 175 | Slowing webs, hits air | **Full Spread** — roots the whole lane for 7s |
| Voltaic (Cyborg) | 200 | Staggering sparks, hits air | **Sonic Cannon** — sustained lane blast |
| Vanguard (Captain America) | 200 | Ricocheting shield, 5 lanes | **Ricochet Rally** — the shield crosses every lane, three times |
| Nightfall (Batman) | 225 | Homing batarangs, hits air | **Smoke and Steel** — smoke blinds the lane, then a barrage |
| Ironclad (Iron Man) | 275 | Splash missiles, hits air | **Unibeam** — a sweeping beam across three lanes |
| Emerald Warden (Green Lantern) | 275 | Hard-light constructs | **Hard-Light Havoc** — a giant fist clears the lane and leaves a wall |
| Tidecaller (Aquaman) | 225 | Knockback water | **Tidal Wave** — sweeps the lane back to the horizon |
| Paragon (Superman) | 325 | Lane-piercing heat beam | **Heat Vision** — burns the lane clean, then freezes it |
| Tempest (Thor) | 325 | Chain lightning | **Thunderstorm** — twelve strikes anywhere on the board |

### Melee

| Hero | Cost | Role | Leaf Mode |
| --- | --- | --- | --- |
| Razorclaw (Wolverine) | 150 | Fast bleeding claws | **Berserker Spin** — shreds everything within two cells for 5s |
| Blur (The Flash) | 200 | Very fast, long reach | **Sonic Rush** — six passes down the lane |
| Rampage (Hulk) | 250 | One enormous hit, long digest | **Thunderclap** — board-wide damage and shove |
| Astraea (Wonder Woman) | 275 | High HP, slowing lasso | **Lasso Sweep** — clears the lane and drags survivors back |

### Support & utility

| Hero | Cost | Role | Leaf Mode |
| --- | --- | --- | --- |
| Lodestone (Magneto) | 100 | Strips armour and shields | **Magnetic Purge** — strips the whole board and fires it back |
| Arcanum (Doctor Strange) | 250 | Knockback and stun | **Banishment** — throws everything back to the spawn line |
| Tripwire (Robin) | 100 | Walkable hazard | **Spike Surge** — spikes erupt across the lane |

### Instants

| Hero | Cost | Effect |
| --- | --- | --- |
| Fuse (Nitro) | 150 | 3×3 detonation |
| Inferno (Human Torch) | 175 | Burns an entire lane |

Instants resolve on placement and have no Leaf Mode.

## Villains

| Villain | Threat | Trick |
| --- | --- | --- |
| Street Goon | 1 | Walks forward. That is the whole plan. |
| Riot Goon | 2 | Helmet armour |
| Armoured Enforcer | 4 | Heavy plating |
| Shieldbearer | 4 | Frontal shield — splash and melee go through it, bullets do not |
| Grapnel Goon | 3 | Vaults your first defender. A tall defender stops it. |
| Jester Goon (Joker Goon) | 3 | Explodes when destroyed |
| Redshift (Reverse-Flash) | 4 | Sprints |
| Aerial Raider (Vulture) | 5 | Flies over the ground line entirely |
| Tunneler (Mole Man) | 5 | Burrows and surfaces behind your defence |
| Coldsnap (Mr. Freeze) | 6 | Freezes a hero in its lane every few seconds |
| Marionette (Puppet Master) | 6 | Summons reinforcements |
| Plasma Gunner (Deadshot) | 6 | Shoots from outside melee range |
| Juggernought (Juggernaut) | 12 | Destroys the defender it reaches outright |
| Colossus Prime (Rhino) | 16 | Crushes, then throws a Sidekick over your line |
| Colossus Omega (Abomination) | 52 | The Gamma Flats boss: plated, and it still throws Sidekicks |

### Bosses

| Boss | World |
| --- | --- |
| The Grin (The Joker) | The Grim City |
| The Magnate (Lex Luthor) | The Bright City |
| Dread Tyrant (Sinestro) | Emerald Reach |
| Colossus Omega (Abomination) | Gamma Flats |

## Worlds

| World | Look | Rule |
| --- | --- | --- |
| **The Grim City** | Midnight rooftops, rain, a searchlight on the clouds, gargoyles | No sun falls. Every point of solar comes from a producer. Larger opening bank to compensate. |
| **The Bright City** | Noon civic plaza, glass towers, clouds | Solar falls steadily from the sky |
| **Emerald Reach** | Deep space, starfield, a lantern-shaped citadel with a burning core | Ambient energy motes; air threats are common |
| **Gamma Flats** | Irradiated desert at dusk, mesas, a glowing crater | Things come up from underneath |

Ten stages per world, forty in total, each ending in a boss. Wave composition is
generated from a per-world threat curve seeded by level id, so every player gets
the same stage 3-4 while the campaign scales without hand-authored wave tables.

## Adding a character

1. Add an entry to `src/content/heroes.ts` (or `villains.ts`): stats, an attack
   descriptor, a Leaf Mode ultimate, and an art spec (palette, head shape, chest
   emblem).
2. Add the hero id to `UNLOCK_ORDER` so a campaign level rewards it.
3. If the ultimate needs behaviour the existing ones do not cover, add one
   `case` in `src/sim/ultimates.ts`.

No art files, no render code, no new assets. `npm run test:sim` will tell you if
the new ultimate throws or if you forgot one.
