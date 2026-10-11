import React from "react";
import { TROPHY_CATALOG, TROPHY_SLOT_COUNT, TROPHY_BY_ID, TROPHY_CATEGORY_BY_ID } from "../../../shared/trophyCatalog.js";
import { useFeatureRuntime, useFeatureSelector } from "../../app/react/useFeatureRuntime.js";
import { getDisplayedTrophyReward, getTrophyCollection, getTrophyCountLabel, getTrophyRewardName, getTrophyMetal } from "./trophyPresentation.js";
import TrophySpotlight from "./TrophySpotlight.jsx";
import TrophyTierDetails from "./TrophyTierDetails.jsx";
import TrophyArt from "./TrophyArt.jsx";
import "./trophies.css";

const COLUMNS = [15.15, 29.1, 43, 57.2, 71.1, 85.1];
const ROWS = [{ base: 24.5, medal: 27.1 }, { base: 47.2, medal: 49.7 }, { base: 69.7, medal: 72.8 }, { base: 89.8, medal: 92.8 }];
const EMPTY_COUNTS = Object.freeze({});
const format = value => value.toLocaleString("fr-FR");

export default function ProfileTrophyShelf({ achievements, userId }) {
  const feature = useFeatureRuntime("achievements");
  const liveCounts = useFeatureSelector(feature, state => Number(userId) === state.userId ? state.counts : EMPTY_COUNTS);
  const devCounts = useFeatureSelector(feature, state => Number(userId) === state.userId ? state.devCounts || EMPTY_COUNTS : EMPTY_COUNTS);
  const collection = React.useMemo(() => getTrophyCollection(achievements, liveCounts, devCounts), [achievements, liveCounts, devCounts]);
  const [selectedId, setSelectedId] = React.useState(null);
  const [expandedRewardId, setExpandedRewardId] = React.useState(null);
  const returnFocusRef = React.useRef(null);
  const closeSpotlight = React.useCallback(() => setExpandedRewardId(null), []);
  const selected = TROPHY_CATALOG.find(trophy => trophy.id === selectedId);
  const expanded = TROPHY_BY_ID[expandedRewardId];
  const selectedReward = expanded || (selected ? getDisplayedTrophyReward(selected, collection.counts) : null);
  const descriptionId = React.useId();
  return <section className="profile-trophy-collection" aria-label="Étagère de trophées">
    <div className="profile-section-heading"><span>L’étagère des exploits</span><small>{format(collection.totalCount)} trophée{collection.totalCount !== 1 ? "s" : ""}</small></div>
    <div className="trophy-shelf-stage">
      <div className="trophy-shelf-scroll">
      <div className="trophy-shelf">
        <img className="trophy-shelf-art" src="/trophies/v1/shelf.webp" alt="" loading="lazy" />
        {Array.from({ length: TROPHY_SLOT_COUNT }, (_, index) => {
          const trophy = TROPHY_CATALOG[index];
          const row = ROWS[Math.floor(index / 6)];
          const position = { "--trophy-x": `${COLUMNS[index % 6]}%`, "--trophy-base": `${row.base}%`, "--trophy-medal": `${row.medal}%` };
          if (!trophy) return <span key={`vacant-${index}`} className="trophy-slot-vacant" style={position} aria-hidden="true">·</span>;
          const displayed = getDisplayedTrophyReward(trophy, collection.counts);
          const count = collection.counts[displayed.id];
          const medallion = count && displayed.repeat === "once" ? "✓" : String(count);
          return <React.Fragment key={trophy.id}>
            <button type="button" className={`trophy-shelf-slot${count ? " is-earned" : " is-locked"}${selectedId === trophy.id ? " is-selected" : ""}`} style={position}
              data-trophy-category={trophy.id} data-trophy-reward={displayed.id} data-trophy-metal={getTrophyMetal(displayed)}
              aria-label={`${getTrophyRewardName(displayed)} · ${getTrophyCountLabel(displayed, count)}`}
              aria-pressed={selectedId === trophy.id} aria-describedby={selectedId === trophy.id ? descriptionId : undefined}
              aria-haspopup="dialog" aria-expanded={expanded?.categoryId === trophy.id}
              title={`${getTrophyRewardName(displayed)} — ${displayed.description}`} onFocus={() => setSelectedId(trophy.id)} onClick={event => {
                returnFocusRef.current = event.currentTarget;
                event.currentTarget.closest(".trophy-shelf-stage")?.scrollIntoView({ block: "center", inline: "nearest" });
                setSelectedId(trophy.id);
                setExpandedRewardId(displayed.id);
              }}>
              <TrophyArt trophy={displayed} locked={!count} />
            </button>
            <span className={`trophy-shelf-count${count ? " is-earned" : ""}`}
              style={{ ...position, "--trophy-count-digits": medallion.length }} aria-hidden="true">{medallion}</span>
          </React.Fragment>;
        })}
      </div>
      </div>
      {expanded ? <TrophySpotlight trophy={expanded} count={collection.counts[expanded.id]}
        onClose={closeSpotlight} returnFocusRef={returnFocusRef} /> : null}
    </div>
    <div id={descriptionId} className="trophy-shelf-detail">
      {expanded ? <TrophyTierDetails category={TROPHY_CATEGORY_BY_ID[expanded.categoryId]} selectedReward={expanded} counts={collection.counts} userId={userId} onSelectReward={setExpandedRewardId} /> : selectedReward ? <div aria-live="polite"><strong>{getTrophyRewardName(selectedReward)}</strong><p>{selectedReward.description}</p><span>{getTrophyCountLabel(selectedReward, collection.counts[selectedReward.id])} · {Number.isFinite(selectedReward.points) ? `${format(selectedReward.points)} points par obtention` : "Barème à venir"}</span></div> :
        <p>Touche un trophée pour l’admirer en grand et découvrir ses conditions. La meilleure version obtenue occupe sa place ; les ors répétables s’accumulent.</p>}
    </div>
    <p className="trophy-collection-score">{collection.points == null ? "Classement des trophées : barème à venir." : `${format(collection.points)} points au classement des trophées.`}</p>
  </section>;
}
