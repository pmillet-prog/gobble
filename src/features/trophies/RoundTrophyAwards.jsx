import React from "react";
import { useFeatureRuntime, useFeatureSelector } from "../../app/react/useFeatureRuntime.js";
import { TROPHY_BY_ID } from "../../../shared/trophyCatalog.js";
import { getTrophyAwardPoints, getTrophyMetal, getTrophyRewardName } from "./trophyPresentation.js";
import TrophyArt from "./TrophyArt.jsx";
import "./trophyMetalLighting.css";
import "./trophies.css";

export default function RoundTrophyAwards() {
  const feature = useFeatureRuntime("achievements");
  const awards = useFeatureSelector(feature, state => state.roundAwards);
  if (!awards.length) return null;
  return <section className="round-trophy-awards" aria-label="Trophées obtenus pendant la manche">
    <h3>Trophées obtenus</h3>
    <ul>{awards.map(award => {
      const points = getTrophyAwardPoints(award);
      const pointsLabel = award.dev ? "Essai sans points au classement" : points !== null ? `${points.toLocaleString("fr-FR")} points au classement` : "";
      return <li key={award.eventId} className="trophy-metal-lighting" data-trophy-metal={getTrophyMetal(TROPHY_BY_ID[award.id])}>
      <TrophyArt trophy={TROPHY_BY_ID[award.id]} />
      <span><strong>{award.nick}</strong><span>{getTrophyRewardName(TROPHY_BY_ID[award.id])}</span></span>
      <b aria-label={`${award.delta} trophée${award.delta > 1 ? "s" : ""} obtenu${award.delta > 1 ? "s" : ""}${pointsLabel ? ` · ${pointsLabel}` : ""}`}>+{award.delta}
        {award.dev ? <small>Essai</small> : points !== null ? <small>+{points.toLocaleString("fr-FR")} pts</small> : null}
      </b>
    </li>;
    })}</ul>
  </section>;
}
