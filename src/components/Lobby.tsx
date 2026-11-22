import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowUpRight,
  Car,
  Coins,
  Plane,
  Play,
  RotateCcw,
  Settings,
  Ship,
  Sparkles,
  X,
} from 'lucide-react';
import {
  LOBBY_THEMES,
  LOBBY_THEME_ORDER,
  type LobbyTabId,
  type LobbyThemeId,
} from '../game/lobbyThemes';
import {
  BOAT_FLEET_SPECS,
  CHARACTER_PRESETS,
  COASTAL_CHARACTERS,
  PLANE_FLEET_SPECS,
  simState,
  type CharacterCustomization,
  type ControlSettings,
  type GamePlayMode,
} from '../game/store';
import { PlaySettings } from './PlaySettings';

const NAV_TABS: LobbyTabId[] = ['PLAY', 'LOCKER', 'VEHICLES', 'SHOP', 'SETTINGS'];

const MODE_THUMBNAILS: Record<GamePlayMode, string> = {
  FREE_ROAM: '/images/lobby/sunlit-riviera.jpg',
  BATTLE_ROYALE: '/images/lobby/tactical-overlook.jpg',
  GRAND_PRIX: '/images/lobby/midnight-harbor.jpg',
  WORLD_TOUR: '/images/lobby/sunset-boardwalk.jpg',
};

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
    trim: '#facc15',
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
  { idx: 0, label: 'Ferrari 458', codeName: 'FERRARI 458 ITALIA', paint: '#dc2626' },
  { idx: 1, label: 'GT3 Supercar', codeName: 'GT3 GYMKHANA SUPERCAR', paint: '#0ea5e9' },
  { idx: 2, label: '80s Wedge', codeName: '80S WEDGE SUPERCAR', paint: '#f8fafc' },
  { idx: 3, label: 'Classic Muscle', codeName: '60S CLASSIC MUSCLE', paint: '#f59e0b' },
  { idx: 4, label: 'Stretch Limo', codeName: 'VEGAS VIP STRETCH LIMO', paint: '#18181b' },
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

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const emoteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const drag = useRef<{ id: number; x: number } | null>(null);
  const startRef = useRef(start);
  startRef.current = start;

  const character = simState.customization;
  const activeTheme = LOBBY_THEMES[themeId] ?? LOBBY_THEMES.SUNLIT_RIVIERA;
  const activeModeObj = modes.find((item) => item.id === mode) ?? modes[0];

  // Dynamic level computation from chips, combat eliminations, race laps, and tour stops
  const xpTotal =
    Math.max(0, simState.chips) +
    (simState.eliminations ?? 0) * 450 +
    (simState.lapCount ?? 0) * 600 +
    (simState.tourVisitedIds?.length ?? 0) * 200;
  const heroLevel = Math.max(1, 1 + Math.floor(xpTotal / 500));
  const levelProgress = (xpTotal % 500) / 500;
  const ringCircumference = 2 * Math.PI * 16;

  useEffect(() => {
    simState.lobbyTab = 'PLAY';
    return () => {
      clearTimeout(timer.current);
      clearTimeout(emoteTimer.current);
      simState.lobbyTab = 'PLAY';
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

  const selectTab = (nextTab: LobbyTabId) => {
    simState.lobbyTab = nextTab;
    setTab(nextTab);
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

  const selectCar = (idx: number) => {
    const car = CAR_FLEET[idx];
    if (!car) return;
    simState.activeCarIdx = car.idx;
    simState.activeCarName = car.codeName;
    setFleetTick((n) => n + 1);
    window.dispatchEvent(new CustomEvent('lobby-vehicle-change', { detail: { kind: 'CAR', idx: car.idx } }));
    window.dispatchEvent(new CustomEvent('mode-switched'));
  };

  const selectBoat = (idx: number) => {
    const boat = BOAT_FLEET_SPECS[idx];
    if (!boat) return;
    simState.activeBoatIdx = idx;
    simState.activeBoatName = boat.name;
    setFleetTick((n) => n + 1);
    window.dispatchEvent(new CustomEvent('lobby-vehicle-change', { detail: { kind: 'BOAT', idx } }));
    window.dispatchEvent(new CustomEvent('mode-switched'));
  };

  const selectPlane = (idx: number) => {
    const plane = PLANE_FLEET_SPECS[idx];
    if (!plane) return;
    simState.activePlaneIdx = idx;
    simState.activePlaneName = plane.name;
    setFleetTick((n) => n + 1);
    window.dispatchEvent(new CustomEvent('lobby-vehicle-change', { detail: { kind: 'PLANE', idx } }));
    window.dispatchEvent(new CustomEvent('mode-switched'));
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
    timer.current = setTimeout(() => startRef.current(launchMode), 240);
  };

  const heroInitial = (character.presetName?.[0] ?? 'W').toUpperCase();

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

      {/* Top Navigation & Telemetry Bar */}
      <header className="wh-topbar">
        <div className="wh-brand-cluster">
          <div className="wh-brand-title">WORLD HORIZON</div>
          <div className="wh-theme-pill-group">
            <button
              type="button"
              className="wh-theme-pill"
              onClick={cycleTheme}
              title="Cycle lobby backdrop theme"
            >
              <span
                className="wh-theme-dot"
                style={{
                  backgroundColor: activeTheme.accentHex,
                  boxShadow: `0 0 10px ${activeTheme.accentHex}`,
                }}
              />
              <span>{activeTheme.label}</span>
            </button>
            <button
              type="button"
              className="wh-auto-btn"
              aria-pressed={autoRotate}
              onClick={toggleAutoRotate}
              title="Auto-rotate lobby theme every 16s"
            >
              Auto
            </button>
          </div>
        </div>

        <nav className="wh-topnav" aria-label="Lobby navigation">
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

        <div className="wh-balance-pill" aria-label="Player balance and level">
          <Coins size={16} className="wh-coin-icon" />
          <span className="wh-chip-count">{simState.chips.toLocaleString()}</span>
          <div className="wh-hero-avatar" title={`Level ${heroLevel}`}>
            <span>{heroInitial}</span>
            <small>LVL {heroLevel}</small>
          </div>
        </div>
      </header>

      {/* Left Floating Translucent Overlay Drawer (Only on LOCKER / VEHICLES / SHOP / SETTINGS) */}
      {tab !== 'PLAY' && (
        <section className="wh-drawer" aria-label={`${tab} panel`}>
          <div className="wh-drawer-head">
            <div>
              <p className="wh-drawer-eyebrow">WORLD HORIZON</p>
              <h2>
                {tab === 'LOCKER'
                  ? 'Character Locker'
                  : tab === 'VEHICLES'
                  ? 'Fleet Hangar'
                  : tab === 'SHOP'
                  ? 'Coastal Outfitters'
                  : 'Game Settings'}
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
                <div className="wh-field-label">Character Archetype</div>
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
                  Outfit Preset
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
                  <div className="wh-settings-section">Colors &amp; Gear</div>
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
                    <span>Hat</span>
                    <input
                      type="checkbox"
                      checked={character.headwearOn}
                      onChange={(e) => update({ headwearOn: e.target.checked })}
                    />
                  </label>
                  <label>
                    <span>Pack</span>
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
                      <option value="AVIATOR_GOLD">Aviators</option>
                      <option value="CYBER_VISOR">Visor</option>
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
                    <span>Terrace Supercar</span>
                  </div>
                  <div className="wh-fleet-grid">
                    {CAR_FLEET.map((car) => (
                      <button
                        key={car.idx}
                        type="button"
                        className="wh-vehicle-btn"
                        aria-pressed={carIdx === car.idx}
                        onClick={() => selectCar(car.idx)}
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
                    <Ship size={14} />
                    <span>Maritime Fleet</span>
                  </div>
                  <div className="wh-fleet-grid">
                    {BOAT_FLEET_SPECS.map((boat, idx) => (
                      <button
                        key={boat.id}
                        type="button"
                        className="wh-vehicle-btn"
                        aria-pressed={boatIdx === idx}
                        onClick={() => selectBoat(idx)}
                      >
                        <span>{BOAT_LABELS[idx] ?? boat.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="wh-fleet-group">
                  <div className="wh-fleet-head">
                    <Plane size={14} />
                    <span>Aviation Hangar</span>
                  </div>
                  <div className="wh-fleet-grid">
                    {PLANE_FLEET_SPECS.map((plane, idx) => (
                      <button
                        key={plane.id}
                        type="button"
                        className="wh-vehicle-btn"
                        aria-pressed={planeIdx === idx}
                        onClick={() => selectPlane(idx)}
                      >
                        <span>{PLANE_LABELS[idx] ?? plane.name}</span>
                      </button>
                    ))}
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

      {/* Bottom Interactive Dock */}
      <footer className="wh-bottom-bar">
        {/* Bottom-Left Mode Launch Stack */}
        {tab === 'PLAY' && (
          <section className="wh-launch-card" aria-label="Launch mode">
            <div className="wh-launch-meta">
              <span className="wh-launch-kicker">
                WORLD HORIZON // {activeModeObj?.title.toUpperCase()}
              </span>
              <p className="wh-launch-desc">{activeModeObj?.description}</p>
            </div>

            <div className="wh-launch-controls">
              {mode !== 'GRAND_PRIX' && (
                <label className="wh-launch">
                  Arrival point
                  <select
                    value={selected}
                    onChange={(event) => setDestination(event.target.value)}
                  >
                    {destinations.map((destination) => (
                      <option value={destination.id} key={destination.id}>
                        {destination.menuLabel}
                      </option>
                    ))}
                  </select>
                </label>
              )}
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
              <ArrowUpRight size={19} strokeWidth={2.5} />
            </button>
          </section>
        )}

        {/* Bottom-Center 4-Mode Visual Strip (Only on PLAY Tab) */}
        {tab === 'PLAY' && (
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
                  <img src={MODE_THUMBNAILS[item.id]} alt="" loading="eager" />
                  <div className="wh-mode-tile-scrim" />
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
                    <Play size={12} fill="currentColor" />
                  </button>
                  <div className="wh-mode-tile-title">{item.title}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* Bottom-Right Utility Cluster */}
        <div className="wh-utility-cluster">
          {tab !== 'PLAY' && (
            <button
              id="world-start-game"
              type="button"
              className="wh-play-cta wh-play-cta-compact"
              onClick={() => enter(mode)}
              disabled={entering}
            >
              <span>{PLAY_CTA_LABELS[mode]}</span>
              <ArrowUpRight size={17} strokeWidth={2.5} />
            </button>
          )}

          <div className="wh-level-pill" title={`Hero Level ${heroLevel}`}>
            <svg viewBox="0 0 40 40" width="34" height="34" aria-hidden="true">
              <circle cx="20" cy="20" r="16" className="wh-level-track" />
              <circle
                cx="20"
                cy="20"
                r="16"
                className="wh-level-arc"
                strokeDasharray={ringCircumference}
                strokeDashoffset={ringCircumference * (1 - levelProgress)}
              />
            </svg>
            <div className="wh-level-text">
              <small>LVL</small>
              <strong>{heroLevel}</strong>
            </div>
          </div>

          <button
            type="button"
            className="wh-util-btn"
            data-active={emoting}
            onClick={triggerEmote}
          >
            <Sparkles size={15} />
            <span>EMOTE</span>
          </button>

          <button
            type="button"
            className="wh-util-btn wh-util-icon"
            aria-label="Reset character rotation"
            title="Reset character rotation"
            onClick={() => {
              simState.lobbyYaw = 0;
            }}
          >
            <RotateCcw size={15} />
          </button>

          <button
            type="button"
            className="wh-util-btn"
            aria-pressed={tab === 'SETTINGS'}
            onClick={() => selectTab(tab === 'SETTINGS' ? 'PLAY' : 'SETTINGS')}
          >
            <Settings size={15} />
            <span>Settings</span>
          </button>
        </div>
      </footer>
    </main>
  );
}
