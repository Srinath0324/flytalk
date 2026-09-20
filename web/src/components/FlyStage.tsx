'use client';

import { useEffect, useRef } from 'react';
import type { BehaviorResult } from '../simulation/types';

export function FlyIllustration({ className = '' }: { className?: string }) {
  return <svg className={`fly-art ${className}`} viewBox="0 0 240 220" fill="none" aria-label="Cartoon fruit fly" role="img">
    <defs>
      <radialGradient id="body-shine"><stop stopColor="#66745c"/><stop offset=".65" stopColor="#303b2c"/><stop offset="1" stopColor="#161e16"/></radialGradient>
      <linearGradient id="wing-shine" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#d6efcf" stopOpacity=".64"/><stop offset="1" stopColor="#8cad88" stopOpacity=".12"/></linearGradient>
      <radialGradient id="eye-shine" cx=".3" cy=".2"><stop stopColor="#ff7a5b"/><stop offset=".6" stopColor="#df4133"/><stop offset="1" stopColor="#852522"/></radialGradient>
      <pattern id="eye-facets" width="7" height="7" patternUnits="userSpaceOnUse"><path d="M0 0L7 7M0 7L7 0" stroke="#6c1919" strokeOpacity=".25" strokeWidth=".7"/></pattern>
    </defs>
    <g className="legs legs-left" stroke="#87927a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M103 112L69 96L57 69L47 64"/><path d="M101 132L61 137L41 123L31 126"/><path d="M105 146L77 173L50 177L44 187"/>
    </g>
    <g className="legs legs-right" stroke="#87927a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M137 112L171 96L183 69L193 64"/><path d="M139 132L179 137L199 123L209 126"/><path d="M135 146L163 173L190 177L196 187"/>
    </g>
    <ellipse cx="120" cy="146" rx="26" ry="39" fill="url(#body-shine)" stroke="#7a8a6b" strokeWidth="1.5"/>
    <path d="M97 142Q120 154 143 142M97 154Q120 166 143 154M102 167Q120 176 138 167" stroke="#111b13" strokeWidth="5"/>
    <g className="wing wing-left"><path d="M117 112C102 81 46 37 30 53C10 76 65 128 113 137Z" fill="url(#wing-shine)" stroke="#c8dcbc" strokeOpacity=".6"/><path d="M111 127L37 59M104 120L59 111M83 96L64 57" stroke="#d3e3ca" strokeOpacity=".28"/></g>
    <g className="wing wing-right"><path d="M123 112C138 81 194 37 210 53C230 76 175 128 127 137Z" fill="url(#wing-shine)" stroke="#c8dcbc" strokeOpacity=".6"/><path d="M129 127L203 59M136 120L181 111M157 96L176 57" stroke="#d3e3ca" strokeOpacity=".28"/></g>
    <ellipse cx="120" cy="117" rx="24" ry="26" fill="url(#body-shine)" stroke="#8d997d"/>
    <path d="M112 99L109 134M122 96L122 136M130 101L134 130" stroke="#a5b58c" strokeOpacity=".26"/>
    <ellipse cx="120" cy="81" rx="31" ry="24" fill="#343b28"/>
    <ellipse cx="99" cy="78" rx="18" ry="24" transform="rotate(-24 99 78)" fill="url(#eye-shine)" stroke="#f28b66" strokeWidth="1"/>
    <ellipse cx="141" cy="78" rx="18" ry="24" transform="rotate(24 141 78)" fill="url(#eye-shine)" stroke="#f28b66" strokeWidth="1"/>
    <ellipse cx="99" cy="78" rx="17" ry="23" transform="rotate(-24 99 78)" fill="url(#eye-facets)"/>
    <ellipse cx="141" cy="78" rx="17" ry="23" transform="rotate(24 141 78)" fill="url(#eye-facets)"/>
    <path d="M114 63L106 42M126 63L134 42" stroke="#aaba93" strokeWidth="2" strokeLinecap="round"/>
    <circle cx="105" cy="40" r="3" fill="#aaba93"/><circle cx="135" cy="40" r="3" fill="#aaba93"/>
    <path d="M116 88Q120 94 124 88" stroke="#d2bc96" strokeWidth="2" strokeLinecap="round"/>
    <ellipse cx="94" cy="66" rx="4" ry="6" fill="#ffc7ab" opacity=".6"/><ellipse cx="136" cy="66" rx="4" ry="6" fill="#ffc7ab" opacity=".6"/>
  </svg>;
}

export function FlyStage({ behavior, ready }: { behavior: BehaviorResult; ready: boolean }) {
  const actor = useRef<HTMLDivElement>(null);
  const current = useRef(behavior);
  current.current = behavior;
  const position = useRef({ x: 50, y: 49, angle: 0, scale: 1 });
  useEffect(() => {
    let frame = 0, last = 0;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = (time: number) => {
      const delta = last ? Math.min((time - last) / 1000, 0.05) : 0;
      last = time;
      const p = position.current;
      const state = current.current.state;
      const speed = 10 + current.current.strength * 12;
      let angle = 0, scale = 1;
      if (ready && !reduce.matches) {
        if (state === 'MOVE_LEFT') { p.x -= speed * delta; angle = -75; }
        if (state === 'MOVE_RIGHT') { p.x += speed * delta; angle = 75; }
        if (state === 'APPROACH') { p.y += speed * delta * 0.5; scale = 1.22; }
        if (state === 'RETREAT') { p.y -= speed * delta * 0.5; scale = 0.83; }
        if (state === 'ESCAPE') { p.x += Math.cos(time / 330) * delta * 40; p.y += Math.sin(time / 410) * delta * 22; angle = Math.sin(time / 100) * 30; scale = 0.85; }
        if (state === 'CONFUSED') angle = Math.sin(time / 300) * 12;
      }
      p.x = Math.max(18, Math.min(82, p.x)); p.y = Math.max(28, Math.min(68, p.y));
      p.angle += (angle - p.angle) * Math.min(1, delta * 8); p.scale += (scale - p.scale) * Math.min(1, delta * 5);
      if (actor.current) { actor.current.style.left = `${p.x}%`; actor.current.style.top = `${p.y}%`; actor.current.style.transform = `translate(-50%, -50%) rotate(${p.angle}deg) scale(${p.scale})`; }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [ready]);
  return <div className={`fly-world state-${behavior.state.toLowerCase()}`}>
    <div className="world-grid"/><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="orbit orbit-three"/>
    <span className="world-cross cross-one">+</span><span className="world-cross cross-two">+</span>
    <div className="world-coordinate">ARENA 01<br/><span> D. MELANOGASTER ♂</span></div>
    <div ref={actor} className="fly-actor"><div className="fly-shadow"/><FlyIllustration/></div>
    <div className="specimen-label"><span className="tiny-line"/> ONE FLY. ZERO SOCIAL SKILLS.</div>
  </div>;
}
