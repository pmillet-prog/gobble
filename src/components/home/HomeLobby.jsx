import React from "react";
import {
  UI_IMAGE_KEYS,
  detectWideUiViewport,
  getHomeBackgroundKey,
  getUiImageUrl,
} from "../../assets/uiAssetManifest.js";
import { HOME_DISPLAY_ACTIONS } from "../../utils/displayMode.js";
import useHomeLobbyIntro from "./useHomeLobbyIntro.js";

const HOME_ASSETS = {
  title: UI_IMAGE_KEYS.home.title,
  account: UI_IMAGE_KEYS.home.account,
  duel: UI_IMAGE_KEYS.home.duel,
  playBlue: UI_IMAGE_KEYS.home.playBlue,
  playRed: UI_IMAGE_KEYS.home.playRed,
  players: UI_IMAGE_KEYS.home.players,
  vault: UI_IMAGE_KEYS.home.vault,
  stats: UI_IMAGE_KEYS.home.stats,
  daily: UI_IMAGE_KEYS.home.daily,
  homeChat: UI_IMAGE_KEYS.home.chat,
  settings: UI_IMAGE_KEYS.home.settings,
};

const styles = `
.home-lobby-screen {
  min-height: 100svh;
  height: 100svh;
  position: relative;
  overflow: hidden;
  background: #fff;
  color: white;
}
.home-lobby-backdrop {
  position: absolute;
  z-index: 0;
  inset: 0;
  display: block;
  opacity: 0;
  transition: opacity 680ms cubic-bezier(0.22, 1, 0.36, 1);
  pointer-events: none;
}
.home-lobby-backdrop img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: fill;
}
.home-lobby-stage-background .home-lobby-backdrop,
.home-lobby-stage-title .home-lobby-backdrop,
.home-lobby-stage-ui .home-lobby-backdrop,
.home-lobby-stage-complete .home-lobby-backdrop {
  opacity: 1;
}
.home-lobby-screen::before {
  content: "";
  position: absolute;
  z-index: 1;
  inset: 0;
  background: radial-gradient(circle at 50% 10%, rgba(255, 214, 118, 0.18), transparent 28%),
    linear-gradient(180deg, rgba(0, 0, 0, 0.18), rgba(0, 0, 0, 0.02) 42%, rgba(0, 0, 0, 0.34));
  opacity: 0;
  transition: opacity 680ms cubic-bezier(0.22, 1, 0.36, 1);
  pointer-events: none;
}
.home-lobby-stage-background::before,
.home-lobby-stage-title::before,
.home-lobby-stage-ui::before,
.home-lobby-stage-complete::before {
  opacity: 1;
}
.home-lobby-shell {
  position: relative;
  z-index: 2;
  height: 100%;
  width: min(100%, 1180px);
  margin: 0 auto;
  padding: max(10px, env(safe-area-inset-top)) 14px max(18px, env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-items: center;
}
.home-maintenance-banner {
  position: absolute;
  z-index: 30;
  top: max(8px, env(safe-area-inset-top));
  left: 50%;
  width: min(calc(100% - 18px), 900px);
  min-height: 54px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 10px 18px;
  overflow: hidden;
  border: 3px solid rgba(255, 230, 230, 0.96);
  border-radius: 14px;
  background:
    linear-gradient(105deg, rgba(90, 0, 0, 0.96), rgba(220, 24, 36, 0.98) 48%, rgba(112, 0, 0, 0.96));
  color: #fff;
  font-size: clamp(18px, 4.8vw, 28px);
  font-weight: 1000;
  line-height: 1;
  letter-spacing: 0.08em;
  text-align: center;
  text-transform: uppercase;
  text-shadow: 0 2px 2px rgba(70, 0, 0, 0.9);
  box-shadow:
    0 10px 28px rgba(70, 0, 0, 0.56),
    inset 0 1px 0 rgba(255, 255, 255, 0.42);
  isolation: isolate;
}
.home-maintenance-banner::before {
  content: "";
  position: absolute;
  z-index: -1;
  inset: 0;
  background: repeating-linear-gradient(
    -45deg,
    transparent 0 18px,
    rgba(255, 255, 255, 0.08) 18px 30px
  );
}
.home-maintenance-banner .material-symbols-outlined {
  flex: 0 0 auto;
  font-size: 1.25em;
  font-variation-settings: "FILL" 1, "wght" 700;
}
.home-lobby-button {
  appearance: none;
  border: 0;
  padding: 0;
  margin: 0;
  background: transparent;
  position: relative;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: transform 130ms ease, filter 130ms ease;
  filter: drop-shadow(0 12px 14px rgba(0, 0, 0, 0.34));
}
.home-lobby-button:hover:not(:disabled) {
  transform: translateY(-2px) scale(1.025);
  filter: brightness(1.08) drop-shadow(0 16px 18px rgba(0, 0, 0, 0.4));
}
.home-lobby-button:active:not(:disabled) {
  transform: translateY(1px) scale(0.98);
  filter: brightness(0.95) drop-shadow(0 8px 10px rgba(0, 0, 0, 0.34));
}
.home-lobby-button:disabled {
  --home-secondary-opacity: 0.62;
  cursor: default;
  opacity: 0.62;
  filter: grayscale(0.35) drop-shadow(0 8px 10px rgba(0, 0, 0, 0.24));
}
.home-lobby-img {
  display: block;
  width: 100%;
  height: auto;
  user-select: none;
  pointer-events: none;
}
.home-title {
  --home-title-rest-transform: translate3d(0, 0, 0);
  width: min(92vw, 760px);
  margin-top: -10px;
  margin-bottom: 0;
  filter: none;
  flex: 0 0 auto;
  opacity: 0;
  transform: var(--home-title-rest-transform);
  transform-origin: center center;
  will-change: transform, opacity;
}
@keyframes homeTitleSettle {
  0% {
    opacity: 0;
    transform: var(--home-title-rest-transform) translate3d(0, clamp(120px, 27svh, 310px), 0) scale(1.52);
  }
  20% { opacity: 1; }
  72% {
    opacity: 1;
    transform: var(--home-title-rest-transform) translate3d(0, -5px, 0) scale(0.985);
  }
  100% {
    opacity: 1;
    transform: var(--home-title-rest-transform) translate3d(0, 0, 0) scale(1);
  }
}
.home-lobby-stage-title .home-title,
.home-lobby-stage-ui .home-title {
  animation: homeTitleSettle 920ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
.home-lobby-stage-complete .home-title {
  opacity: 1;
  transform: var(--home-title-rest-transform);
  will-change: auto;
}
.home-lobby-secondary {
  --home-secondary-opacity: 1;
  visibility: hidden;
  pointer-events: none;
}
.home-lobby-stage-ui .home-lobby-secondary {
  visibility: visible;
  pointer-events: auto;
  animation: homeSecondaryIn 620ms ease both;
}
.home-lobby-stage-complete .home-lobby-secondary {
  visibility: visible;
  pointer-events: auto;
}
@keyframes homeSecondaryIn {
  from { opacity: 0; }
  to { opacity: var(--home-secondary-opacity); }
}
.home-account {
  width: min(48vw, 292px);
  margin-top: clamp(-86px, -8.8vh, -48px);
  margin-bottom: clamp(-10px, -1.2vh, -2px);
  z-index: 2;
  flex: 0 0 auto;
  clip-path: inset(24% 0 28% 0);
}
.home-account-name {
  position: absolute;
  left: 30%;
  right: 14%;
  top: 45%;
  transform: translateY(-50%);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  text-align: center;
  font-weight: 900;
  font-size: clamp(11px, 2vw, 16px);
  color: #ffe08a;
  text-shadow: 0 2px 2px rgba(62, 23, 0, 0.82), 0 0 6px rgba(255, 225, 130, 0.3);
}
.home-account-dot {
  position: absolute;
  right: 11.5%;
  top: 43%;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: #53d829;
  box-shadow: inset 0 2px 4px rgba(255, 255, 255, 0.7), 0 2px 5px rgba(0, 0, 0, 0.5);
}
.home-account-dot-off {
  background: #9ca3af;
}
.home-duel {
  width: min(94vw, 780px);
  margin-top: 0;
  flex: 0 0 auto;
}
.home-duel-score {
  position: absolute;
  top: 47%;
  transform: translateY(-50%);
  font-weight: 900;
  font-size: 30px;
  line-height: 1;
  color: #fff7e6;
  text-shadow: 0 3px 3px rgba(0, 0, 0, 0.64), 0 0 2px rgba(0, 0, 0, 0.7);
  font-variant-numeric: tabular-nums;
}
.home-duel-score-red {
  right: 23%;
}
.home-duel-score-blue {
  left: 23%;
}
.home-week-recap {
  flex: 0 0 auto;
  position: absolute;
  left: 50%;
  top: calc(50% + min(9vw, 60px));
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 34px;
  margin-top: -4px;
  margin-bottom: 2px;
  padding: 6px 10px;
  border: 1px solid rgba(255, 224, 138, 0.72);
  border-radius: 8px;
  background: rgba(8, 29, 70, 0.82);
  color: #fff1bd;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0;
  box-shadow: 0 7px 14px rgba(0, 0, 0, 0.28);
  cursor: pointer;
  transition: transform 130ms ease, filter 130ms ease, opacity 130ms ease;
  z-index: 3;
}
.home-week-recap:hover:not(:disabled) {
  transform: translateX(-50%) translateY(-1px);
  filter: brightness(1.1);
}
.home-week-recap:active:not(:disabled) {
  transform: translateX(-50%) translateY(1px);
}
.home-week-recap:disabled {
  cursor: wait;
  opacity: 0.64;
}
.home-week-recap .material-icons-outlined {
  font-size: 18px;
  line-height: 1;
}
.home-play {
  width: min(68vw, 390px);
  z-index: 1;
}
.home-players {
  width: clamp(72px, 20vw, 112px);
  position: absolute;
  left: calc(50% + min(34vw, 195px) - min(8vw, 34px));
  top: 50%;
  transform: translateY(-50%);
  z-index: 2;
}
.home-training {
  width: clamp(72px, 20vw, 112px);
  position: absolute;
  right: calc(50% + min(34vw, 195px) - min(8vw, 34px));
  top: 50%;
  transform: translateY(-50%);
  z-index: 2;
}
.home-training > * {
  display: block;
  width: 100%;
  height: 100%;
}
.home-players:hover:not(:disabled) {
  transform: translateY(-50%) translateY(-2px) scale(1.025);
}
.home-players:active:not(:disabled) {
  transform: translateY(-50%) translateY(1px) scale(0.98);
}
.home-play-row {
  flex: 0 0 auto;
  position: relative;
  width: 100%;
  min-height: clamp(92px, 17vh, 190px);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  margin-top: clamp(-84px, -8vh, -34px);
}
.home-count-badge {
  position: absolute;
  right: 3%;
  top: 5%;
  min-width: 38px;
  height: 38px;
  padding: 0 7px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at 35% 25%, #ff7771, #ba1f28 70%);
  border: 3px solid #ffd37a;
  color: #fff7e6;
  font-size: 18px;
  font-weight: 900;
  text-shadow: 0 2px 2px rgba(0, 0, 0, 0.6);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.42);
}
.home-count-badge-help {
  background: radial-gradient(circle at 35% 25%, #fde68a, #f59e0b 72%);
  border-color: #fff3bf;
  color: #1f2937;
  text-shadow: none;
}
.home-bottom-nav {
  width: min(92vw, 620px);
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  align-items: end;
  justify-items: center;
  gap: min(1.4vw, 10px);
  margin-top: auto;
  margin-bottom: clamp(18px, 3vh, 42px);
  flex: 0 0 auto;
}
.home-icon-button {
  width: min(17vw, 104px);
}
.home-status-panel {
  flex: 0 0 auto;
  min-height: 24px;
  max-width: min(86vw, 520px);
  margin-top: clamp(-20px, -2vh, -4px);
  text-align: center;
  color: #fff6d7;
  font-size: 13px;
  font-weight: 800;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.72);
}
.home-status-panel-with-action {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
}
.home-display-mode-button {
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 5px 11px;
  border: 1px solid rgba(255, 224, 138, 0.72);
  border-radius: 999px;
  background: rgba(8, 29, 70, 0.84);
  color: #fff1bd;
  font-size: 11px;
  font-weight: 900;
  line-height: 1;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.82);
  box-shadow: 0 5px 12px rgba(0, 0, 0, 0.28);
  transition: transform 130ms ease, filter 130ms ease;
}
.home-display-mode-button:hover {
  transform: translateY(-1px);
  filter: brightness(1.12);
}
.home-display-mode-button:active {
  transform: translateY(1px) scale(0.98);
}
.home-display-mode-button .material-symbols-outlined {
  font-size: 17px;
  line-height: 1;
}
.home-install-guide-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  background: rgba(2, 8, 23, 0.72);
  backdrop-filter: blur(5px);
}
.home-install-guide {
  width: min(92vw, 390px);
  padding: 18px;
  border: 2px solid rgba(253, 224, 71, 0.78);
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(18, 47, 103, 0.98), rgba(7, 22, 55, 0.99));
  color: #fff7d6;
  text-align: left;
  text-shadow: none;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.48);
}
.home-install-guide-title {
  font-size: 18px;
  font-weight: 1000;
}
.home-install-guide ol {
  margin: 14px 0 0;
  padding-left: 22px;
  font-size: 14px;
  font-weight: 750;
  line-height: 1.45;
}
.home-install-guide-close {
  width: 100%;
  margin-top: 16px;
  padding: 10px 14px;
  border: 1px solid rgba(255, 244, 189, 0.72);
  border-radius: 12px;
  background: linear-gradient(180deg, #ffe68f, #d99518);
  color: #311900;
  font-size: 14px;
  font-weight: 1000;
}
.home-resume-card {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 999px;
  padding: 7px 10px;
  background: rgba(8, 29, 70, 0.72);
  border: 1px solid rgba(255, 211, 122, 0.42);
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.24);
}
.home-resume-card button {
  border-radius: 999px;
  padding: 5px 12px;
  border: 1px solid rgba(255, 211, 122, 0.5);
  background: linear-gradient(180deg, #ffe08a, #d38a18);
  color: #321900;
  font-size: 13px;
  font-weight: 900;
}
@media (max-height: 760px) {
  .home-title { width: min(80vw, 560px); margin-top: -28px; }
  .home-account {
    width: min(43vw, 260px);
    margin-top: clamp(-72px, -8vh, -42px);
    margin-bottom: clamp(-14px, -1.8vh, -6px);
  }
  .home-duel { width: min(84vw, 620px); margin-top: -8px; }
  .home-play-row {
    min-height: clamp(76px, 15vh, 150px);
    margin-top: clamp(-72px, -7.8vh, -30px);
  }
  .home-play { width: min(54vw, 320px); }
  .home-icon-button { width: min(14vw, 82px); }
  .home-players {
    width: min(16vw, 92px);
    left: calc(50% + min(27vw, 160px) - min(6vw, 26px));
  }
  .home-training {
    width: min(16vw, 92px);
    right: calc(50% + min(27vw, 160px) - min(6vw, 26px));
  }
}
@media (max-width: 520px) {
  .home-lobby-shell { padding-left: 10px; padding-right: 10px; }
  .home-title { width: 95vw; margin-top: -14px; }
  .home-account {
    width: 48vw;
    margin-top: clamp(-86px, -9.5vh, -52px);
    margin-bottom: clamp(-92px, -10.5vh, -56px);
    transform: translateY(clamp(-42px, -4.9vh, -24px));
  }
  .home-account:hover:not(:disabled) {
    transform: translateY(clamp(-42px, -4.9vh, -24px)) translateY(-2px) scale(1.025);
  }
  .home-account:active:not(:disabled) {
    transform: translateY(clamp(-42px, -4.9vh, -24px)) translateY(1px) scale(0.98);
  }
  .home-account-name { left: 31%; right: 14%; }
  .home-account-dot { width: 13px; height: 13px; }
  .home-duel {
    width: 94vw;
    margin-top: clamp(-24px, -2.8vh, -12px);
  }
  .home-duel-score { font-size: 23px; }
  .home-status-panel {
    transform: translateY(-10px);
  }
  .home-play-row {
    min-height: clamp(66px, 12vh, 100px);
    margin-top: clamp(-24px, -2.8vh, -12px);
  }
  .home-play { width: 64vw; }
  .home-players {
    width: 18.5vw;
    left: calc(50% + 32vw - 7vw);
  }
  .home-training {
    width: 18.5vw;
    right: calc(50% + 32vw - 7vw);
  }
  .home-icon-button { width: 18vw; }
  .home-count-badge { min-width: 30px; height: 30px; font-size: 14px; border-width: 2px; }
}
@media (min-aspect-ratio: 1/1) {
  .home-lobby-shell {
    width: 100%;
    height: 100%;
    min-height: 0;
    max-width: none;
    padding: 0;
    margin: 0;
    display: block;
    position: relative;
  }
  .home-title {
    --home-title-rest-transform: translateX(-50%);
    position: absolute;
    left: 50%;
    top: -4.2vh;
    width: 31.5vw;
    margin: 0;
    transform: var(--home-title-rest-transform);
  }
  .home-maintenance-banner {
    top: 1.2vh;
    width: min(58vw, 900px);
    min-height: clamp(46px, 4.2vw, 66px);
    padding: 0.55vw 1.2vw;
    border-radius: clamp(10px, 0.8vw, 16px);
    font-size: clamp(20px, 1.45vw, 30px);
  }
  .home-account {
    position: absolute;
    left: 44.25vw;
    top: 23.8vh;
    width: 11.5vw;
    margin: 0;
  }
  .home-account-name { font-size: 0.68vw; }
  .home-account-dot { width: 0.68vw; height: 0.68vw; }
  .home-duel {
    position: absolute;
    left: 32.5vw;
    top: 29vh;
    width: 35vw;
    margin: 0;
  }
  .home-week-recap {
    position: absolute;
    left: 50%;
    top: 5.55vw;
    transform: translateX(-50%);
    min-height: 2vw;
    margin: 0;
    padding: 0.35vw 0.55vw;
    gap: 0.3vw;
    font-size: 0.65vw;
  }
  .home-week-recap .material-icons-outlined {
    font-size: 1vw;
  }
  .home-duel-score { font-size: 1.34vw; }
  .home-status-panel {
    position: absolute;
    left: 34vw;
    top: 42.6vh;
    width: 32vw;
    max-width: none;
    margin: 0;
  }
  .home-status-panel-message {
    top: calc(47.5vh + 6.25vw);
  }
  .home-status-panel-with-action .home-display-mode-button {
    position: absolute;
    left: 50%;
    top: 2.75vw;
    z-index: 3;
    min-height: 1.6vw;
    padding: 0.28vw 0.55vw;
    gap: 0.3vw;
    font-size: 0.58vw;
    white-space: nowrap;
    transform: translateX(-50%);
  }
  .home-status-panel-resume.home-status-panel-with-action .home-display-mode-button {
    top: calc(4.9vh + 9vw);
  }
  .home-status-panel-with-action .home-display-mode-button:hover {
    transform: translateX(-50%) translateY(-0.06vw);
  }
  .home-status-panel-with-action .home-display-mode-button:active {
    transform: translateX(-50%) translateY(0.06vw) scale(0.98);
  }
  .home-status-panel-with-action .home-display-mode-button .material-symbols-outlined {
    font-size: 0.9vw;
  }
  .home-play-row {
    position: absolute;
    left: 0;
    top: 47.5vh;
    width: 100vw;
    height: 6.8vw;
    min-height: 0;
    margin: 0;
  }
  .home-play { width: 14.5vw; }
  .home-players {
    width: 5.15vw;
    left: calc(50% + 4.65vw);
  }
  .home-training {
    width: 5.15vw;
    right: calc(50% + 4.65vw);
  }
  .home-bottom-nav {
    position: absolute;
    left: 37.2vw;
    bottom: 4.2vh;
    width: 25.6vw;
    margin: 0;
    gap: 0.42vw;
  }
  .home-icon-button { width: 4.1vw; }
  .home-count-badge {
    min-width: 1.55vw;
    height: 1.55vw;
    font-size: 0.72vw;
    border-width: 0.13vw;
  }
}
@media (prefers-reduced-motion: reduce) {
  .home-lobby-backdrop,
  .home-lobby-screen::before {
    transition: none;
  }
  .home-lobby-stage-ui .home-lobby-secondary {
    animation: none;
  }
  .home-lobby-stage-title .home-title,
  .home-lobby-stage-ui .home-title {
    animation: none;
    opacity: 1;
    transform: var(--home-title-rest-transform);
  }
}
`;

