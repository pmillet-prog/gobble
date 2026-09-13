import React from "react";

const paths = {
  back: "m14 5-7 7 7 7M7 12h14",
  mail: "M3 5h18v14H3V5Zm0 1 9 7 9-7",
  write: "m4 20 4-1L20 7a2.1 2.1 0 0 0-3-3L5 16l-1 4Zm11-14 3 3M4 22h16",
  draw: "M4 16c5-12 10-14 9-8s-9 12-5 12 9-13 10-8-1 7 3 5",
  browse: "M3 12h18M7 8l-4 4 4 4m10-8 4 4-4 4",
  sponge: "M3 8a3 3 0 0 1 3-3h2a2 2 0 0 0 4 0h6a3 3 0 0 1 3 3v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Zm0 7h18M7 9h.01M15 9h.01M10 12h.01M18 12h.01",
  undo: "M8 4 3 9l5 5M3 9h10a7 7 0 0 1 0 14",
  erase: "m4 13 9-9a2 2 0 0 1 3 0l5 5a2 2 0 0 1 0 3l-8 8H9l-5-4a2 2 0 0 1 0-3Zm4-4 9 9M13 20h9",
  close: "m6 6 12 12M6 18 18 6",
  check: "m4 12 5 5L20 6",
};

export default function ChalkboardIcon({ name }) {
  return <svg className="chalkboard-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.write} /></svg>;
}
