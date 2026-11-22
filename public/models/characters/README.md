# World Horizon character sources

Both GLB files contain the character meshes, skeleton, materials and the existing idle, walk and run animation clips. World Horizon also layers foot placement, turning, aiming and airborne poses in its runtime.

| GLB | Base character | World Horizon additions |
| --- | --- | --- |
| `harbor-navigator.glb` | Arriving Hotel Guest by Polyfork, from `human_hotel_guest.glb` | Marine jacket colors, cap, sling bag, pockets, straps and hardware |
| `coastal-rescue-pilot.glb` | Field Medic by Polyfork, from `human_medic.glb` | Flight suit colors, helmet, visor, headset, pack and reflective trim |

The source characters are distributed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Source attribution and modifications are embedded in each GLB.

- [Arriving Hotel Guest](https://polyfork.dev/asset/arriving-hotel-guest-b03353)
- [Field Medic](https://polyfork.dev/asset/field-medic-fd8919)

Run `node scripts/build-characters.mjs` from the repository root to regenerate the assets.

## Contemporary residents

- `quaternius-man.glb` is [Man by Quaternius](https://poly.pizza/m/HMnuH5geEG).
- `quaternius-woman-casual.glb` is [Woman Casual by Quaternius](https://poly.pizza/m/jpKRgGDxhk).

Both models are distributed as [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The original GLB 2.0 downloads each contain a skin, 31 skeleton joints, named materials, and 11 animation clips. The game normalizes scale, maps the skeleton to its pose system, and uses the embedded idle, walk, and run clips.
