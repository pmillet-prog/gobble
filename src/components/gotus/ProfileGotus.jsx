import React from "react";
import GotusProgress from "./GotusProgress.jsx";

export default function ProfileGotus({ progress }) {
  if (!progress) return null;
  return <section className="profile-target-quiz" aria-label="Gotus">
    <img src="/gotus/gotus-logo.webp" alt="" />
    <div><h3>Gotus</h3><GotusProgress progress={progress} /></div>
  </section>;
}
