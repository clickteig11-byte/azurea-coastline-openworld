import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowUpRight,
  Car,
  ChevronLeft,
  ChevronRight,
  Coins,
  Compass,
  Crosshair,
  Eye,
  Flag,
  Globe,
  Plane,
  Play,
  RotateCcw,
  Settings,
  Shield,
  Ship,
  Shirt,
  Sparkles,
  X,
} from 'lucide-react';
import {
  LOBBY_THEMES,
  LOBBY_THEME_ORDER,
  type LobbyFocusId,
  type LobbyTabId,
  type LobbyThemeId,
} from '../game/lobbyThemes';
import {
  BOAT_FLEET_SPECS,
  CHARACTER_PRESETS,
  COASTAL_CHARACTERS,
  PLANE_FLEET_SPECS,
  WEAPON_SPECS,
  simState,
  type CharacterCustomization,
  type ControlSettings,
  type GamePlayMode,
} from '../game/store';
import { PlaySettings } from './PlaySettings';

const NAV_TABS: LobbyTabId[] = ['PLAY', 'LOCKER', 'VEHICLES', 'ARSENAL', 'SHOP', 'SETTINGS'];

const MODE_BADGES: Record<GamePlayMode, string> = {
  FREE_ROAM: 'SANDBOX',
  BATTLE_ROYALE: 'COMBAT',
  GRAND_PRIX: 'CIRCUIT',
  WORLD_TOUR: '12 WONDERS',
};

const PLAY_CTA_LABELS: Record<GamePlayMode, string> = {
  FREE_ROAM: 'PLAY FREE ROAM',
  BATTLE_ROYALE: 'PLAY BATTLE ROYALE',
  GRAND_PRIX: 'PLAY GRAND PRIX',
  WORLD_TOUR: 'PLAY WORLD TOUR',
};

const SKINS = [
  {
    name: 'Breakwater',
    subtitle: 'Coastal Patrol',
    cost: 450,
    top: '#263f52',
    bottom: '#232a31',
    trim: '#d1aa70',
    footwear: '#f8fafc',
  },
  {
    name: 'Sun Deck',
    subtitle: 'Riviera Linen',
    cost: 750,
    top: '#b68157',
    bottom: '#3e4b45',
    trim: '#cfbf95',
    footwear: '#f8fafc',
  },
  {
    name: 'Blue Hour',
    subtitle: 'Twilight Slate',
    cost: 1100,
    top: '#3e496b',
    bottom: '#2d2b37',
    trim: '#a9c5ce',
    footwear: '#38bdf8',
  },
  {
    name: 'Riviera Gold',
    subtitle: 'Monolith VIP',
    cost: 1450,
    top: '#f8fafc',
    bottom: '#1e293b',
    trim: '#e5c384',
    footwear: '#ffffff',
  },
  {
    name: 'Midnight Ops',
    subtitle: 'Stealth Carbon',
    cost: 1850,
    top: '#0f172a',
    bottom: '#18181b',
    trim: '#22d3ee',
    footwear: '#0f172a',
  },
  {
    name: 'Sunset Racer',
    subtitle: 'Grand Prix Silk',
    cost: 2200,
    top: '#dc2626',
    bottom: '#1e293b',
    trim: '#fb923c',
    footwear: '#f8fafc',
  },
] as const;

const ARCHETYPES: { id: CharacterCustomization['archetype']; label: string }[] = [
  ...Object.entries(COASTAL_CHARACTERS).map(([id, info]) => ({
    id: id as CharacterCustomization['archetype'],
    label: info.label,
  })),
  { id: 'RPM_CUSTOM', label: 'City Runner' },
  { id: 'MICHELLE_VIP', label: 'Michelle' },
  { id: 'VANGUARD_SOLDIER', label: 'Vanguard' },
];

const CAR_FLEET = [
  { idx: 0, label: 'Ferrari 458', codeName: 'FERRARI 458 ITALIA', paint: '#dc2626', spec: 'V8 · 325 km/h' },
  { idx: 1, label: 'GT3 Supercar', codeName: 'GT3 GYMKHANA SUPERCAR', paint: '#0ea5e9', spec: 'Flat-6 · Track Aero' },
  { idx: 2, label: '80s Wedge', codeName: '80S WEDGE SUPERCAR', paint: '#f8fafc', spec: 'V12 · Retro Exotic' },
  { idx: 3, label: 'Classic Muscle', codeName: '60S CLASSIC MUSCLE', paint: '#f59e0b', spec: 'Big-Block · Drift' },
  { idx: 4, label: 'Stretch Limo', codeName: 'VEGAS VIP STRETCH LIMO', paint: '#18181b', spec: 'VIP · Strip Cruiser' },
] as const;

