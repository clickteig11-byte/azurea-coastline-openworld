import { AIM_MODES, RETICLES } from '../game/aim';
import type { ControlSettings } from '../game/store';

export function PlaySettings({ settings, update, full = false }: {
  settings: ControlSettings; update: (patch: Partial<ControlSettings>) => void; full?: boolean;
}) {
  return <div className="wh-settings">
    <label>Aim assist<select value={settings.aimAssist} onChange={(e) => update({ aimAssist: e.target.value as ControlSettings['aimAssist'] })}>
      {AIM_MODES.map((mode) => <option key={mode}>{mode}</option>)}</select></label>
    <label>Crosshair<select value={settings.reticle} onChange={(e) => update({ reticle: e.target.value as ControlSettings['reticle'] })}>
      {RETICLES.map((style) => <option key={style}>{style}</option>)}</select></label>
    <label>Crosshair color<input type="color" value={settings.reticleColor} onChange={(e) => update({ reticleColor: e.target.value })} /></label>
    <label>Crosshair size<input type="range" min={10} max={30} value={settings.reticleSize} onChange={(e) => update({ reticleSize: Number(e.target.value) })} /></label>
    <label>Look sensitivity<input type="range" min={0.3} max={2.3} step={0.05} value={settings.mouseSensitivity} onChange={(e) => update({ mouseSensitivity: Number(e.target.value) })} /></label>
    <label>Blood effects<input type="checkbox" checked={settings.blood} onChange={(e) => update({ blood: e.target.checked })} /></label>
    <label>Graphics<select value={settings.graphics} onChange={(e) => update({ graphics: e.target.value as ControlSettings['graphics'] })}>
      <option>Performance</option><option>Balanced</option><option>High</option>
    </select></label>
    <label>Mute audio<input type="checkbox" checked={settings.audioMuted} onChange={(e) => update({ audioMuted: e.target.checked })} /></label>
    {full && <>
      <label>Steering<input type="range" min={0.4} max={2} step={0.05} value={settings.steeringSensitivity}
        onChange={(e) => update({ steeringSensitivity: Number(e.target.value) })} /></label>
      <label>Throttle<input type="range" min={0.5} max={1.8} step={0.05} value={settings.throttleSensitivity}
        onChange={(e) => update({ throttleSensitivity: Number(e.target.value) })} /></label>
      <label>Camera smoothness<input type="range" min={0.4} max={2} step={0.05} value={settings.cameraSmoothness}
        onChange={(e) => update({ cameraSmoothness: Number(e.target.value) })} /></label>
      <label>Invert flight pitch<input type="checkbox" checked={settings.invertFlightY} onChange={(e) => update({ invertFlightY: e.target.checked })} /></label>
      <p>WASD move · X camera · Right mouse aim · T pickaxe · G build · 5–8 choose piece · R rotate · Y material</p>
    </>}
  </div>;
}
