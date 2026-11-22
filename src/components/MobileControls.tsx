import { aiming } from '../game/aim';
import { construction } from '../game/building';
import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown, ArrowUp, Camera, ChevronUp, Crosshair, Footprints, Move, Repeat, Pickaxe, Boxes, Wrench, Zap,
} from 'lucide-react';
import { simState, WEAPON_SPECS } from '../game/store';
import type { VehicleMode } from '../game/worldMath';

interface MobileControlsProps {
  mode: VehicleMode;
  visible: boolean;
  vehicleHp: number;
  onSelectMode: (mode: VehicleMode) => void;
}

const sizes = { SM: 98, MD: 120, LG: 146 };
const modes: VehicleMode[] = ['FOOT', 'CAR', 'BOAT', 'PLANE'];
const nextModel = { CAR: 'cycle-car', BOAT: 'cycle-boat', PLANE: 'cycle-plane' };
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const emit = (name: string) => window.dispatchEvent(new CustomEvent(name));

function HoldButton({ label, icon: Icon, accent, onHold }: {
  label: string;
  icon: typeof ArrowUp;
  accent?: string;
  onHold: (held: boolean) => void;
}) {
  const pointer = useRef<number | null>(null);
  const [held, setHeld] = useState(false);
  const release = () => {
    pointer.current = null;
    setHeld(false);
    onHold(false);
  };
  useEffect(() => {
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('blur', release);
      onHold(false);
    };
  }, []);

  return (
    <button type="button" aria-label={label} aria-pressed={held}
      className={'touch-action-button ' + (accent ?? '')} data-held={held}
      onPointerDown={(event) => {
        if (pointer.current !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
        event.preventDefault();
        pointer.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        setHeld(true);
        onHold(true);
      }}
      onPointerUp={(event) => { if (pointer.current === event.pointerId) release(); }}
      onPointerCancel={(event) => { if (pointer.current === event.pointerId) release(); }}
      onLostPointerCapture={(event) => { if (pointer.current === event.pointerId) release(); }}>
      <Icon size={20} strokeWidth={2} />
      <span>{label}</span>
    </button>
  );
}

function setTouchKey(key: string, held: boolean) {
  if (held) simState.touchKeys.add(key);
  else simState.touchKeys.delete(key);
}

