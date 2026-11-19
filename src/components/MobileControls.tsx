import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  Crosshair,
  Flame,
  Repeat,
  Umbrella,
  Zap,
} from 'lucide-react';
import { simState, WEAPON_SPECS } from '../game/store';
import type { VehicleMode } from '../game/worldMath';

export interface MobileControlsProps {
  mode: VehicleMode;
  gameMode: string;
  visible: boolean;
}

const JOYSTICK_SIZE = 124;
const KNOB_SIZE = 52;
const MAX_RADIUS = (JOYSTICK_SIZE - KNOB_SIZE) / 2; // 36px
const DEADZONE = 0.22;

const MOVEMENT_KEYS = ['KeyW', 'KeyS', 'KeyA', 'KeyD'] as const;
const ACTION_KEYS = ['ShiftLeft', 'Space', 'KeyF'] as const;

function clearMovementKeys() {
  for (const key of MOVEMENT_KEYS) {
    simState.keys.delete(key);
  }
}

function clearActionKeys() {
  for (const key of ACTION_KEYS) {
    simState.keys.delete(key);
  }
}

export function MobileControls({ mode, gameMode, visible }: MobileControlsProps) {
  // Virtual joystick state
  const padRef = useRef<HTMLDivElement | null>(null);
  const joyPointerIdRef = useRef<number | null>(null);
  const [knobPos, setKnobPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [joyActive, setJoyActive] = useState(false);

  // Action button pressed states for tactile visual feedback
  const [boostPressed, setBoostPressed] = useState(false);
  const [spacePressed, setSpacePressed] = useState(false);
  const [firePressed, setFirePressed] = useState(false);

  const showFire = mode === 'FOOT' || mode === 'CAR' || gameMode === 'BATTLE_ROYALE';
  const showDrop = gameMode === 'BATTLE_ROYALE' || mode === 'FOOT';

  // Ensure no keys ever stick on hide or unmount
  useEffect(() => {
    if (!visible) {
      joyPointerIdRef.current = null;
      setKnobPos({ x: 0, y: 0 });
      setJoyActive(false);
      setBoostPressed(false);
      setSpacePressed(false);
      setFirePressed(false);
      clearMovementKeys();
      clearActionKeys();
    }
    return () => {
      clearMovementKeys();
      clearActionKeys();
    };
  }, [visible]);

  // If Fire button disappears while held, release KeyF cleanly
  useEffect(() => {
    if (!showFire) {
      simState.keys.delete('KeyF');
      setFirePressed(false);
    }
  }, [showFire]);

  const updateJoystickFromClient = useCallback((clientX: number, clientY: number) => {
    const pad = padRef.current;
    if (!pad) return;
    const rect = pad.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    let offsetX = clientX - cx;
    let offsetY = clientY - cy;
    const dist = Math.hypot(offsetX, offsetY);

    if (dist > MAX_RADIUS) {
      const scale = MAX_RADIUS / dist;
      offsetX *= scale;
      offsetY *= scale;
    }

    setKnobPos({ x: offsetX, y: offsetY });

    const dx = offsetX / MAX_RADIUS;
    const dy = offsetY / MAX_RADIUS;

    if (dy < -DEADZONE) simState.keys.add('KeyW');
    else simState.keys.delete('KeyW');

    if (dy > DEADZONE) simState.keys.add('KeyS');
    else simState.keys.delete('KeyS');

    if (dx < -DEADZONE) simState.keys.add('KeyA');
    else simState.keys.delete('KeyA');

    if (dx > DEADZONE) simState.keys.add('KeyD');
    else simState.keys.delete('KeyD');
  }, []);

  const releaseJoystick = useCallback(() => {
    joyPointerIdRef.current = null;
    setKnobPos({ x: 0, y: 0 });
    setJoyActive(false);
    clearMovementKeys();
  }, []);

  const handleJoyPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (joyPointerIdRef.current !== null) return;
      joyPointerIdRef.current = e.pointerId;
      e.currentTarget.setPointerCapture(e.pointerId);
      setJoyActive(true);
      updateJoystickFromClient(e.clientX, e.clientY);
    },
    [updateJoystickFromClient]
  );

  const handleJoyPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (joyPointerIdRef.current !== e.pointerId) return;
      e.preventDefault();
      e.stopPropagation();
      updateJoystickFromClient(e.clientX, e.clientY);
    },
    [updateJoystickFromClient]
  );

  const handleJoyPointerEnd = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (joyPointerIdRef.current !== e.pointerId) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      releaseJoystick();
    },
    [releaseJoystick]
  );

  // Hold-button helpers (ShiftLeft, Space, KeyF)
  const makeHoldHandlers = useCallback(
    (
      keyCode: 'ShiftLeft' | 'Space' | 'KeyF',
      setPressed: React.Dispatch<React.SetStateAction<boolean>>,
      onPressExtra?: () => void
    ) => ({
      onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        simState.keys.add(keyCode);
        setPressed(true);
        onPressExtra?.();
      },
      onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
        simState.keys.delete(keyCode);
        setPressed(false);
      },
      onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
        simState.keys.delete(keyCode);
        setPressed(false);
      },
      onLostPointerCapture: () => {
        simState.keys.delete(keyCode);
        setPressed(false);
      },
    }),
    []
  );

  const boostHandlers = makeHoldHandlers('ShiftLeft', setBoostPressed);
  const spaceHandlers = makeHoldHandlers('Space', setSpacePressed);
  const fireHandlers = makeHoldHandlers('KeyF', setFirePressed, () => {
    window.dispatchEvent(new CustomEvent('fire-weapon'));
  });

  const handleCycleAction = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (mode === 'CAR') {
        window.dispatchEvent(new CustomEvent('cycle-car'));
      } else if (mode === 'BOAT') {
        window.dispatchEvent(new CustomEvent('cycle-boat'));
      } else if (mode === 'PLANE') {
        window.dispatchEvent(new CustomEvent('cycle-plane'));
      } else {
        const nextIdx = (simState.activeWeaponIdx + 1) % WEAPON_SPECS.length;
        window.dispatchEvent(new CustomEvent('select-weapon', { detail: nextIdx }));
      }
    },
    [mode]
  );

  const handleSkyDrop = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('br-drop'));
  }, []);

  if (!visible) return null;

  const spaceLabel =
    mode === 'FOOT'
      ? 'Jump'
      : mode === 'CAR'
        ? 'Drift'
        : mode === 'BOAT'
          ? 'Brake'
          : 'Climb';

  const boostLabel = mode === 'FOOT' ? 'Sprint' : 'Boost';

  const cycleLabel =
    mode === 'CAR'
      ? 'Car'
      : mode === 'BOAT'
        ? 'Boat'
        : mode === 'PLANE'
          ? 'Plane'
          : 'Gun';

  return (
    <>
      {/* Left Thumb — Virtual 360° Analog Joystick */}
      <div
        ref={padRef}
        role="application"
        aria-label="Virtual movement joystick"
        onPointerDown={handleJoyPointerDown}
        onPointerMove={handleJoyPointerMove}
        onPointerUp={handleJoyPointerEnd}
        onPointerCancel={handleJoyPointerEnd}
        onLostPointerCapture={releaseJoystick}
        style={{ width: JOYSTICK_SIZE, height: JOYSTICK_SIZE }}
        className={`fixed bottom-6 left-5 z-40 flex items-center justify-center rounded-full border backdrop-blur-md touch-none select-none transition-colors duration-150 ${
          joyActive
            ? 'border-white/40 bg-neutral-950/65 shadow-[0_0_24px_rgba(255,255,255,0.14)]'
            : 'border-white/20 bg-neutral-950/55 shadow-[0_8px_28px_rgba(0,0,0,0.45)]'
        }`}
      >
        {/* Subtle inner guide ring & directional pips */}
        <div className="pointer-events-none absolute inset-3 rounded-full border border-white/10" />
        <span className="pointer-events-none absolute top-2.5 h-1.5 w-1.5 rounded-full bg-white/30" />
        <span className="pointer-events-none absolute bottom-2.5 h-1.5 w-1.5 rounded-full bg-white/30" />
        <span className="pointer-events-none absolute left-2.5 h-1.5 w-1.5 rounded-full bg-white/30" />
        <span className="pointer-events-none absolute right-2.5 h-1.5 w-1.5 rounded-full bg-white/30" />

        {/* Draggable Thumb Knob */}
        <div
          style={{
            width: KNOB_SIZE,
            height: KNOB_SIZE,
            transform: `translate3d(${knobPos.x}px, ${knobPos.y}px, 0)`,
          }}
          className={`pointer-events-none flex items-center justify-center rounded-full border transition-[background-color,box-shadow] duration-100 ${
            joyActive
              ? 'border-white/80 bg-white/40 shadow-[0_0_16px_rgba(255,255,255,0.4)]'
              : 'border-white/45 bg-white/25 shadow-[0_4px_14px_rgba(0,0,0,0.4)]'
          }`}
        >
          <div className="h-4 w-4 rounded-full bg-white/60" />
        </div>
      </div>

      {/* Right Thumb — Ergonomic Tactile Action Buttons */}
      <div className="pointer-events-none fixed bottom-6 right-5 z-40 flex flex-col items-end gap-2.5">
        {/* Top utility row: Sky-Drop & Next Vehicle / Next Gun */}
        <div className="pointer-events-auto flex items-center gap-2.5">
          {showDrop && (
            <button
              type="button"
              aria-label="Sky-Drop Parachute"
              onPointerDown={handleSkyDrop}
              className="flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-full border border-sky-300/35 bg-neutral-950/60 text-sky-200 shadow-[0_6px_20px_rgba(0,0,0,0.45)] backdrop-blur-md touch-none select-none active:scale-95 active:border-sky-200/70 active:bg-sky-500/30"
            >
              <Umbrella className="h-4 w-4" strokeWidth={2.2} />
              <span className="text-[9px] font-semibold uppercase tracking-wider leading-none">
                Drop
              </span>
            </button>
          )}

          <button
            type="button"
            aria-label={`Next ${cycleLabel}`}
            onPointerDown={handleCycleAction}
            className="flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-full border border-white/25 bg-neutral-950/60 text-white/90 shadow-[0_6px_20px_rgba(0,0,0,0.45)] backdrop-blur-md touch-none select-none active:scale-95 active:border-white/60 active:bg-white/20"
          >
            <Repeat className="h-4 w-4" strokeWidth={2.2} />
            <span className="text-[9px] font-semibold uppercase tracking-wider leading-none">
              {cycleLabel}
            </span>
          </button>
        </div>

        {/* Primary thumb arc: Fire, Jump/Drift/Brake/Climb, Boost/Sprint */}
        <div className="pointer-events-auto flex items-end gap-2.5">
          {showFire && (
            <button
              type="button"
              aria-label="Fire Weapon"
              {...fireHandlers}
              className={`flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-full border shadow-[0_8px_24px_rgba(0,0,0,0.5)] backdrop-blur-md touch-none select-none transition-transform duration-75 ${
                firePressed
                  ? 'scale-95 border-rose-300/80 bg-rose-500/45 text-white shadow-[0_0_20px_rgba(244,63,94,0.55)]'
                  : 'border-rose-400/35 bg-neutral-950/65 text-rose-200'
              }`}
            >
              <Crosshair className="h-5 w-5" strokeWidth={2.2} />
              <span className="text-[9px] font-bold uppercase tracking-wider leading-none">
                Fire
              </span>
            </button>
          )}

          <button
            type="button"
            aria-label={spaceLabel}
            {...spaceHandlers}
            className={`flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-full border shadow-[0_8px_24px_rgba(0,0,0,0.5)] backdrop-blur-md touch-none select-none transition-transform duration-75 ${
              spacePressed
                ? 'scale-95 border-white/80 bg-white/30 text-white shadow-[0_0_18px_rgba(255,255,255,0.35)]'
                : 'border-white/25 bg-neutral-950/65 text-white/95'
            }`}
          >
            {mode === 'CAR' ? (
              <Flame className="h-5 w-5" strokeWidth={2.2} />
            ) : (
              <ArrowUp className="h-5 w-5" strokeWidth={2.2} />
            )}
            <span className="text-[9px] font-bold uppercase tracking-wider leading-none">
              {spaceLabel}
            </span>
          </button>

          <button
            type="button"
            aria-label={boostLabel}
            {...boostHandlers}
            className={`flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-full border shadow-[0_8px_24px_rgba(0,0,0,0.5)] backdrop-blur-md touch-none select-none transition-transform duration-75 ${
              boostPressed
                ? 'scale-95 border-amber-200/90 bg-amber-400/45 text-white shadow-[0_0_22px_rgba(251,191,36,0.6)]'
                : 'border-amber-300/35 bg-neutral-950/65 text-amber-200'
            }`}
          >
            <Zap className="h-5 w-5" strokeWidth={2.2} />
            <span className="text-[9px] font-bold uppercase tracking-wider leading-none">
              {boostLabel}
            </span>
          </button>
        </div>
      </div>
    </>
  );
}