const BOAT_LABELS = [
  'Racing Powerboat',
  'Cruise Ship',
  'Tall Ship',
  'Sailboat',
  'Motor Yacht',
  'Submarine',
] as const;

const PLANE_LABELS = [
  'Gulfstream Jet',
  'Helicopter',
  'Fighter Jet',
  'Twin Prop',
  'Airliner',
  'Cargo Jet',
] as const;

const FOCUS_STATIONS: { id: LobbyFocusId; label: string }[] = [
  { id: 'OVERVIEW', label: 'Pavilion' },
  { id: 'CAR', label: 'Turntable' },
  { id: 'AIRCRAFT', label: 'Helipad' },
  { id: 'BOAT', label: 'Marina' },
  { id: 'CHARACTER', label: 'Hero' },
  { id: 'ARSENAL', label: 'Arsenal' },
];

function loadOutfits(): string[] {
  try {
    const inventory: unknown = JSON.parse(localStorage.getItem('world-horizon-outfits') ?? '[]');
    return Array.isArray(inventory)
      ? SKINS.map(({ name }) => name).filter((name) => inventory.includes(name))
      : [];
  } catch {
    return [];
  }
}

let stored = false;
export function restoreChips() {
  if (stored) return;
  stored = true;
  try {
    const raw = localStorage.getItem('world-horizon-chips');
    if (raw === null) return;
    const balance = Number(raw);
    if (Number.isFinite(balance)) simState.chips = Math.max(0, Math.floor(balance));
  } catch {
    /* optional storage */
  }
}

export function persistChips() {
  try {
    localStorage.setItem('world-horizon-chips', String(simState.chips));
  } catch {
    /* optional storage */
  }
}

function renderModeIcon(modeId: GamePlayMode) {
  switch (modeId) {
    case 'FREE_ROAM':
      return <Compass size={16} />;
    case 'BATTLE_ROYALE':
      return <Crosshair size={16} />;
    case 'GRAND_PRIX':
      return <Flag size={16} />;
    case 'WORLD_TOUR':
      return <Globe size={16} />;
  }
}

