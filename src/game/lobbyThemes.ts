export type LobbyThemeId =
  | 'SUNLIT_RIVIERA'
  | 'SUNSET_BOARDWALK'
  | 'TACTICAL_OVERLOOK'
  | 'MIDNIGHT_HARBOR';

export type LobbyTabId = 'PLAY' | 'LOCKER' | 'VEHICLES' | 'SHOP' | 'SETTINGS';

export interface LobbyThemeConfig {
  id: LobbyThemeId;
  label: string;
  subtitle: string;
  thumbUrl: string;
  accentHex: string;
  skyZenith: string;
  skyHorizon: string;
  sunColor: string;
  sunDir: [number, number, number];
  sunsetWarmth: number;
  moonVisibility: number;
  starIntensity: number;
  windowGlow: number;
  carLightsOn: boolean;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  dirColor: string;
  dirIntensity: number;
  fillColor: string;
  fillIntensity: number;
  oceanShallow: [number, number, number];
  oceanDeep: [number, number, number];
  oceanFoam: [number, number, number];
  padGlowColor: string;
  terraceDeckColor: string;
  terraceAccentColor: string;
  keyLightColor: string;
  keyLightIntensity: number;
  rimLightColor: string;
  rimLightIntensity: number;
  exposure: number;
}

export const LOBBY_THEME_ORDER: LobbyThemeId[] = [
  'SUNLIT_RIVIERA',
  'SUNSET_BOARDWALK',
  'TACTICAL_OVERLOOK',
  'MIDNIGHT_HARBOR',
];

