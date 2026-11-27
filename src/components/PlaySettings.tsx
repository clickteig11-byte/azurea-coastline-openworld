import { useState } from 'react';
import { AIM_MODES, RETICLES, type Reticle } from '../game/aim';
import { LOBBY_THEMES, LOBBY_THEME_ORDER, type LobbyThemeId } from '../game/lobbyThemes';
import { simState, type ControlSettings } from '../game/store';

function CrosshairPreviewBadge({
  reticle,
  color,
  size,
}: {
  reticle: Reticle;
  color: string;
  size: number;
}) {
  const gap = reticle === 'Dynamic Spread' ? 5.2 : 3.8;
  const line = size * 0.34;
  const cross =
    `M ${-gap - line} 0 H ${-gap} M ${gap} 0 H ${gap + line} ` +
    `M 0 ${-gap - line} V ${-gap} M 0 ${gap} V ${gap + line}`;

  return (
    <span className="wh-reticle-badge" title={`${reticle} preview`}>
      <svg viewBox="-22 -22 44 44" width="30" height="30" style={{ color }} aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          {(reticle === 'Classic Cross' || reticle === 'Dynamic Spread') && <path d={cross} />}
          {reticle === 'Tactical Circle' && (
            <circle r={size * 0.45} strokeDasharray="8 3" />
          )}
          {reticle === 'Chevron' && (
            <path d={`M ${-size * 0.44} ${size * 0.32} L 0 0 L ${size * 0.44} ${size * 0.32}`} />
          )}
        </g>
        {reticle !== 'Chevron' && (
          <circle r={reticle === 'Precision Dot' ? size * 0.14 : 1.25} fill="currentColor" />
        )}
      </svg>
    </span>
  );
}

export function PlaySettings({
  settings,
  update,
  full = false,
  touch = false,
}: {
  settings: ControlSettings;
  update: (patch: Partial<ControlSettings>) => void;
  full?: boolean;
  touch?: boolean;
}) {
  const [worldSkyMood, setWorldSkyMood] = useState<'AUTO' | LobbyThemeId>(simState.worldTimeTheme);

  const handleSkyMoodChange = (next: 'AUTO' | LobbyThemeId) => {
    simState.worldTimeTheme = next;
    setWorldSkyMood(next);
    window.dispatchEvent(new CustomEvent('world-theme-change', { detail: next }));
  };

  return (
    <div className="wh-settings">
      <div className="wh-settings-section">Combat &amp; Crosshair</div>
      <label>
        <span>Aim assist</span>
        <select
          value={settings.aimAssist}
          onChange={(e) => update({ aimAssist: e.target.value as ControlSettings['aimAssist'] })}
        >
          {AIM_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {mode === 'Light Assist' ? 'Light' : mode}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span className="wh-settings-label-inline">
          Crosshair
          <CrosshairPreviewBadge
            reticle={settings.reticle}
            color={settings.reticleColor}
            size={settings.reticleSize}
          />
        </span>
        <select
          value={settings.reticle}
          onChange={(e) => update({ reticle: e.target.value as ControlSettings['reticle'] })}
        >
          {RETICLES.map((style) => (
            <option key={style} value={style}>
              {style}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>Crosshair color</span>
        <span className="wh-color-wrap">
          <span className="wh-color-hex">{settings.reticleColor}</span>
          <input
            type="color"
            value={settings.reticleColor}
            onChange={(e) => update({ reticleColor: e.target.value })}
          />
        </span>
      </label>

      <label>
        <span>
          Crosshair size <em className="wh-val-tag">{settings.reticleSize}px</em>
        </span>
        <input
          type="range"
          min={10}
          max={30}
          value={settings.reticleSize}
          onChange={(e) => update({ reticleSize: Number(e.target.value) })}
        />
      </label>

      <label>
        <span>
          Look sensitivity <em className="wh-val-tag">{Math.round(settings.mouseSensitivity * 100)}%</em>
        </span>
        <input
          type="range"
          min={0.3}
          max={2.3}
          step={0.05}
          value={settings.mouseSensitivity}
          onChange={(e) => update({ mouseSensitivity: Number(e.target.value) })}
        />
      </label>

      {full && (
        <>
          <div className="wh-settings-section">Handling &amp; Camera</div>
          <label>
            <span>
              Steering <em className="wh-val-tag">{Math.round(settings.steeringSensitivity * 100)}%</em>
            </span>
            <input
              type="range"
              min={0.4}
              max={2}
              step={0.05}
              value={settings.steeringSensitivity}
              onChange={(e) => update({ steeringSensitivity: Number(e.target.value) })}
            />
          </label>
          <label>
            <span>
              Throttle <em className="wh-val-tag">{Math.round(settings.throttleSensitivity * 100)}%</em>
            </span>
            <input
              type="range"
              min={0.5}
              max={1.8}
              step={0.05}
              value={settings.throttleSensitivity}
              onChange={(e) => update({ throttleSensitivity: Number(e.target.value) })}
            />
          </label>
          <label>
            <span>
              Camera smoothness <em className="wh-val-tag">{Math.round(settings.cameraSmoothness * 100)}%</em>
            </span>
            <input
              type="range"
              min={0.4}
              max={2}
              step={0.05}
              value={settings.cameraSmoothness}
              onChange={(e) => update({ cameraSmoothness: Number(e.target.value) })}
            />
          </label>
          <label>
            <span>Steering &amp; flight assist</span>
            <input
              type="checkbox"
              checked={settings.steeringAssist}
              onChange={(e) => update({ steeringAssist: e.target.checked })}
            />
          </label>
          <label>
            <span>Invert flight pitch</span>
            <input
              type="checkbox"
              checked={settings.invertFlightY}
              onChange={(e) => update({ invertFlightY: e.target.checked })}
            />
          </label>
        </>
      )}

      <div className="wh-settings-section">World &amp; Performance</div>
      <label>
        <span>World Time / Sky</span>
        <select
          value={worldSkyMood}
          onChange={(e) => handleSkyMoodChange(e.target.value as 'AUTO' | LobbyThemeId)}
        >
          <option value="AUTO">Match Lobby</option>
          {LOBBY_THEME_ORDER.map((id) => (
            <option key={id} value={id}>
              {LOBBY_THEMES[id].label}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>Graphics quality</span>
        <select
          value={settings.graphics}
          onChange={(e) => update({ graphics: e.target.value as ControlSettings['graphics'] })}
        >
          <option value="Performance">Performance</option>
          <option value="Balanced">Balanced</option>
          <option value="High">High</option>
        </select>
      </label>

      <label>
        <span>Blood effects</span>
        <input
          type="checkbox"
          checked={settings.blood}
          onChange={(e) => update({ blood: e.target.checked })}
        />
      </label>

      <label>
        <span>Mute audio</span>
        <input
          type="checkbox"
          checked={settings.audioMuted}
          onChange={(e) => update({ audioMuted: e.target.checked })}
        />
      </label>

      {full && (
        <div className="wh-settings-hint">
          {touch && <p>Drag the right side to look. Tap View to change camera. Hold Gas and steer with the joystick.</p>}
          <dl className="wh-control-reference">
            <dt>On foot</dt>
            <dd>WASD move · X camera · Right mouse aim · T pickaxe · G build · 5–8 piece · R rotate · Y material</dd>
            <dt>Fixed-wing</dt>
            <dd>W/S pitch · A/D bank · I or Shift raises throttle · K or Ctrl lowers throttle · Ctrl also brakes</dd>
            <dt>Helicopter</dt>
            <dd>WASD fly · Space climb · Ctrl descend</dd>
          </dl>
        </div>
      )}
    </div>
  );
}