export function Lobby({
  mode,
  modes,
  onMode,
  start,
  destinations,
  setDestination,
  selected,
  update,
  onStyle,
  settings,
  fleet,
}: {
  mode: GamePlayMode;
  modes: { id: GamePlayMode; title: string; description: string; badge?: string }[];
  onMode: (mode: GamePlayMode) => void;
  start: (overrideMode?: GamePlayMode) => void;
  destinations: { id: string; menuLabel: string }[];
  setDestination: (id: string) => void;
  selected: string;
  update: (patch: Partial<CharacterCustomization>) => void;
  onStyle: (patch: Partial<ControlSettings>) => void;
  settings: ControlSettings;
  fleet?: ReactNode;
}) {
  const [tab, setTab] = useState<LobbyTabId>('PLAY');
  const [focusId, setFocusId] = useState<LobbyFocusId>(simState.lobbyFocus || 'OVERVIEW');
  const [themeId, setThemeId] = useState<LobbyThemeId>(simState.lobbyTheme || 'SUNLIT_RIVIERA');
  const [autoRotate, setAutoRotate] = useState<boolean>(simState.lobbyAutoRotate ?? true);
  const [cycleKey, setCycleKey] = useState(0);
  const [owned, setOwned] = useState(loadOutfits);
  const [entering, setEntering] = useState(false);
  const [emoting, setEmoting] = useState(false);
  const [, setFleetTick] = useState(0);

  const carIdx = simState.activeCarIdx ?? 0;
  const boatIdx = simState.activeBoatIdx ?? 0;
  const planeIdx = simState.activePlaneIdx ?? 0;
  const weaponIdx = simState.activeWeaponIdx ?? 0;

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const emoteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const drag = useRef<{ id: number; x: number } | null>(null);
  const startRef = useRef(start);
  startRef.current = start;

  const character = simState.customization;
  const activeTheme = LOBBY_THEMES[themeId] ?? LOBBY_THEMES.SUNLIT_RIVIERA;
  const activeModeObj = modes.find((item) => item.id === mode) ?? modes[0];
  const activeCar = CAR_FLEET[carIdx] ?? CAR_FLEET[0];
  const activePlaneLabel = PLANE_LABELS[planeIdx] ?? PLANE_FLEET_SPECS[planeIdx]?.name ?? 'Gulfstream Jet';
  const activeBoatLabel = BOAT_LABELS[boatIdx] ?? BOAT_FLEET_SPECS[boatIdx]?.name ?? 'Racing Powerboat';
  const activeWeapon = WEAPON_SPECS[weaponIdx] ?? WEAPON_SPECS[0];

  useEffect(() => {
    simState.lobbyTab = 'PLAY';
    simState.lobbyFocus = 'OVERVIEW';
    return () => {
      clearTimeout(timer.current);
      clearTimeout(emoteTimer.current);
      simState.lobbyTab = 'PLAY';
      simState.lobbyFocus = 'OVERVIEW';
    };
  }, []);

  useEffect(() => {
    if (!autoRotate) return;
    const id = window.setInterval(() => {
      setThemeId((prev) => {
        const idx = LOBBY_THEME_ORDER.indexOf(prev);
        const next = LOBBY_THEME_ORDER[(idx + 1) % LOBBY_THEME_ORDER.length];
        simState.lobbyTheme = next;
        return next;
      });
    }, 16000);
    return () => window.clearInterval(id);
  }, [autoRotate, cycleKey]);

  const setCameraFocus = (nextFocus: LobbyFocusId) => {
    simState.lobbyFocus = nextFocus;
    setFocusId(nextFocus);
  };

  const selectTab = (nextTab: LobbyTabId) => {
    simState.lobbyTab = nextTab;
    setTab(nextTab);
    if (nextTab === 'PLAY') setCameraFocus('OVERVIEW');
    else if (nextTab === 'LOCKER' || nextTab === 'SHOP') setCameraFocus('CHARACTER');
    else if (nextTab === 'ARSENAL') setCameraFocus('ARSENAL');
    else if (nextTab === 'VEHICLES') {
      if (simState.mode === 'PLANE') setCameraFocus('AIRCRAFT');
      else if (simState.mode === 'BOAT') setCameraFocus('BOAT');
      else setCameraFocus('CAR');
    }
  };

  const cycleTheme = () => {
    const idx = LOBBY_THEME_ORDER.indexOf(themeId);
    const next = LOBBY_THEME_ORDER[(idx + 1) % LOBBY_THEME_ORDER.length];
    simState.lobbyTheme = next;
    setThemeId(next);
    setCycleKey((k) => k + 1);
  };

  const toggleAutoRotate = () => {
    const next = !autoRotate;
    simState.lobbyAutoRotate = next;
    setAutoRotate(next);
    if (next) setCycleKey((k) => k + 1);
  };

  const chooseArchetype = (archetype: CharacterCustomization['archetype']) => {
    const preset = CHARACTER_PRESETS.find((item) => item.archetype === archetype);
    const label = ARCHETYPES.find((model) => model.id === archetype)?.label;
    update(preset ?? { archetype, presetName: label });
  };

  const purchase = (skin: (typeof SKINS)[number]) => {
    if (!owned.includes(skin.name)) {
      if (simState.chips < skin.cost) return;
      simState.chips -= skin.cost;
      const next = [...owned, skin.name];
      setOwned(next);
      try {
        localStorage.setItem('world-horizon-outfits', JSON.stringify(next));
      } catch {
        /* optional storage */
      }
      persistChips();
    }
    update({
      presetName: skin.name,
      topColor: skin.top,
      bottomColor: skin.bottom,
      headwearColor: skin.trim,
      footwearColor: skin.footwear,
    });
  };

  const selectCar = (idx: number, focusCamera = false) => {
    const normalized = ((idx % CAR_FLEET.length) + CAR_FLEET.length) % CAR_FLEET.length;
    const car = CAR_FLEET[normalized];
    if (!car) return;
    simState.activeCarIdx = car.idx;
    simState.activeCarName = car.codeName;
    if (focusCamera) setCameraFocus('CAR');
    setFleetTick((n) => n + 1);
    window.dispatchEvent(new CustomEvent('lobby-vehicle-change', { detail: { kind: 'CAR', idx: car.idx } }));
    window.dispatchEvent(new CustomEvent('mode-switched'));
  };

  const selectBoat = (idx: number, focusCamera = false) => {
    const len = BOAT_FLEET_SPECS.length;
    const normalized = ((idx % len) + len) % len;
    const boat = BOAT_FLEET_SPECS[normalized];
    if (!boat) return;
    simState.activeBoatIdx = normalized;
    simState.activeBoatName = boat.name;
    if (focusCamera) setCameraFocus('BOAT');
    setFleetTick((n) => n + 1);
    window.dispatchEvent(new CustomEvent('lobby-vehicle-change', { detail: { kind: 'BOAT', idx: normalized } }));
    window.dispatchEvent(new CustomEvent('mode-switched'));
  };

  const selectPlane = (idx: number, focusCamera = false) => {
    const len = PLANE_FLEET_SPECS.length;
    const normalized = ((idx % len) + len) % len;
    const plane = PLANE_FLEET_SPECS[normalized];
    if (!plane) return;
    simState.activePlaneIdx = normalized;
    simState.activePlaneName = plane.name;
    if (focusCamera) setCameraFocus('AIRCRAFT');
    setFleetTick((n) => n + 1);
    window.dispatchEvent(new CustomEvent('lobby-vehicle-change', { detail: { kind: 'PLANE', idx: normalized } }));
    window.dispatchEvent(new CustomEvent('mode-switched'));
  };

  const selectWeapon = (idx: number, focusCamera = false) => {
    const len = WEAPON_SPECS.length;
    const normalized = ((idx % len) + len) % len;
    const spec = WEAPON_SPECS[normalized];
    if (!spec) return;
    simState.activeWeaponIdx = normalized;
    simState.ammo = spec.clipSize;
    simState.maxAmmo = spec.clipSize;
    if (focusCamera) setCameraFocus('ARSENAL');
    setFleetTick((n) => n + 1);
  };

  const triggerEmote = () => {
    simState.lobbyEmoteTimer = 2.6;
    setEmoting(true);
    clearTimeout(emoteTimer.current);
    emoteTimer.current = setTimeout(() => setEmoting(false), 2600);
  };

  const enter = (overrideMode?: GamePlayMode) => {
    if (entering) return;
    const launchMode = overrideMode ?? mode;
    if (overrideMode && overrideMode !== mode) {
      simState.gameMode = overrideMode;
      onMode(overrideMode);
    }
    setEntering(true);
    timer.current = setTimeout(() => startRef.current(launchMode), 220);
  };

  const modeLiveLoadoutTag = (modeId: GamePlayMode) => {
    if (modeId === 'GRAND_PRIX') return `${activeCar.label} · 9 Gates`;
    if (modeId === 'BATTLE_ROYALE') return `${activeWeapon.shortName} · 120m Drop`;
    if (modeId === 'WORLD_TOUR') {
      const dest = destinations.find((d) => d.id === selected);
      return `${dest?.menuLabel ?? '12 Wonders'} · Guided`;
    }
    return `${activeCar.label} · ${activePlaneLabel}`;
  };

  return (
    <main className="wh-lobby" data-entering={entering} data-theme={themeId}>
      {/* Full-Bleed 3D Hero Rotation Drag Surface */}
      <div
        className="wh-lobby-stage"
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
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      />

      {/* 1. TOP ARCHITECTURAL MASTHEAD (Identical Core Layout Across All 4 Themes & Modes) */}
      <header className="wh-topbar">
        <div className="wh-brand-cluster">
          <div className="wh-brand-mark">
            <span className="wh-compass-sigil" aria-hidden="true" />
            <div>
              <div className="wh-brand-title">WORLD HORIZON</div>
              <div className="wh-brand-coords">AZUREA HARBOR PAVILION · 12 WONDERS</div>
            </div>
          </div>

          <div className="wh-theme-pill-group">
            <button
              type="button"
              className="wh-theme-pill"
              onClick={cycleTheme}
              title="Cycle coastal atmosphere theme"
            >
              <span
                className="wh-theme-dot"
                style={{
                  backgroundColor: activeTheme.accentHex,
                  boxShadow: `0 0 8px ${activeTheme.accentHex}`,
                }}
              />
              <span>{activeTheme.label}</span>
            </button>
            <button
              type="button"
              className="wh-auto-btn"
              aria-pressed={autoRotate}
              onClick={toggleAutoRotate}
              title="Auto-rotate atmosphere theme every 16s"
            >
              Auto
            </button>
          </div>
        </div>

        <nav className="wh-topnav" aria-label="Pavilion navigation">
          {NAV_TABS.map((navTab) => (
            <button
              key={navTab}
              type="button"
              aria-pressed={tab === navTab}
              onClick={() => selectTab(navTab)}
            >
              {navTab}
            </button>
          ))}
        </nav>

        <div className="wh-balance-pill" aria-label="Treasury and active fleet">
          <Coins size={15} className="wh-coin-icon" />
          <span className="wh-chip-count">{simState.chips.toLocaleString()}</span>
          <span className="wh-balance-divider" />
          <div className="wh-active-loadout-tag" title="Active 3D Models on Pavilion">
            <span>{character.presetName || 'Riviera Runner'}</span>
            <small>{activeCar.label}</small>
          </div>
        </div>
      </header>

      {/* 2. LEFT FLOATING CUSTOMIZATION DRAWER (LOCKER / VEHICLES / ARSENAL / SHOP / SETTINGS) */}
      {tab !== 'PLAY' && (
        <section className="wh-drawer" aria-label={`${tab} panel`}>
          <div className="wh-drawer-head">
            <div>
              <p className="wh-drawer-eyebrow">AZUREA HARBOR PAVILION</p>
              <h2>
                {tab === 'LOCKER'
                  ? 'Character & Crew Studio'
                  : tab === 'VEHICLES'
                  ? '3D Concours, Helipad & Marina'
                  : tab === 'ARSENAL'
                  ? '3D Tactical Arsenal & Crates'
                  : tab === 'SHOP'
                  ? 'Coastal Outfitters'
                  : 'System & Reticle Settings'}
              </h2>
            </div>
            <button
              type="button"
              className="wh-drawer-close"
              onClick={() => selectTab('PLAY')}
              aria-label="Close drawer"
            >
              <X size={16} />
            </button>
          </div>

          <div className="wh-drawer-body" key={tab}>
            {tab === 'LOCKER' && (
              <div className="wh-locker-stack">
                <div className="wh-field-label">3D Character Model</div>
                <div className="wh-archetype-grid">
                  {ARCHETYPES.map((arch) => (
                    <button
                      key={arch.id}
                      type="button"
                      className="wh-chip-btn"
                      aria-pressed={character.archetype === arch.id}
                      onClick={() => chooseArchetype(arch.id)}
                    >
                      {arch.label}
                    </button>
                  ))}
                </div>

                <label className="wh-launch">
                  Signature Preset
                  <select
                    value={
                      CHARACTER_PRESETS.some((preset) => preset.presetName === character.presetName)
                        ? character.presetName
                        : ''
                    }
                    onChange={(event) => {
                      const preset = CHARACTER_PRESETS.find(
                        (item) => item.presetName === event.target.value
                      );
                      if (preset) update(preset);
                    }}
                  >
                    <option value="" disabled>
                      Custom ({character.presetName})
                    </option>
                    {CHARACTER_PRESETS.map((item) => (
                      <option key={item.presetName} value={item.presetName}>
                        {item.presetName}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="wh-settings">
                  <div className="wh-settings-section">Tailoring &amp; Accessories</div>
                  {(
                    [
                      ['Skin', 'skinColor'],
                      ['Hair', 'hairColor'],
                      ['Jacket', 'topColor'],
                      ['Trousers', 'bottomColor'],
                      ['Shoes', 'footwearColor'],
                      ['Headwear', 'headwearColor'],
                    ] as const
                  ).map(([label, field]) => (
                    <label key={field}>
                      <span>{label}</span>
                      <input
                        type="color"
                        value={character[field] ?? '#372a23'}
                        onChange={(event) => update({ [field]: event.target.value })}
                      />
                    </label>
                  ))}
                  <label>
                    <span>Headwear</span>
                    <input
                      type="checkbox"
                      checked={character.headwearOn}
                      onChange={(e) => update({ headwearOn: e.target.checked })}
                    />
                  </label>
                  <label>
                    <span>Tactical Pack</span>
                    <input
                      type="checkbox"
                      checked={character.backpackOn}
                      onChange={(e) => update({ backpackOn: e.target.checked })}
                    />
                  </label>
                  <label>
                    <span>Eyewear</span>
                    <select
                      value={character.eyewear}
                      onChange={(e) =>
                        update({ eyewear: e.target.value as CharacterCustomization['eyewear'] })
                      }
                    >
                      <option value="NONE">None</option>
                      <option value="AVIATOR_GOLD">Gold Aviators</option>
                      <option value="CYBER_VISOR">Horizon Visor</option>
                    </select>
                  </label>
                </div>
              </div>
            )}

            {tab === 'VEHICLES' && (
              <div className="wh-vehicles-stack">
                <div className="wh-fleet-group">
                  <div className="wh-fleet-head">
                    <Car size={14} />
                    <span>Concours Turntable (5 3D Cars)</span>
                  </div>
                  <div className="wh-fleet-grid">
                    {CAR_FLEET.map((car) => (
                      <button
                        key={car.idx}
                        type="button"
                        className="wh-vehicle-btn"
                        aria-pressed={carIdx === car.idx}
                        onClick={() => selectCar(car.idx, true)}
                      >
                        <span
                          className="wh-paint-dot"
                          style={{ backgroundColor: car.paint }}
                        />
                        <span>{car.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="wh-fleet-group">
                  <div className="wh-fleet-head">
                    <Plane size={14} />
                    <span>Helipad Apron (6 3D Aircraft)</span>
                  </div>
                  <div className="wh-fleet-grid">
                    {PLANE_FLEET_SPECS.map((plane, idx) => (
                      <button
                        key={plane.id}
                        type="button"
                        className="wh-vehicle-btn"
                        aria-pressed={planeIdx === idx}
                        onClick={() => selectPlane(idx, true)}
                      >
                        <span>{PLANE_LABELS[idx] ?? plane.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="wh-fleet-group">
                  <div className="wh-fleet-head">
                    <Ship size={14} />
                    <span>Marina Slip (6 3D Vessels)</span>
                  </div>
                  <div className="wh-fleet-grid">
                    {BOAT_FLEET_SPECS.map((boat, idx) => (
                      <button
                        key={boat.id}
                        type="button"
                        className="wh-vehicle-btn"
                        aria-pressed={boatIdx === idx}
                        onClick={() => selectBoat(idx, true)}
                      >
                        <span>{BOAT_LABELS[idx] ?? boat.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === 'ARSENAL' && (
              <div className="wh-vehicles-stack">
                <div className="wh-fleet-group">
                  <div className="wh-fleet-head">
                    <Shield size={14} />
                    <span>3D Tactical Weapon Loadout</span>
                  </div>
                  <div className="wh-outfits">
                    {WEAPON_SPECS.map((spec, idx) => {
                      const active = weaponIdx === idx;
                      return (
                        <div key={spec.id} className="wh-skin-card" data-equipped={active}>
                          <span
                            className="wh-swatch"
                            style={{ backgroundColor: spec.color }}
                          />
                          <div className="wh-skin-meta">
                            <strong>{spec.name}</strong>
                            <span>
                              {spec.rarity} · DMG {spec.damage} · {spec.clipSize} RDS
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => selectWeapon(idx, true)}
                          >
                            {active ? 'Equipped' : 'Equip 3D'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {tab === 'SHOP' && (
              <div className="wh-outfits">
                {SKINS.map((skin) => {
                  const unlocked = owned.includes(skin.name);
                  const equipped = character.presetName === skin.name;
                  return (
                    <div key={skin.name} className="wh-skin-card" data-equipped={equipped}>
                      <span
                        className="wh-swatch"
                        style={{
                          background: `linear-gradient(135deg, ${skin.top} 55%, ${skin.trim} 100%)`,
                        }}
                      />
                      <div className="wh-skin-meta">
                        <strong>{skin.name}</strong>
                        <span>{skin.subtitle}</span>
                      </div>
                      <button
                        type="button"
                        disabled={!unlocked && simState.chips < skin.cost}
                        onClick={() => purchase(skin)}
                      >
                        {equipped
                          ? 'Equipped'
                          : unlocked
                          ? 'Equip'
                          : `${skin.cost.toLocaleString()} Chips`}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {tab === 'SETTINGS' && <PlaySettings settings={settings} update={onStyle} full />}
          </div>
        </section>
      )}

      {/* 3. BOTTOM HORIZON COMMAND DOCK (Consistent Core Layout Across All 4 Themes & All 4 Modes) */}
      <footer className="wh-bottom-bar">
        {/* BOTTOM-LEFT: Live 3D Model Pavilion Switcher + Expedition Launch Console */}
        <div className="wh-bottom-left-stack">
          {/* Live 3D Pavilion Model Cycle Strip (Directly cycles & focuses our loaded 3D GLB models) */}
          <div className="wh-model-showcase-bar" aria-label="Live 3D Pavilion Models">
            <div className="wh-model-pill" data-active={focusId === 'CAR'}>
              <button
                type="button"
                className="wh-model-step"
                aria-label="Previous 3D car"
                onClick={() => selectCar(carIdx - 1, true)}
              >
                <ChevronLeft size={13} />
              </button>
              <button
                type="button"
                className="wh-model-focus"
                onClick={() => setCameraFocus(focusId === 'CAR' ? 'OVERVIEW' : 'CAR')}
                title="Focus 3D Supercar Turntable"
              >
                <Car size={13} />
                <span>{activeCar.label}</span>
              </button>
              <button
                type="button"
                className="wh-model-step"
                aria-label="Next 3D car"
                onClick={() => selectCar(carIdx + 1, true)}
              >
                <ChevronRight size={13} />
              </button>
            </div>

            <div className="wh-model-pill" data-active={focusId === 'AIRCRAFT'}>
              <button
                type="button"
                className="wh-model-step"
                aria-label="Previous 3D aircraft"
                onClick={() => selectPlane(planeIdx - 1, true)}
              >
                <ChevronLeft size={13} />
              </button>
              <button
                type="button"
                className="wh-model-focus"
                onClick={() => setCameraFocus(focusId === 'AIRCRAFT' ? 'OVERVIEW' : 'AIRCRAFT')}
                title="Focus 3D Helipad Aircraft"
              >
                <Plane size={13} />
                <span>{activePlaneLabel}</span>
              </button>
              <button
                type="button"
                className="wh-model-step"
                aria-label="Next 3D aircraft"
                onClick={() => selectPlane(planeIdx + 1, true)}
              >
                <ChevronRight size={13} />
              </button>
            </div>

            <div className="wh-model-pill" data-active={focusId === 'BOAT'}>
              <button
                type="button"
                className="wh-model-step"
                aria-label="Previous 3D boat"
                onClick={() => selectBoat(boatIdx - 1, true)}
              >
                <ChevronLeft size={13} />
              </button>
              <button
                type="button"
                className="wh-model-focus"
                onClick={() => setCameraFocus(focusId === 'BOAT' ? 'OVERVIEW' : 'BOAT')}
                title="Focus 3D Marina Vessel"
              >
                <Ship size={13} />
                <span>{activeBoatLabel}</span>
              </button>
              <button
                type="button"
                className="wh-model-step"
                aria-label="Next 3D boat"
                onClick={() => selectBoat(boatIdx + 1, true)}
              >
                <ChevronRight size={13} />
              </button>
            </div>

            <div className="wh-model-pill" data-active={focusId === 'ARSENAL'}>
              <button
                type="button"
                className="wh-model-step"
                aria-label="Previous 3D weapon"
                onClick={() => selectWeapon(weaponIdx - 1, true)}
              >
                <ChevronLeft size={13} />
              </button>
              <button
                type="button"
                className="wh-model-focus"
                onClick={() => setCameraFocus(focusId === 'ARSENAL' ? 'OVERVIEW' : 'ARSENAL')}
                title="Focus 3D Tactical Weapon"
              >
                <Crosshair size={13} />
                <span>{activeWeapon.shortName}</span>
              </button>
              <button
                type="button"
                className="wh-model-step"
                aria-label="Next 3D weapon"
                onClick={() => selectWeapon(weaponIdx + 1, true)}
              >
                <ChevronRight size={13} />
              </button>
            </div>
          </div>

          {/* Expedition Launch Card (Identical Structure Across All Modes & Themes) */}
          <section className="wh-launch-card" aria-label="Launch mode">
            <div className="wh-launch-meta">
              <div className="wh-launch-kicker-row">
                <span className="wh-launch-kicker">
                  EXPEDITION // {activeModeObj?.title.toUpperCase()}
                </span>
                <span className="wh-launch-badge">{MODE_BADGES[mode]}</span>
              </div>
              <p className="wh-launch-desc">{activeModeObj?.description}</p>
            </div>

            <div className="wh-launch-controls">
              <label className="wh-launch">
                Arrival point
                <select
                  value={selected}
                  disabled={mode === 'GRAND_PRIX'}
                  onChange={(event) => setDestination(event.target.value)}
                >
                  {mode === 'GRAND_PRIX' ? (
                    <option value={selected}>Harbor Blvd — Grand Prix Grid</option>
                  ) : (
                    destinations.map((destination) => (
                      <option value={destination.id} key={destination.id}>
                        {destination.menuLabel}
                      </option>
                    ))
                  )}
                </select>
              </label>
              {fleet}
            </div>

            <button
              id="world-start-game"
              type="button"
              className="wh-play-cta"
              onClick={() => enter(mode)}
              disabled={entering}
            >
              <span>{PLAY_CTA_LABELS[mode]}</span>
              <ArrowUpRight size={18} strokeWidth={2.5} />
            </button>
          </section>
        </div>

        {/* BOTTOM-RIGHT: Game Mode Icon Cards & Game Options Icons (Consistent Across All Modes & Themes) */}
        <div className="wh-bottom-right-dock">
          {/* 4 Game Mode Icon Cards in the Bottom-Right */}
          <div className="wh-mode-strip" role="listbox" aria-label="Game modes">
            {modes.map((item) => {
              const isSelected = mode === item.id;
              return (
                <div
                  key={item.id}
                  role="option"
                  tabIndex={0}
                  aria-selected={isSelected}
                  className="wh-mode-tile"
                  data-selected={isSelected}
                  onClick={() => onMode(item.id)}
                  onDoubleClick={() => enter(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onMode(item.id);
                    }
                  }}
                >
                  <div className="wh-mode-tile-top">
                    <span className="wh-mode-icon-box" aria-hidden="true">
                      {renderModeIcon(item.id)}
                    </span>
                    <span className="wh-mode-badge">
                      {item.badge ?? MODE_BADGES[item.id]}
                    </span>
                    <button
                      type="button"
                      className="wh-mode-quick"
                      aria-label={`Play ${item.title}`}
                      title={`Launch ${item.title}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        enter(item.id);
                      }}
                    >
                      <Play size={11} fill="currentColor" />
                    </button>
                  </div>

                  <div className="wh-mode-tile-bottom">
                    <div className="wh-mode-tile-title">{item.title}</div>
                    <div className="wh-mode-tile-sub">{modeLiveLoadoutTag(item.id)}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom-Right Game Options Icons Row (Always Visible Across All Modes & Themes) */}
          <div className="wh-utility-cluster" aria-label="Game options">
            {/* 3D Camera Station Focus Pills */}
            <div className="wh-focus-strip" role="group" aria-label="3D Camera View">
              {FOCUS_STATIONS.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  className="wh-focus-chip"
                  aria-pressed={focusId === st.id}
                  onClick={() => setCameraFocus(st.id)}
                  title={`Focus 3D Camera on ${st.label}`}
                >
                  {st.id === 'OVERVIEW' && <Eye size={12} />}
                  <span>{st.label}</span>
                </button>
              ))}
            </div>

            <button
              type="button"
              className="wh-util-btn"
              aria-pressed={tab === 'LOCKER'}
              onClick={() => selectTab(tab === 'LOCKER' ? 'PLAY' : 'LOCKER')}
              title="Character Wardrobe & Crew"
            >
              <Shirt size={15} />
              <span>Wardrobe</span>
            </button>

            <button
              type="button"
              className="wh-util-btn"
              aria-pressed={tab === 'VEHICLES'}
              onClick={() => selectTab(tab === 'VEHICLES' ? 'PLAY' : 'VEHICLES')}
              title="3D Vehicles, Aircraft & Vessels"
            >
              <Car size={15} />
              <span>Fleet</span>
            </button>

            <button
              type="button"
              className="wh-util-btn"
              data-active={emoting}
              onClick={triggerEmote}
              title="Trigger character emote"
            >
              <Sparkles size={15} />
              <span>EMOTE</span>
            </button>

            <button
              type="button"
              className="wh-util-btn wh-util-icon"
              aria-label="Reset character rotation"
              title="Reset 3D camera & character view"
              onClick={() => {
                simState.lobbyYaw = 0;
                setCameraFocus('OVERVIEW');
              }}
            >
              <RotateCcw size={15} />
            </button>

            <button
              type="button"
              className="wh-util-btn"
              aria-pressed={tab === 'SETTINGS'}
              onClick={() => selectTab(tab === 'SETTINGS' ? 'PLAY' : 'SETTINGS')}
              title="Game Controls, Reticle & Graphics Settings"
            >
              <Settings size={15} />
              <span>Settings</span>
            </button>
          </div>
        </div>
      </footer>
    </main>
  );
}