export function MobileControls({ mode, visible, vehicleHp, onSelectMode }: MobileControlsProps) {
  const [size, setSize] = useState(() => simState.controlSettings.joystickSize);
  const pad = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const stickPointer = useRef<number | null>(null);
  const stickBounds = useRef<DOMRect | null>(null);
  const orbitPointer = useRef<{ id: number; x: number; y: number } | null>(null);

  const releaseStick = () => {
    stickPointer.current = null;
    stickBounds.current = null;
    simState.analogMoveX = simState.analogMoveY = 0;
    if (knob.current) knob.current.style.transform = '';
    if (pad.current) delete pad.current.dataset.active;
  };

  useEffect(() => {
    const syncSize = () => setSize(simState.controlSettings.joystickSize);
    const release = () => {
      releaseStick();
      orbitPointer.current = null;
      simState.touchThrottle = 0;
      simState.touchBrake = false;
      simState.touchKeys.clear();
    };
    const onVisibility = () => { if (document.hidden) release(); };
    const onResize = () => { stickBounds.current = pad.current?.getBoundingClientRect() ?? null; };
    window.addEventListener('controls-updated', syncSize);
    window.addEventListener('blur', release);
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      release();
      window.removeEventListener('controls-updated', syncSize);
      window.removeEventListener('blur', release);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
  useEffect(() => {
    if (!visible) {
      releaseStick();
      orbitPointer.current = null;
    }
  }, [visible]);

  const moveStick = (x: number, y: number) => {
    const rect = stickBounds.current ?? pad.current?.getBoundingClientRect();
    if (!rect) return;
    const radius = rect.width * 0.34;
    const offsetX = x - rect.left - rect.width / 2;
    const offsetY = y - rect.top - rect.height / 2;
    const distance = Math.hypot(offsetX, offsetY);
    const multiplier = distance > radius ? radius / distance : 1;
    const strength = Math.pow(clamp((distance / radius - 0.105) / 0.895, 0, 1), 1.16) / Math.max(1, distance);
    simState.analogMoveX = offsetX * strength;
    simState.analogMoveY = -offsetY * strength;
    if (knob.current) knob.current.style.transform = 'translate3d(' + offsetX * multiplier + 'px,' + offsetY * multiplier + 'px,0)';
  };

  const resetCamera = () => {
    simState.orbitYaw = simState.orbitPitch = 0;
    simState.cameraView = (simState.cameraView + 1) % 2;
  };

  if (!visible) return null;
  const flying = mode === 'PLANE';
  const foot = mode === 'FOOT';
  const boat = mode === 'BOAT';

  return (
    <div className="touch-game-controls" aria-label="Touch controls">
      <div className="touch-orbit-area" aria-label="Drag to orbit camera"
        onPointerDown={(event) => {
          if (orbitPointer.current || (event.pointerType === 'mouse' && event.button !== 0)) return;
          event.preventDefault();
          orbitPointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const last = orbitPointer.current;
          if (last?.id !== event.pointerId) return;
          const scale = 0.008 * simState.controlSettings.mouseSensitivity * (aiming.ads ? 0.53 : 1) * clamp(420 / Math.min(window.innerWidth, window.innerHeight), 0.68, 1.32);
          simState.orbitYaw -= (event.clientX - last.x) * scale;
          simState.orbitPitch = clamp(simState.orbitPitch + (event.clientY - last.y) * scale, -0.92, 0.96);
          last.x = event.clientX;
          last.y = event.clientY;
        }}
        onPointerUp={(event) => { if (orbitPointer.current?.id === event.pointerId) orbitPointer.current = null; }}
        onPointerCancel={(event) => { if (orbitPointer.current?.id === event.pointerId) orbitPointer.current = null; }}
        onLostPointerCapture={(event) => { if (orbitPointer.current?.id === event.pointerId) orbitPointer.current = null; }}
      />

      <div className="touch-stick" role="application" aria-label="Analog joystick" ref={pad}
        style={{ '--stick-size': sizes[size] + 'px' } as React.CSSProperties}
        onPointerDown={(event) => {
          if (stickPointer.current !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
          event.preventDefault();
          stickPointer.current = event.pointerId;
          stickBounds.current = event.currentTarget.getBoundingClientRect();
          event.currentTarget.dataset.active = 'true';
          event.currentTarget.setPointerCapture(event.pointerId);
          moveStick(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => { if (stickPointer.current === event.pointerId) moveStick(event.clientX, event.clientY); }}
        onPointerUp={(event) => { if (stickPointer.current === event.pointerId) releaseStick(); }}
        onPointerCancel={releaseStick} onLostPointerCapture={releaseStick}>
        <span className="touch-stick-ring" />
        <div className="touch-stick-knob" ref={knob}><Move size={17} strokeWidth={1.6} /></div>
      </div>

      <div className="touch-actions" key={mode}>
        <div className="touch-utilities">
          {!foot && vehicleHp < 100 && <button type="button" aria-label="Repair vehicle" className="touch-action-button touch-repair"
            onClick={() => emit('repair-vehicle')}><Wrench size={15} /><span>Repair</span></button>}
          {foot && <>
            <button type="button" aria-label="Equip pickaxe" className="touch-action-button" data-held={construction.pickaxe && !construction.active}
              onClick={() => { construction.pickaxe = !construction.pickaxe; construction.active = false; }}><Pickaxe size={16} /><span>Pickaxe</span></button>
            <button type="button" aria-label="Toggle build mode" className="touch-action-button" data-held={construction.active}
              onClick={() => { construction.active = !construction.active; }}><Boxes size={16} /><span>Build</span></button>
          </>}
          <button type="button" aria-label="Next vehicle or weapon" className="touch-action-button" onClick={() => {
            if (mode === 'FOOT') { construction.active = false; construction.pickaxe = false; window.dispatchEvent(new CustomEvent('select-weapon', { detail: (simState.activeWeaponIdx + 1) % WEAPON_SPECS.length })); }
            else emit(nextModel[mode]);
          }}><Repeat size={16} /><span>{foot ? 'Gear' : 'Model'}</span></button>
          <button type="button" aria-label="Switch travel mode" className="touch-action-button"
            onClick={() => onSelectMode(modes[(modes.indexOf(mode) + 1) % modes.length])}><Footprints size={16} /><span>Mode</span></button>
          <button type="button" aria-label="Switch camera view" className="touch-action-button"
            onClick={resetCamera}><Camera size={16} /><span>View</span></button>
        </div>
        <div className="touch-primary">
          {foot && !construction.active && !construction.pickaxe && <HoldButton label="ADS" icon={Crosshair} onHold={(held) => { aiming.ads = held; }} />}
          {foot ? <HoldButton label={construction.active ? 'Place' : construction.pickaxe ? 'Swing' : 'Fire'} icon={Crosshair} accent="touch-fire" onHold={(held) => {
            setTouchKey('KeyF', held);
            if (held) emit('fire-weapon');
          }} /> : <HoldButton label={flying ? simState.activePlaneIdx === 1 ? 'Down' : 'Airbrake' : 'Brake'} icon={ArrowDown} onHold={(held) => { simState.touchBrake = held; }} />}
          {!foot && <HoldButton label={flying ? simState.activePlaneIdx === 1 ? 'Forward' : 'Power' : 'Gas'} icon={ChevronUp} accent="touch-throttle"
            onHold={(held) => { simState.touchThrottle = held ? 1 : 0; }} />}
          {!boat && <HoldButton label={foot ? 'Jump' : flying ? 'Climb' : 'Drift'} icon={ArrowUp}
            onHold={(held) => setTouchKey('Space', held)} />}
          <HoldButton label={foot ? 'Sprint' : 'Boost'} icon={Zap} accent="touch-boost" onHold={(held) => setTouchKey('ShiftLeft', held)} />
          {!foot && !flying && !boat && <HoldButton label="Fire" icon={Crosshair} accent="touch-fire"
            onHold={(held) => { setTouchKey('KeyF', held); if (held) emit('fire-weapon'); }} />}
        </div>
      </div>
    </div>
  );
}