export const LOBBY_THEMES: Record<LobbyThemeId, LobbyThemeConfig> = {
  SUNLIT_RIVIERA: {
    id: 'SUNLIT_RIVIERA',
    label: 'Sunlit Riviera',
    subtitle: 'Crisp Mediterranean daylight over turquoise bay & world skyline',
    thumbUrl: '/images/lobby/sunlit-riviera.jpg',
    accentHex: '#38bdf8',
    skyZenith: '#126ec4',
    skyHorizon: '#bce4f8',
    sunColor: '#fff6d0',
    sunDir: [-0.66, 0.54, -0.52],
    sunsetWarmth: 0.04,
    moonVisibility: 0.0,
    starIntensity: 0.0,
    windowGlow: 0.0,
    carLightsOn: false,
    fogColor: '#bae1f3',
    fogNear: 360,
    fogFar: 1450,
    hemiSky: '#e0f0ff',
    hemiGround: '#8c7d6b',
    hemiIntensity: 0.78,
    dirColor: '#fff5e2',
    dirIntensity: 2.3,
    fillColor: '#8ecbf5',
    fillIntensity: 0.34,
    oceanShallow: [0.06, 0.65, 0.72],
    oceanDeep: [0.03, 0.24, 0.44],
    oceanFoam: [0.94, 0.97, 0.99],
    padGlowColor: '#38bdf8',
    terraceDeckColor: '#cbd2d6',
    terraceAccentColor: '#38bdf8',
    keyLightColor: '#fff1d8',
    keyLightIntensity: 14,
    rimLightColor: '#bae6fd',
    rimLightIntensity: 10,
    exposure: 1.03,
  },
  SUNSET_BOARDWALK: {
    id: 'SUNSET_BOARDWALK',
    label: 'Sunset Boardwalk',
    subtitle: 'Golden-hour coral & amber sky over palm promenade',
    thumbUrl: '/images/lobby/sunset-boardwalk.jpg',
    accentHex: '#fb923c',
    skyZenith: '#2a3369',
    skyHorizon: '#ff8a4d',
    sunColor: '#ffd485',
    sunDir: [-0.97, 0.14, -0.18],
    sunsetWarmth: 0.96,
    moonVisibility: 0.0,
    starIntensity: 0.14,
    windowGlow: 0.45,
    carLightsOn: true,
    fogColor: '#ec9c76',
    fogNear: 280,
    fogFar: 1220,
    hemiSky: '#ffb894',
    hemiGround: '#4e3c3c',
    hemiIntensity: 0.56,
    dirColor: '#ffa463',
    dirIntensity: 2.0,
    fillColor: '#8678c2',
    fillIntensity: 0.34,
    oceanShallow: [0.14, 0.44, 0.52],
    oceanDeep: [0.06, 0.16, 0.32],
    oceanFoam: [0.98, 0.85, 0.74],
    padGlowColor: '#22d3ee',
    terraceDeckColor: '#a69186',
    terraceAccentColor: '#fb923c',
    keyLightColor: '#ffc999',
    keyLightIntensity: 16,
    rimLightColor: '#67e8f9',
    rimLightIntensity: 13,
    exposure: 1.06,
  },
  TACTICAL_OVERLOOK: {
    id: 'TACTICAL_OVERLOOK',
    label: 'Tactical Overlook',
    subtitle: 'Deep blue-hour twilight overlook above illuminated harbor',
    thumbUrl: '/images/lobby/tactical-overlook.jpg',
    accentHex: '#60a5fa',
    skyZenith: '#081633',
    skyHorizon: '#264970',
    sunColor: '#c0d9ff',
    sunDir: [-0.95, 0.22, -0.20],
    sunsetWarmth: 0.12,
    moonVisibility: 0.52,
    starIntensity: 0.65,
    windowGlow: 0.85,
    carLightsOn: true,
    fogColor: '#254468',
    fogNear: 255,
    fogFar: 1120,
    hemiSky: '#567eb2',
    hemiGround: '#192130',
    hemiIntensity: 0.34,
    dirColor: '#9ec4ff',
    dirIntensity: 0.78,
    fillColor: '#38bdf8',
    fillIntensity: 0.36,
    oceanShallow: [0.04, 0.24, 0.39],
    oceanDeep: [0.015, 0.08, 0.19],
    oceanFoam: [0.64, 0.80, 0.92],
    padGlowColor: '#38bdf8',
    terraceDeckColor: '#4a5566',
    terraceAccentColor: '#38bdf8',
    keyLightColor: '#d0e6ff',
    keyLightIntensity: 16,
    rimLightColor: '#38bdf8',
    rimLightIntensity: 15,
    exposure: 1.06,
  },
  MIDNIGHT_HARBOR: {
    id: 'MIDNIGHT_HARBOR',
    label: 'Midnight Harbor',
    subtitle: 'Moonlit terrace & luminous metropolis skyline over dark bay',
    thumbUrl: '/images/lobby/midnight-harbor.jpg',
    accentHex: '#22d3ee',
    skyZenith: '#030816',
    skyHorizon: '#0d2644',
    sunColor: '#dcecff',
    sunDir: [-0.95, 0.23, -0.19],
    sunsetWarmth: 0.0,
    moonVisibility: 1.0,
    starIntensity: 1.0,
    windowGlow: 1.15,
    carLightsOn: true,
    fogColor: '#0e243e',
    fogNear: 245,
    fogFar: 1080,
    hemiSky: '#446a9c',
    hemiGround: '#111826',
    hemiIntensity: 0.24,
    dirColor: '#c4deff',
    dirIntensity: 0.56,
    fillColor: '#22d3ee',
    fillIntensity: 0.36,
    oceanShallow: [0.03, 0.18, 0.32],
    oceanDeep: [0.01, 0.06, 0.15],
    oceanFoam: [0.62, 0.82, 0.96],
    padGlowColor: '#22d3ee',
    terraceDeckColor: '#354050',
    terraceAccentColor: '#22d3ee',
    keyLightColor: '#dceeff',
    keyLightIntensity: 18,
    rimLightColor: '#22d3ee',
    rimLightIntensity: 17,
    exposure: 1.08,
  },
};

export function resolveActiveThemeId(
  startMenuOpen: boolean,
  lobbyTheme: LobbyThemeId,
  worldTimeTheme: 'AUTO' | LobbyThemeId
): LobbyThemeId {
  if (startMenuOpen || worldTimeTheme === 'AUTO') {
    return lobbyTheme;
  }
  return worldTimeTheme;
}
