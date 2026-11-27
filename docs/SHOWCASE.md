# World Horizon — Showcase & Feature Guide

**World Horizon** (`azurea-coastline-openworld`) is a Three.js / React Three Fiber open-world coastal sandbox featuring an expanded Riviera island (+33.8% dry coastal footprint), domain-warped turquoise ocean shaders & world fanfare, two-state AAA ocean swimming & character locomotion, a 4-theme rotating Pavilion Lobby, **Tripo `v3.1-20260211` HD** rigged hero characters (**Chloe Reed** with 5 costumes, **Lola Quinn** with 4 costumes, **Marcus Vance**, **Liam Sterling**, robotics, and Harbor Crew), Kit Colorways, 5 selectable emotes, 26,000-clump instanced 3D meadow grass, responsive supercar driving & pointer-lock 1st/3rd-person shooting, 12 World Wonders, and the animated **Wonder Ocean Pier Amusement Park**.

---

## AAA World Horizon Upgrade — Expanded Island, Ocean Shaders, Swimming & Animated Wonder Pier

- **Expanded Main Island (+30.7% Plateau / +33.8% Coastal Footprint)**: Sculpted coastal headlands, wider golden beaches (`44–79m`), flush travertine coastal promenades, 4 headland bluff overlooks with pergolas, new waterfront resort towers with rooftop gardens/pools, unobstructed airport climb-out corridor, and Island II Arrival Promenade pergolas.
- **AAA PBR Textures, Ocean Water Shader & World Fanfare**: Domain-warped multi-directional FBM ocean swells with crystal aquamarine-to-sapphire depth ramp, shallow caustics, and multi-band breaking shoreline surf foam; sun-weathered slate-charcoal asphalt & honed travertine textures; smooth C¹ analytical terrain normals; continuous harbor fireworks, sweeping Art-Deco premiere searchlights, celebratory fountain jets, festive bunting, and soaring seabird flocks.
- **Fluid Two-State Ocean Swimming & Character Polish**: Horizontal prone freestyle front-crawl (high-elbow arm recovery, 6-beat flutter kick, torso roll, breathing head turn, sprint cadence) + upright treading water with soft-feathered ripple/wake textures and fine sea-spray droplets; relaxed natural standing idle, crisp walk/jog/sprint & jump/landing animation, expressive emotes, and automatic 3rd-person camera restore on coaster exit.
- **Animated Wonder Ocean Pier Amusement Park**: Chasing Art-Deco marquee bulbs, honed travertine entrance apron, animated midway booths (`TICKETS`, `ARCADE` CRT screens, `CHURROS`, `ICE CREAM` spinning cone, `RING TOSS` prize wheel, `SKY BAR`), walkable Grand Riviera Carousel with sculpted curved steeds, Solaris Sky Wheel open-windowed panoramic cabins with coaxial spoke LEDs, Cyclone Pier Coaster FPV, and the swinging **Azurea Galleon Pendulum Ship**.

| Expanded Main Island Aerial & Ocean | Midtown Boulevard & World Fanfare | Crystal Ocean Shoreline Surf Foam | Active Freestyle Ocean Swimming |
| --- | --- | --- | --- |
| ![Expanded Island](./screenshots/swarm/swarm-01-expanded-island-aerial.png) | ![Midtown Fanfare](./screenshots/swarm/swarm-02-midtown-boulevard-fanfare.png) | ![Ocean Surf](./screenshots/swarm/swarm-03-ocean-shoreline-surf.png) | ![Active Swimming](./screenshots/swarm/swarm-04-active-freestyle-swimming.png) |

| Solaris Sky Wheel Panoramic Cabin | Wonder Pier Midway & Sculpted Carousel | Cyclone Coaster Front-Row FPV | Character Emote & Slate Boulevard |
| --- | --- | --- | --- |
| ![Solaris Cabin](./screenshots/swarm/swarm-05-wonder-pier-ferris-panorama.png) | ![Midway Carousel](./screenshots/swarm/swarm-06-wonder-pier-midway-carousel.png) | ![Coaster FPV](./screenshots/swarm/swarm-07-coaster-fpv-ocean.png) | ![Character Emote](./screenshots/swarm/swarm-08-character-emote-polish.png) |

---

## 0. AAA Wonder Ocean Pier, Front-Row Coaster FPV, Forza Drift & Pointer Lock

