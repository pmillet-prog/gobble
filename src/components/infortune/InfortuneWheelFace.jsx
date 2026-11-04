import React from "react";
import { PEG_COUNT, SLOTS_PER_SECTOR, TAU, WHEEL_SECTORS } from "../../features/infortune/wheelConfig.js";
import InfortuneGoldSector from "./InfortuneGoldSector.jsx";
import { WHEEL_GEOMETRY } from "../../features/infortune/wheelGeometry.js";
import InfortunePawl from "./InfortunePawl.jsx";

const point = (radius, angle) => `${Math.sin(angle) * radius} ${-Math.cos(angle) * radius}`;
function wedge(start, end) {
  return `M ${point(72, start)} L ${point(250, start)} A 250 250 0 0 1 ${point(250, end)} L ${point(72, end)} A 72 72 0 0 0 ${point(72, start)} Z`;
}

export default React.memo(function InfortuneWheelFace({ surface, rotor, pawl, id }) {
  const sectorAngle = TAU / WHEEL_SECTORS.length;
  return <svg ref={surface} className="infortune__wheel" viewBox="0 0 640 640" role="img"
    aria-labelledby={`${id}-title ${id}-description`}>
    <title id={`${id}-title`}>La roue de l’infortune</title>
    <desc id={`${id}-description`}>24 secteurs, dont Bonus, Banqueroute et Passe sans gain. Faites glisser le bord de la roue puis lâchez, ou utilisez le bouton de lancer.</desc>
    <defs>
      <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="0.8" y2="1">
        <stop stopColor="#fff1c6" /><stop offset="0.22" stopColor="#bb8844" />
        <stop offset="0.5" stopColor="#f4d596" /><stop offset="0.75" stopColor="#92642d" /><stop offset="1" stopColor="#f3d09a" />
      </linearGradient>
      <radialGradient id={`${id}-peg`} cx="0.32" cy="0.25" r="0.75">
        <stop stopColor="#ffffff" /><stop offset="0.3" stopColor="#e7eef5" />
        <stop offset="0.6" stopColor="#a6b2c1" /><stop offset="0.84" stopColor="#647384" /><stop offset="1" stopColor="#303c4b" />
      </radialGradient>
      <radialGradient id={`${id}-gloss`} cx="0.35" cy="0.2" r="0.85"><stop stopColor="white" stopOpacity="0.24" /><stop offset="0.6" stopColor="white" stopOpacity="0" /><stop offset="1" stopColor="#100b20" stopOpacity="0.18" /></radialGradient>
      <linearGradient id={`${id}-pointer`} gradientUnits="userSpaceOnUse" x1="-8" y1="0" x2="14" y2="50"><stop stopColor="#ffe5a2" /><stop offset="0.4" stopColor="#fbb345" /><stop offset="1" stopColor="#d67d28" /></linearGradient>
    </defs>
    <circle cx="320" cy="340" r="296" fill="#070c16" opacity="0.7" />
    <circle cx="320" cy="334" r="293" fill={`url(#${id}-metal)`} />
    <circle cx="320" cy="334" r="287" fill="#201e29" stroke="#fff0bf" strokeOpacity="0.55" />
    {Array.from({ length: 48 }, (_, index) => <circle key={index} cx={320 + Math.sin(index * TAU / 48) * 284}
      cy={334 - Math.cos(index * TAU / 48) * 284} r="2.2" fill="#ffe6b3" opacity={index % 2 ? 0.55 : 1} />)}
    <g ref={rotor} transform={`translate(${WHEEL_GEOMETRY.centerX} ${WHEEL_GEOMETRY.centerY})`}>
      <circle r="277" fill={`url(#${id}-metal)`} />
      <circle r="272" fill="#252535" stroke="#6d583e" strokeWidth="2" />
      <circle r="260" fill="#e9d7b4" />
      {WHEEL_SECTORS.map((sector, index) => {
        const golden = sector.kind === "bonus" || sector.amount === 1000;
        return <g key={sector.id}>
        <path d={wedge(index * sectorAngle, (index + 1) * sectorAngle)} fill={sector.color} stroke="#fff5df" strokeWidth="1.3" />
        <g transform={`rotate(${(index + 0.5) * 360 / WHEEL_SECTORS.length})`} fill={sector.kind === "bankrupt" ? "#fff2d7" : "#202537"}>
          {golden ? <InfortuneGoldSector id={`${id}-gold-${index}`} sectorAngle={sectorAngle} /> : null}
          <g className={golden ? "infortune__gold-label" : undefined}>
          {sector.kind === "bankrupt" ? <text transform="translate(0 -164) rotate(90)" textAnchor="middle" dominantBaseline="central" className="infortune__bankrupt-label">BANQUEROUTE</text>
            : sector.kind !== "amount" ? Array.from(sector.label.toLocaleUpperCase("fr-FR")).map((letter, i) => <text key={i} x="0" y={-221 + i * 25} textAnchor="middle" className="infortune__bonus-letter">{letter}</text>)
              : <>{String(sector.amount).split("").map((digit, i) => <text key={i} x="0" y={-216 + i * 29} textAnchor="middle" className="infortune__digit">{digit}</text>)}
                <text x="0" y="-98" textAnchor="middle" className="infortune__euro">€</text></>}
          </g>
        </g>
      </g>;
      })}
      <circle r="250" fill={`url(#${id}-gloss)`} pointerEvents="none" />
      <circle r="251" fill="none" stroke="#fff4cf" strokeWidth="3" />
      <circle r="261" fill="none" stroke="#8e744e" strokeWidth="1" />
      {Array.from({ length: PEG_COUNT }, (_, index) => <g key={index} transform={`rotate(${index * 360 / PEG_COUNT})`}>
        <path d="M 0 -250 L 0 -260" stroke={index % SLOTS_PER_SECTOR ? "#9e885f" : "#fff8dd"} strokeWidth={index % SLOTS_PER_SECTOR ? 1 : 2} />
        <circle cx="1.2" cy={-WHEEL_GEOMETRY.pegOrbit + 1.4} r={WHEEL_GEOMETRY.pegRadius + 0.6} fill="#080a16" opacity="0.6" />
        <circle cy={-WHEEL_GEOMETRY.pegOrbit} r={WHEEL_GEOMETRY.pegRadius} fill={`url(#${id}-peg)`} />
        <circle cy={-WHEEL_GEOMETRY.pegOrbit} r={WHEEL_GEOMETRY.pegRadius - 0.65} fill="none" stroke="#d9e4ed" strokeWidth="0.45" opacity="0.65" />
      </g>)}
    </g>
    <circle cx="320" cy="338" r="79" fill="#171220" opacity="0.35" />
    <circle cx="320" cy="334" r="76" fill={`url(#${id}-metal)`} />
    <circle cx="320" cy="334" r="68" fill="#f9edcf" stroke="#86623b" strokeWidth="1" />
    <circle cx="320" cy="334" r="62" fill="none" stroke="#c2a276" strokeWidth="1" />
    <text x="320" y="319" textAnchor="middle" className="infortune__hub-small">À VOUS DE</text>
    <text x="320" y="347" textAnchor="middle" className="infortune__hub-title">JOUER</text>
    <path d="M 299 360 H 312 M 328 360 H 341" stroke="#a9773a" />
    <path d="m 320 355 4 5 -4 5 -4 -5 z" fill="#a9773a" />
    <InfortunePawl pawl={pawl} id={id} />
  </svg>;
});
