import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const PRIMARY_COLOR = "#000";
const STROKE = 4.5;

// On utilise un seul SVG pour TOUT le mot afin de garantir l'alignement
const BoggleGobble = () => {
  const [isGobble, setIsGobble] = useState(false);

  useEffect(() => {
    // Animation automatique après 1s
    const timer = setTimeout(() => setIsGobble(true), 1000);
    return () => clearTimeout(timer);
  }, []);

  // CONFIGURATION DES TRACÉS
  // b_path : la barre verticale monte (position 0°)
  const b_path = "M 20 50 L 20 10";
  // g_path : la queue descend et tourne à gauche (position 180°)
  // On l'ajuste pour qu'après rotation de 180°, le "g" soit parfait
  const g_path = "M 20 50 L 20 85 Q 20 98 8 98";

  // Position X de chaque lettre dans le mot
  const letters = [
    { type: 'b-to-g', x: 0 },
    { type: 'o', x: 55 },
    { type: 'g-to-b', x: 105 },
    { type: 'g-to-b', x: 155 },
    { type: 'l', x: 205 },
    { type: 'e', x: 235 },
  ];

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <svg viewBox="0 0 300 120" width="600" style={{ overflow: 'visible' }}>
        {letters.map((l, i) => {
          if (l.type === 'o' || l.type === 'l' || l.type === 'e') {
            return (
              <text key={i} x={l.x} y="78" style={{ fontSize: '65px', fontWeight: '900', fontFamily: 'Arial Rounded MT Bold, sans-serif' }}>
                {l.type}
              </text>
            );
          }

          const isInitialB = l.type === 'b-to-g';
          const currentPath = isInitialB 
            ? (isGobble ? g_path : b_path) 
            : (isGobble ? b_path : g_path);

          return (
            <motion.g 
              key={i}
              initial={false}
              animate={{ rotate: isGobble ? 180 : 0, x: l.x + 25 }}
              transition={{ type: "spring", stiffness: 60, damping: 12 }}
              style={{ originX: '25px', originY: '60px' }}
            >
              {/* Panse de la lettre */}
              <circle cx="25" cy="60" r="18" fill="none" stroke={PRIMARY_COLOR} strokeWidth={STROKE} />
              
              {/* Tige / Queue avec Morphing */}
              <motion.path
                d={currentPath}
                fill="none"
                stroke={PRIMARY_COLOR}
                strokeWidth={STROKE}
                strokeLinecap="round"
                transition={{ duration: 0.3 }}
              />
            </motion.g>
          );
        })}
      </svg>
    </div>
  );
};

export default BoggleGobble;