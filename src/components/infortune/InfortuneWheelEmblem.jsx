import React from 'react';
import './infortuneWheelEmblem.css';

export default function InfortuneWheelEmblem({ size = 86, spinning = false }) {
  return <span className="infortune-wheel-emblem" data-spinning={spinning} style={{ '--wheel-emblem-size': `${size}px` }} aria-hidden="true">
    <span className="infortune-wheel-emblem__pointer" />
    <span className="infortune-wheel-emblem__disc"><i>✦</i></span>
  </span>;
}
