import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUpRight, Coins, RotateCcw } from 'lucide-react';
import { CHARACTER_PRESETS, COASTAL_CHARACTERS, simState, type CharacterCustomization, type GamePlayMode, type ControlSettings } from '../game/store';
import { PlaySettings } from './PlaySettings';

const sections = ['Modes', 'Wardrobe', 'Outfits', 'Settings'] as const;
const skins = [
  { name: 'Breakwater', cost: 450, top: '#263f52', bottom: '#232a31', trim: '#d1aa70' },
  { name: 'Sun Deck', cost: 750, top: '#b68157', bottom: '#3e4b45', trim: '#cfbf95' },
  { name: 'Blue Hour', cost: 1100, top: '#3e496b', bottom: '#2d2b37', trim: '#a9c5ce' },
];

function loadOutfits(): string[] {
  try {
    const inventory: unknown = JSON.parse(localStorage.getItem('world-horizon-outfits') ?? '[]');
    return Array.isArray(inventory) ? skins.map(({ name }) => name).filter((name) => inventory.includes(name)) : [];
  } catch { return []; }
}
const models: { id: CharacterCustomization['archetype']; label: string }[] = [
  ...Object.entries(COASTAL_CHARACTERS).map(([id, info]) => ({ id: id as CharacterCustomization['archetype'], label: info.label })),
  { id: 'RPM_CUSTOM', label: 'City Runner' },
  { id: 'MICHELLE_VIP', label: 'Michelle' },
  { id: 'VANGUARD_SOLDIER', label: 'Vanguard' },
];
let stored = false;
export function restoreChips() {
  if (stored) return;
  stored = true;
  try {
    const balance = Number(localStorage.getItem('world-horizon-chips') ?? 0);
    if (Number.isFinite(balance)) simState.chips = Math.max(0, Math.floor(balance));
  } catch { /* optional storage */ }
}
export function persistChips() {
  try { localStorage.setItem('world-horizon-chips', String(simState.chips)); } catch { /* optional storage */ }
}