- **AAA Wonder Ocean Pier Theme Park**: Sun-weathered teak boardwalk PBR planks, wooden safety railings, ornate Art-Deco **`WONDER PIER`** entrance marquee arch, 6 striped midway carnival & food booths (`TICKETS`, `ARCADE`, `CHURROS`, `ICE CREAM`, `RING TOSS`, `SKY BAR`), draped warm Edison string lights, crimson-and-cream striped Grand Carousel, radial LED Solaris Sky Wheel, and steel A-frame Cyclone Pier Coaster.
- **True Front-Row First-Person Roller Coaster POV**: Boarding the **Cyclone Pier Coaster** (`[E]` or `Ride Cyclone`) automatically seats you in the front row with a Frenet-banked camera, sculpted glossy crimson/carbon nose hood, glowing orange-red LED strips, padded black-and-gold lap restraint bar, mouse free-look (`±55°` yaw / `±35°` pitch), dynamic `64° → 86°` speed FOV, and live telemetry HUD (`[X]` toggles 3rd-person, `[E]` exits).
- **Forza-Grade Drift Physics, True Strafe Walking & Bulletproof Pointer Lock**: Fixed inverted `A`/`D` strafing (`computeFootWishVelocity` right-handed `F × U`), counter-steer-balanced supercar drifting with momentum preservation and turbo exit boost, and direct canvas pointer lock (`Mouse Locked · [Esc] Unlock`) with 1:1 mouse deltas on foot, in 1st-person, and on rides.

| AAA Wonder Ocean Pier Boardwalk | Front-Row Coaster FPV (Banked Turn) | Front-Row Coaster FPV (Ocean Climb) |
| --- | --- | --- |
| ![AAA Wonder Pier](./screenshots/aaa/aaa-01-pier-park-overview.jpg) | ![Coaster FPV Bank](./screenshots/aaa/aaa-02-coaster-fpv-climb.jpg) | ![Coaster FPV Climb](./screenshots/aaa/aaa-03-coaster-fpv-drop.jpg) |

| Forza-Style Supercar Handling | Pointer-Lock 1st-Person & True Strafe |
| --- | --- |
| ![Supercar Handling](./screenshots/aaa/aaa-04-supercar-drift.jpg) | ![Pointer-Lock 1st-Person](./screenshots/aaa/aaa-05-foot-walking-and-aim.jpg) |

---

## 1. Flagship `v3.1` Heroes, Costumes & Kit Colorways

- **Chloe Reed (`v3.1` HD)** with 5 costumes (`Nike Pro Base`, `Emerald Club`, `Silver Spider`, `Varsity Sport`, `Holiday Velvet`) and **Lola Quinn (`v3.1` HD)** with 4 costumes (`Nike Pro Base`, `Bomber Street`, `Moto Leather`, `Holiday Velvet`), plus 7 real-time **Athletic Kit Colorways** on their Nike Pro bases (`uKitTint` shader hook).
- **Male `v3.1` HD Heroes**: `Marcus Vance` and `Liam Sterling`.
- **Natural Shading & Mixamo Mocap**: Preserves baked normal maps, applies matte-satin skin/cotton calibration, auto-aligns `+Z` facing, and retargets `idle`/`walk`/`run`/`SambaDance` motion capture clips across all Mixamo rigs. On-demand lazy GLB loading keeps startup fast.

| Chloe Reed (Azurea Kit) | Chloe Reed (Emerald Club) | Lola Quinn (Bomber Street) | Marcus Vance & Liam Sterling |
| --- | --- | --- | --- |
| ![Chloe Kit](./screenshots/v31/v31-01-chloe-base-colorway.jpg) | ![Chloe Club](./screenshots/v31/v31-02-chloe-emerald-club.jpg) | ![Lola Street](./screenshots/v31/v31-03-lola-street.jpg) | ![Marcus Vance](./screenshots/v31/v31-04-marcus-vance.jpg) |

---

## 2. Dense 22,000-Clump 3D Grass, Supercar Driving & Pointer-Lock Shooting

- **Lush 22,000-Clump 7-Blade Grass** with GPU hardware distance LOD culling (`78–125m` taper) and natural fescue/olive/soil color harmony across parks, boulevards, and Island II.
- **Snappy Supercar Driving**: Low-speed steering response, high-speed turn authority, launch torque curve, progressive slip & drift chase camera.
- **True Pointer-Lock 1st/3rd-Person Aim & Shooting**: Clicking locks the cursor for 1:1 mouse aim (`[Esc]` unlocks cursor without kicking to Menu), barrel-origin tracers, compact 1st-person viewmodel & muzzle flash, camera recoil kick, and 60fps reactive reticle spread.

| Supercar & Lush 3D Grass | First-Person Pointer-Lock Shooting |
| --- | --- |
| ![Grass & Driving](./screenshots/v31/v31-06-lush-grass-driving.jpg) | ![First-Person Shooting](./screenshots/v31/v31-07-first-person-shooting.jpg) |

