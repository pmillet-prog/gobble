import React from 'react';

export default function useLeaderWalkLayout(count) {
  const ref = React.useRef(null);
  const [layout, setLayout] = React.useState({ columns: Math.max(1, Math.min(count, 3)), rows: 1, scale: .7 });
  React.useLayoutEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      let best = { columns: 1, rows: Math.max(1, count), scale: 0 };
      for (let columns = count <= 3 ? Math.max(1, count) : 1; columns <= Math.max(1, count); columns++) {
        const rows = Math.max(1, Math.ceil(count / columns));
        const scale = Math.min(1.1, (width / columns - 14) / 200, (height / rows - 36) / 210);
        if (scale > best.scale) best = { columns, rows, scale };
      }
      setLayout(best);
    });
    observer.observe(ref.current); return () => observer.disconnect();
  }, [count]);
  return { ref, ...layout };
}