export function Lobby({ mode, modes, onMode, start, destinations, setDestination, selected, update, onStyle, settings, fleet }: {
  mode: GamePlayMode;
  modes: { id: GamePlayMode; title: string; description: string }[];
  onMode: (mode: GamePlayMode) => void;
  start: () => void;
  destinations: { id: string; menuLabel: string }[];
  setDestination: (id: string) => void;
  selected: string;
  update: (patch: Partial<CharacterCustomization>) => void;
  onStyle: (patch: Partial<ControlSettings>) => void;
  settings: ControlSettings;
  fleet?: ReactNode;
}) {
  const [tab, setTab] = useState<typeof sections[number]>('Modes');
  const [owned, setOwned] = useState(loadOutfits);
  const [entering, setEntering] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const drag = useRef<{ id: number; x: number } | null>(null);
  const character = simState.customization;
  useEffect(() => () => clearTimeout(timer.current), []);

  const choose = (archetype: CharacterCustomization['archetype']) => {
    const preset = CHARACTER_PRESETS.find((item) => item.archetype === archetype);
    const label = models.find((model) => model.id === archetype)?.label;
    update(preset ?? { archetype, presetName: label });
  };
  const purchase = (skin: typeof skins[number]) => {
    if (!owned.includes(skin.name)) {
      if (simState.chips < skin.cost) return;
      simState.chips -= skin.cost;
      const next = [...owned, skin.name];
      setOwned(next);
      try { localStorage.setItem('world-horizon-outfits', JSON.stringify(next)); } catch { /* optional storage */ }
      persistChips();
    }
    update({ presetName: skin.name, topColor: skin.top, bottomColor: skin.bottom, headwearColor: skin.trim });
  };
  const enter = () => {
    if (entering) return;
    setEntering(true);
    timer.current = setTimeout(start, 240);
  };
  return <main className="wh-lobby" data-entering={entering}>
    <div className="wh-lobby-stage"
      onPointerDown={(event) => {
        if (drag.current || event.button > 0) return;
        drag.current = { id: event.pointerId, x: event.clientX };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const held = drag.current;
        if (held?.id !== event.pointerId) return;
        simState.lobbyYaw += (event.clientX - held.x) * 0.012;
        held.x = event.clientX;
      }}
      onLostPointerCapture={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}
      onPointerUp={() => { drag.current = null; }}>
      <button className="wh-round" aria-label="Reset character rotation" onPointerDown={(event) => event.stopPropagation()}
        onClick={() => { simState.lobbyYaw = 0; }}>
        <RotateCcw size={16} />
      </button>
    </div>
    <div className="wh-balance" aria-label="Chips"><Coins size={17} />{simState.chips.toLocaleString()} <span>Chips</span></div>
    <section className="wh-lobby-panel">
      <header><p>Azurea Coast</p><h1>World Horizon</h1></header>
      <nav aria-label="Lobby">
        {sections.map((section) => <button key={section} type="button" aria-pressed={tab === section} onClick={() => setTab(section)}>{section}</button>)}
      </nav>
      <div className="wh-lobby-content" key={tab}>
        {tab === 'Modes' && <>
          <div className="wh-mode-list">
            {modes.map((item) => <button key={item.id} aria-pressed={mode === item.id} onClick={() => onMode(item.id)}>
              <strong>{item.title}</strong><span>{item.description}</span>
            </button>)}
          </div>
          {mode !== 'GRAND_PRIX' && <label className="wh-launch">Arrival point
            <select value={selected} onChange={(event) => setDestination(event.target.value)}>
              {destinations.map((destination) => <option value={destination.id} key={destination.id}>{destination.menuLabel}</option>)}
            </select>
          </label>}
          {fleet}
        </>}
        {tab === 'Wardrobe' && <>
          <label className="wh-launch">Character
            <select value={character.archetype} onChange={(event) => choose(event.target.value as CharacterCustomization['archetype'])}>
              {models.map((model) => <option value={model.id} key={model.id}>{model.label}</option>)}
            </select>
          </label>
          <label className="wh-launch">Outfit
            <select value={CHARACTER_PRESETS.some((preset) => preset.presetName === character.presetName) ? character.presetName : ''}
              onChange={(event) => {
                const preset = CHARACTER_PRESETS.find((item) => item.presetName === event.target.value);
                if (preset) update(preset);
              }}>
              <option value="" disabled>Custom</option>
              {CHARACTER_PRESETS.map((item) => <option key={item.presetName}>{item.presetName}</option>)}
            </select>
          </label>
          <div className="wh-settings">
            {([
              ['Jacket', 'topColor'], ['Trousers', 'bottomColor'], ['Shoes', 'footwearColor'],
              ['Skin', 'skinColor'], ['Hair', 'hairColor'], ['Headwear', 'headwearColor'],
            ] as const).map(([label, field]) => <label key={field}>{label}<input type="color" value={character[field] ?? '#372a23'}
              onChange={(event) => update({ [field]: event.target.value })} /></label>)}
            <label>Hat<input type="checkbox" checked={character.headwearOn} onChange={(e) => update({ headwearOn: e.target.checked })} /></label>
            <label>Pack<input type="checkbox" checked={character.backpackOn} onChange={(e) => update({ backpackOn: e.target.checked })} /></label>
            <label>Eyewear<select value={character.eyewear} onChange={(e) => update({ eyewear: e.target.value as CharacterCustomization['eyewear'] })}>
              <option value="NONE">None</option><option value="AVIATOR_GOLD">Aviators</option><option value="CYBER_VISOR">Visor</option>
            </select></label>
          </div>
        </>}
        {tab === 'Outfits' && <div className="wh-outfits">{skins.map((skin) => {
          const unlocked = owned.includes(skin.name);
          return <div key={skin.name}><span className="wh-swatch" style={{ backgroundColor: skin.top }} /><strong>{skin.name}</strong>
            <button disabled={!unlocked && simState.chips < skin.cost} onClick={() => purchase(skin)}>
              {character.presetName === skin.name ? 'Equipped' : unlocked ? 'Equip' : skin.cost.toLocaleString() + ' chips'}
            </button></div>;
        })}</div>}
        {tab === 'Settings' && <PlaySettings settings={settings} update={onStyle} full />}
      </div>
      <button id="world-start-game" type="button" className="wh-play" onClick={enter} disabled={entering}>
        {mode === 'GRAND_PRIX' ? 'Start Race' : 'Enter World'}<ArrowUpRight size={19} />
      </button>
    </section>
  </main>;
}
