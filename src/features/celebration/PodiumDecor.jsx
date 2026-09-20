import React from "react";

export function PodiumCrown({ className = "" }) {
  return <svg className={className} viewBox="0 0 100 76" fill="none" aria-hidden="true">
    <path d="m13 21 22 17L50 10l16 28 21-17-9 43H22Z" fill="#f9ce72" stroke="#a06422" strokeWidth="4" strokeLinejoin="round" />
    <path d="m24 55 52 0M33 45l3 7m28-7-3 7" stroke="#fff2b7" strokeWidth="4" strokeLinecap="round" />
    <path d="m50 34 7 10-7 10-7-10Z" fill="#f3935a" stroke="#a06422" strokeWidth="2" />
    {[ [12, 17], [50, 8], [88, 17] ].map(([cx, cy]) => <circle key={cx} cx={cx} cy={cy} r="5" fill="#ffe4a0" stroke="#a06422" strokeWidth="3" />)}
  </svg>;
}

export function PodiumLaurels() {
  return <svg className="podium-laurels" viewBox="0 0 240 190" fill="none" aria-hidden="true">
    <g stroke="currentColor" strokeWidth="3" strokeLinecap="round">
      <path d="M98 174C14 157 5 66 51 19M142 174C226 157 235 66 189 19" />
      {[0, 1, 2, 3, 4, 5].map(n => <g key={n} transform={`translate(${20 + n * 2} ${36 + n * 21}) rotate(${-35 + n * 12})`} fill="currentColor" stroke="none"><ellipse rx="9" ry="19" /><ellipse cx="24" cy="4" rx="8" ry="16" transform="rotate(55 24 4)" /></g>)}
      {[0, 1, 2, 3, 4, 5].map(n => <g key={n} transform={`translate(${220 - n * 2} ${36 + n * 21}) rotate(${35 - n * 12})`} fill="currentColor" stroke="none"><ellipse rx="9" ry="19" /><ellipse cx="-24" cy="4" rx="8" ry="16" transform="rotate(-55 -24 4)" /></g>)}
    </g>
  </svg>;
}

const CONFETTI = Array.from({ length: 42 }, (_, index) => ({
  left: `${(index * 37 + 9) % 100}%`, delay: `${3550 + (index % 9) * 70}ms`,
  drift: `${(index % 2 ? 1 : -1) * (30 + index % 7 * 18)}px`, turn: `${(index % 2 ? 1 : -1) * (240 + index * 27)}deg`,
  color: ["#fbe08e", "#d89e58", "#a5d5ca", "#ef9270", "#fff4c8"][index % 5],
}));
export function PodiumConfetti() {
  return <div className="podium-confetti" aria-hidden="true">{CONFETTI.map((piece, index) => <i key={index} style={{ left: piece.left, "--fall-delay": piece.delay, "--drift": piece.drift, "--turn": piece.turn, backgroundColor: piece.color }} />)}</div>;
}