function formatBadgeCount(value) {
  const count = Math.max(0, Math.trunc(Number(value) || 0));
  if (count >= 100) return "99+";
  return String(count);
}

function formatDuelScore(value) {
  const score = Math.max(0, Math.trunc(Number(value) || 0));
  return new Intl.NumberFormat("fr-FR").format(score);
}

function HomeImageButton({
  alt,
  className = "",
  disabled = false,
  onClick,
  src,
  children,
}) {
  return (
    <button
      type="button"
      className={`home-lobby-button ${className}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={alt}
      title={alt}
    >
      <img className="home-lobby-img" src={getUiImageUrl(src)} alt="" draggable="false" />
      {children}
    </button>
  );
}

function HomeLobby({
  accountLabel = "",
  accountOnline = false,
  accountNotice = "",
  backgroundDesktop = "",
  backgroundMobile = "",
  canResumeNow = false,
  dailyRemainingCount = 0,
  displayModeAction = HOME_DISPLAY_ACTIONS.none,
  duelBlueScore = 0,
  duelRedScore = 0,
  homeChatUnreadCount = 0,
  homeChatUnreadIsBotOnly = false,
  isAuthServerUnavailable = false,
  isAuthStatusPending = false,
  isConnecting = false,
  loginError = "",
  maintenanceMode = false,
  onDismissResume,
  onIntroComplete,
  onOpenAccount,
  onOpenChat,
  onOpenDaily,
  onOpenDuel,
  onOpenPlayers,
  onOpenSettings,
  onOpenStats,
  onOpenVault,
  onOpenWeeklyRecap,
  onPlay,
  onResume,
  onToggleFullscreen,
  playerTeam = "",
  playIntro = true,
  playersCount = 0,
  resumePhaseLabel = "",
  resumeRoomLabel = "",
  savedSessionNick = "",
  weeklyRecapLoading = false,
  trainingControl = null,
}) {
  const [isIosInstallHelpOpen, setIsIosInstallHelpOpen] = React.useState(false);
  const statusText =
    loginError ||
    accountNotice ||
    (isAuthStatusPending
      ? "Vérification du compte..."
      : isAuthServerUnavailable
      ? "Serveur occupé, réessaie dans quelques secondes."
      : "");
  const safeAccountLabel = accountLabel || savedSessionNick || "Compte";
  const disabled = isConnecting || isAuthStatusPending || maintenanceMode;
  const playButtonSrc = playerTeam === "red" ? HOME_ASSETS.playRed : HOME_ASSETS.playBlue;
  const hasDisplayModeAction = displayModeAction !== HOME_DISPLAY_ACTIONS.none;
  const displayModeLabel =
    displayModeAction === HOME_DISPLAY_ACTIONS.exitFullscreen
      ? "Quitter le plein écran"
      : displayModeAction === HOME_DISPLAY_ACTIONS.iosInstall
      ? "Jouer comme une appli"
      : "Jouer en plein écran";
  const displayModeIcon =
    displayModeAction === HOME_DISPLAY_ACTIONS.exitFullscreen
      ? "fullscreen_exit"
      : displayModeAction === HOME_DISPLAY_ACTIONS.iosInstall
      ? "add_to_home_screen"
      : "fullscreen";
  const handleDisplayModeAction = async () => {
    if (displayModeAction === HOME_DISPLAY_ACTIONS.iosInstall) {
      setIsIosInstallHelpOpen(true);
      return;
    }
    await onToggleFullscreen?.();
  };
  const resolvedBackgroundDesktop =
    backgroundDesktop || getUiImageUrl(getHomeBackgroundKey(playerTeam, "wide"));
  const resolvedBackgroundMobile =
    backgroundMobile || getUiImageUrl(getHomeBackgroundKey(playerTeam, "tall"));
  const preferWideAtMountRef = React.useRef(detectWideUiViewport());
  const activeBackgroundUrl = preferWideAtMountRef.current
    ? resolvedBackgroundDesktop
    : resolvedBackgroundMobile;
  const homeUiUrls = React.useMemo(
    () =>
      [
        HOME_ASSETS.title,
        HOME_ASSETS.account,
        HOME_ASSETS.duel,
        playButtonSrc,
        HOME_ASSETS.players,
        HOME_ASSETS.vault,
        HOME_ASSETS.stats,
        HOME_ASSETS.daily,
        HOME_ASSETS.homeChat,
        HOME_ASSETS.settings,
      ].map((key) => getUiImageUrl(key)),
    [playButtonSrc]
  );
  const introStage = useHomeLobbyIntro({
    backgroundUrl: activeBackgroundUrl,
    enabled: playIntro,
    onComplete: onIntroComplete,
    uiUrls: homeUiUrls,
  });

  return (
    <div className={`home-lobby-screen home-lobby-stage-${introStage}`}>
      <style>{styles}</style>
      <picture className="home-lobby-backdrop" aria-hidden="true">
        <source media="(min-aspect-ratio: 1/1)" srcSet={resolvedBackgroundDesktop} />
        <img
          src={resolvedBackgroundMobile}
          alt=""
          decoding="async"
          fetchPriority="high"
          draggable="false"
        />
      </picture>
      <div className="home-lobby-shell">
        {maintenanceMode ? (
          <div
            className="home-maintenance-banner home-lobby-secondary"
            role="status"
            aria-live="polite"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              construction
            </span>
            <span>Maintenance en cours</span>
          </div>
        ) : null}
        <img
          className="home-title home-lobby-img"
          src={getUiImageUrl(HOME_ASSETS.title)}
          alt="Gobble"
          draggable="false"
        />

        <HomeImageButton
          alt="Compte"
          className="home-account home-lobby-secondary"
          src={HOME_ASSETS.account}
          onClick={onOpenAccount}
        >
          <span className="home-account-name">{safeAccountLabel}</span>
          <span
            className={`home-account-dot ${accountOnline ? "" : "home-account-dot-off"}`}
            aria-hidden="true"
          />
        </HomeImageButton>

        <HomeImageButton
          alt="Duel"
          className="home-duel home-lobby-secondary"
          src={HOME_ASSETS.duel}
          onClick={onOpenDuel}
        >
          <span className="home-duel-score home-duel-score-blue">
            {formatDuelScore(duelBlueScore)}
          </span>
          <span className="home-duel-score home-duel-score-red">
            {formatDuelScore(duelRedScore)}
          </span>
        </HomeImageButton>

        <div
          className={`home-status-panel home-lobby-secondary ${
            canResumeNow ? "home-status-panel-resume" : "home-status-panel-message"
          } ${hasDisplayModeAction ? "home-status-panel-with-action" : ""}`}
        >
          {canResumeNow ? (
            <span className="home-resume-card">
              <span>
                {savedSessionNick || "Session en cours"}
                {resumeRoomLabel ? ` · ${resumeRoomLabel}` : ""}
                {resumePhaseLabel ? ` · ${resumePhaseLabel}` : ""}
              </span>
              <button type="button" onClick={onResume} disabled={isConnecting}>
                Reprendre
              </button>
              <button type="button" onClick={onDismissResume} disabled={isConnecting}>
                Ignorer
              </button>
            </span>
          ) : (
            statusText
          )}
          {hasDisplayModeAction ? (
            <button
              type="button"
              className="home-display-mode-button"
              onClick={handleDisplayModeAction}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {displayModeIcon}
              </span>
              <span>{displayModeLabel}</span>
            </button>
          ) : null}
        </div>

        <div className="home-play-row home-lobby-secondary">
          {trainingControl ? <div className="home-training">{trainingControl}</div> : null}
          <HomeImageButton
            alt="Jouer"
            className="home-play"
            src={playButtonSrc}
            onClick={onPlay}
            disabled={disabled}
          />
          <button
            type="button"
            className="home-week-recap"
            onClick={onOpenWeeklyRecap}
            disabled={weeklyRecapLoading}
            aria-label="Revoir le récapitulatif de la semaine"
            title="Récapitulatif de la semaine"
          >
            <span className="material-icons-outlined" aria-hidden="true">
              {weeklyRecapLoading ? "hourglass_top" : "emoji_events"}
            </span>
            <span>{weeklyRecapLoading ? "Chargement..." : "Récap semaine"}</span>
          </button>
          <HomeImageButton
            alt="Joueurs en ligne"
            className="home-players"
            src={HOME_ASSETS.players}
            onClick={onOpenPlayers}
            disabled={isConnecting}
          >
            <span className="home-count-badge">{formatBadgeCount(playersCount)}</span>
          </HomeImageButton>
        </div>

        <div
          className="home-bottom-nav home-lobby-secondary"
          aria-label="Navigation accueil"
        >
          <HomeImageButton
            alt="Coffre fort"
            className="home-icon-button"
            src={HOME_ASSETS.vault}
            onClick={onOpenVault}
            disabled={isConnecting}
          />
          <HomeImageButton
            alt="Stats"
            className="home-icon-button"
            src={HOME_ASSETS.stats}
            onClick={onOpenStats}
            disabled={isConnecting}
          />
          <HomeImageButton
            alt="Grilles du jour"
            className="home-icon-button"
            src={HOME_ASSETS.daily}
            onClick={onOpenDaily}
            disabled={isConnecting || maintenanceMode}
          >
            {dailyRemainingCount > 0 ? (
              <span className="home-count-badge">{formatBadgeCount(dailyRemainingCount)}</span>
            ) : null}
          </HomeImageButton>
          <HomeImageButton
            alt="Chat"
            className="home-icon-button"
            src={HOME_ASSETS.homeChat}
            onClick={onOpenChat}
            disabled={isConnecting}
          >
            {homeChatUnreadCount > 0 ? (
              <span className={`home-count-badge ${homeChatUnreadIsBotOnly ? "home-count-badge-help" : ""}`}>
                {homeChatUnreadIsBotOnly ? "?" : formatBadgeCount(homeChatUnreadCount)}
              </span>
            ) : null}
          </HomeImageButton>
          <HomeImageButton
            alt="Réglages"
            className="home-icon-button"
            src={HOME_ASSETS.settings}
            onClick={onOpenSettings}
            disabled={isConnecting}
          />
        </div>
        {isIosInstallHelpOpen ? (
          <div
            className="home-install-guide-backdrop"
            role="presentation"
            onClick={() => setIsIosInstallHelpOpen(false)}
          >
            <div
              className="home-install-guide"
              role="dialog"
              aria-modal="true"
              aria-label="Jouer à Gobble comme une application"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="home-install-guide-title">Jouer sans les barres de Safari</div>
              <ol>
                <li>Touche le bouton Partager de ton navigateur.</li>
                <li>Choisis « Sur l’écran d’accueil ».</li>
                <li>Ajoute Gobble, puis lance-le depuis sa nouvelle icône.</li>
              </ol>
              <button
                type="button"
                className="home-install-guide-close"
                onClick={() => setIsIosInstallHelpOpen(false)}
              >
                Compris
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default React.memo(HomeLobby);