---

## 3. Localhost Tripo 3D Studio (`npm run tripo-studio`)

Run `npm run tripo-studio` to launch the local Tripo3D Asset Forge at `http://127.0.0.1:4321`.

- Defaults to **`v3.1-20260211` Flagship H3.1 HD** + `Detailed HD` textures + `36,000` face limit.
- **Automatic Mixamo Biped Rigging** (`animate_rig`, `spec: "mixamo"`, 23 joints) saving `.glb` files directly into `public/models/characters/` with an ACES Filmic sRGB Three.js 3D previewer.

![Tripo 3D Studio](./screenshots/14-tripo-3d-studio.jpg)

---

## 2. Five Selectable Emotes (Lobby & In-Game `[Z]`)

Choose any of the 5 procedural full-body emotes in the Wardrobe drawer, cycle them from the bottom-right Lobby utility bar, or trigger them on foot in-game with **`[Z]`** or the HUD Emote pill:

1. **Riviera Wave** (`WAVE`)
2. **Club Groove** (`DANCE`)
3. **Victory Spin** (`SPIN`)
4. **Champion Flex** (`FLEX`)
5. **Harbor Shuffle** (`SHUFFLE`)

![In-Game Tripo Character Emote](./screenshots/16-ingame-tripo-emote.jpg)

---

## 3. Rotating Pavilion Lobby & 4 Dynamic Atmosphere Themes

All 4 lobby themes share a unified core layout with the bottom-right Game Options icon bar (`Overview`, `Turntable`, `Helipad`, `Marina`, `Hero`, `Arsenal`, `Wardrobe`, `Fleet`, `Emote`, `Reset`, `Settings`).

| Theme | Preview |
| --- | --- |
| **Sunlit Riviera** | ![Sunlit Riviera](./screenshots/01-start-screen.jpg) |
| **Sunset Boardwalk** | ![Sunset Boardwalk](./screenshots/01b-lobby-sunset-boardwalk.jpg) |
| **Tactical Overlook** | ![Tactical Overlook](./screenshots/01c-lobby-tactical-overlook.jpg) |
| **Midnight Harbor** | ![Midnight Harbor](./screenshots/01d-lobby-midnight-harbor.jpg) |

---

## 4. Wonder Ocean Pier Amusement Park (Ridable)

Extending off Island II into the open ocean, the **Wonder Ocean Pier** features 4 ridable attractions (`[E]` to board/exit):
- **Solaris Ferris Wheel** (rotating gondolas with panoramic coastline views)
- **Cyclone Pier Coaster** (elevated track loop over the water)
- **Grand Carousel** & **Apex Drop Tower**

| Pier Overview | Solaris Ferris Wheel | Cyclone Coaster |
| --- | --- | --- |
| ![Pier Overview](./screenshots/04-wonder-ocean-pier-overview.jpg) | ![Ferris Wheel](./screenshots/05-riding-solaris-ferris-wheel.jpg) | ![Coaster](./screenshots/06-riding-cyclone-pier-coaster.jpg) |

---

## 5. Open-World Modes, Landmarks & Fleet

| Mode / Landmark | Screenshot |
| --- | --- |
| **Free Roam Avenue** | ![Free Roam](./screenshots/02-free-roam-avenue.jpg) |
| **Grand Prix (Golden Gate)** | ![Grand Prix](./screenshots/03-grand-prix-golden-gate.jpg) |
| **Battle Royale Skydrop** | ![Battle Royale](./screenshots/04-battle-royale-skydrop.jpg) |
| **World Tour · Colosseum** | ![Colosseum](./screenshots/05-world-tour-colosseum.jpg) |
| **World Tour · Sydney Opera House** | ![Sydney Opera](./screenshots/06-world-tour-sydney-opera.jpg) |
| **World Tour · Eiffel Tower** | ![Eiffel Tower](./screenshots/07-world-tour-eiffel-tower.jpg) |
| **World Tour · Big Ben** | ![Big Ben](./screenshots/08-world-tour-big-ben.jpg) |
| **Maritime · Cruise Ship & Ocean** | ![Cruise Ship](./screenshots/09-maritime-cruise-ship.jpg) |
| **Aviation · Helicopter** | ![Helicopter](./screenshots/10-aviation-helicopter.jpg) |
| **Aviation · Gulfstream Coast** | ![Gulfstream](./screenshots/10b-aviation-gulfstream-coast.jpg) |
| **Mobile Touch Controls** | ![Mobile Gameplay](./screenshots/12-mobile-touch-gameplay.jpg) |
