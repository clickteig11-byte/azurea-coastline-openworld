# World Horizon — Showcase & Feature Guide

**World Horizon** (`azurea-coastline-openworld`) is a Three.js / React Three Fiber open-world coastal sandbox featuring a 4-theme rotating Pavilion Lobby, 14 custom-rigged Mixamo-biped Tripo3D characters, 5 selectable emotes, hyper-realistic Gerstner ocean waves, atmospheric sky & instanced grass, a drivable/sail-able/flyable vehicle fleet, 12 World Wonders, and the **Wonder Ocean Pier Amusement Park** extending into the sea.

---

## 1. Localhost Tripo 3D Studio & Rigged Character Pipeline

Run `npm run tripo-studio` to launch the local Tripo3D Asset Forge at `http://127.0.0.1:4321`.

- **Image-to-3D & Text-to-3D** using `v2.5-20250123` (economical 30 credits) or `v3.0-20250812` / `v3.1-20260211`.
- **Automatic Mixamo Biped Rigging** (`animate_rig`, `spec: "mixamo"`, +25 credits) producing 23-joint skeletal `.glb` files saved directly into `public/models/characters/`.
- **Built-in Three.js OrbitControls 3D Inspector** with bone count readout and one-click preview of all saved character `.glb` assets.

![Tripo 3D Studio](./screenshots/14-tripo-3d-studio.jpg)

### 14 Rigged Tripo Characters in Wardrobe

All 14 characters are Mixamo-rigged (23 joints) and driven by `createHumanoidRig()` + `animateHumanoid()` with 2-bone leg IK, procedural gait, swimming, parachuting, and emotes:

- **Sport & Streetwear**: `Elena · Sport Pro`, `Chloe · Sport Pro`, `Elena · Moto`, `Chloe · Varsity`
- **Riviera & Cyber**: `Sienna · Riviera`, `Nova · Neon`, `Aria · Chrome`, `Vesper · Spider`
- **Tactical & Seasonal**: `Valkyrie · Blonde`, `Scarlet · Tactical`, `Bella · Holiday`, `Camila · Holiday`
- **Sleek Robotics**: `Aegis · Titanium Bot`, `Solstice · Gold Bot`

![Lobby Tripo Character & Emote](./screenshots/15-lobby-tripo-character-emote.jpg)

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
