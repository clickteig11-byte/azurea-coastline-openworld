import { useEffect, useRef } from 'react';
import { aiming } from '../game/aim';
import { simState } from '../game/store';

export function Reticle() {
  const { reticle, reticleSize, reticleColor } = simState.controlSettings;
  const crossRef = useRef<SVGPathElement>(null);
  const hitRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const gap = reticle === 'Dynamic Spread' ? 3 + aiming.spread * 0.63 : 3.8;
      const line = reticleSize * 0.37;
      if (crossRef.current) {
        crossRef.current.setAttribute(
          'd',
          `M ${-gap - line} 0 H ${-gap} M ${gap} 0 H ${gap + line} M 0 ${-gap - line} V ${-gap} M 0 ${gap} V ${gap + line}`
        );
      }
      if (hitRef.current) {
        const op = aiming.feedback > 0 ? Math.min(1, aiming.feedback * 8) : 0;
        hitRef.current.style.opacity = String(op);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reticle, reticleSize]);

  const gap = reticle === 'Dynamic Spread' ? 3 + aiming.spread * 0.63 : 3.8;
  const line = reticleSize * 0.37;
  const cross = `M ${-gap - line} 0 H ${-gap} M ${gap} 0 H ${gap + line} M 0 ${-gap - line} V ${-gap} M 0 ${gap} V ${gap + line}`;
  return (
    <svg className="wh-reticle" aria-hidden="true" viewBox="-30 -30 60 60" width="60" height="60" color={reticleColor}>
      <g fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round">
        {(reticle === 'Classic Cross' || reticle === 'Dynamic Spread') && <path ref={crossRef} d={cross} />}
        {reticle === 'Tactical Circle' && <circle r={reticleSize * 0.5} strokeDasharray="10 3.6" />}
        {reticle === 'Chevron' && <path d={`M ${-reticleSize * 0.48} ${reticleSize * 0.36} L 0 0 L ${reticleSize * 0.48} ${reticleSize * 0.36}`} />}
      </g>
      {reticle !== 'Chevron' && <circle r={reticle === 'Precision Dot' ? reticleSize * 0.13 : 1.1} fill="currentColor" />}
      <path
        ref={hitRef}
        d="M-12 -12 l5 5 M12 -12 l-5 5 M-12 12 l5 -5 M12 12 l-5 -5"
        fill="none"
        stroke="#fff5c2"
        strokeWidth="1.75"
        style={{ opacity: aiming.feedback > 0 ? Math.min(1, aiming.feedback * 8) : 0 }}
      />
    </svg>
  );
}
