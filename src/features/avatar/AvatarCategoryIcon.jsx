import React from "react";

const PATHS = {
  accessories: "M3 6h18v15H3zM8 6V3h8v3M6 11h12M6 15h8",
  headwear: "M5 15 7 5h10l2 10M6 12h12M3 15c-1 1-1 2 0 3 4 3 14 3 18 0 1-1 1-2 0-3-5 2-13 2-18 0Z",
  glasses: "M2 12 4 6h3m15 6-2-6h-3M9 13c2-2 4-2 6 0M2 12h7v4c0 4-7 4-7 0v-4Zm13 0h7v4c0 4-7 4-7 0v-4Z",
  clothes: "m8 3-6 4 3 5 3-2v11h8V10l3 2 3-5-6-4c-1 4-7 4-8 0Z",
  lashes: "M3 11c5 6 13 6 18 0M5 13l-2 3m6-1-1 4m7-4 1 4m3-6 2 3",
};

export default function AvatarCategoryIcon({ category, fallback }) {
  return PATHS[category]
    ? <svg className="avatar-category-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={PATHS[category]} /></svg>
    : <span className="material-symbols-outlined" aria-hidden="true">{fallback}</span>;
}
