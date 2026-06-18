import React from "react";

const HOME_ASSET_ROOT = "/buttons";
const HOME_ASSETS = {
  title: `${HOME_ASSET_ROOT}/titre gobble.png`,
  account: `${HOME_ASSET_ROOT}/compte.png`,
  duel: `${HOME_ASSET_ROOT}/duels.png`,
  playBlue: `${HOME_ASSET_ROOT}/bouton jouer bleu.png`,
  playRed: `${HOME_ASSET_ROOT}/bouton jouer rouge.png`,
  players: `${HOME_ASSET_ROOT}/bouton joueurs.png`,
  vault: `${HOME_ASSET_ROOT}/coffre fort.png`,
  stats: `${HOME_ASSET_ROOT}/stats.png`,
  daily: `${HOME_ASSET_ROOT}/daily.png`,
  homeChat: `${HOME_ASSET_ROOT}/chat accueil.png`,
  settings: `${HOME_ASSET_ROOT}/settings.png`,
};

const styles = `
.home-lobby-screen {
  min-height: 100svh;
  height: 100svh;
  position: relative;
  overflow: hidden;
  background-image: var(--home-bg-mobile);
  background-size: 100% 100%;
  background-position: center;
  color: white;
}
@media (min-aspect-ratio: 1/1) {
  .home-lobby-screen {
    background-image: var(--home-bg-desktop);
    background-size: 100% 100%;
    background-position: center;
  }
}
.home-lobby-screen::before {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 10%, rgba(255, 214, 118, 0.18), transparent 28%),
    linear-gradient(180deg, rgba(0, 0, 0, 0.18), rgba(0, 0, 0, 0.02) 42%, rgba(0, 0, 0, 0.34));
  pointer-events: none;
}
.home-lobby-shell {
  position: relative;
  z-index: 1;
  height: 100%;
  width: min(100%, 1180px);
  margin: 0 auto;
  padding: max(10px, env(safe-area-inset-top)) 14px max(18px, env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-items: center;
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
  width: min(92vw, 760px);
  margin-top: -10px;
  margin-bottom: 0;
  filter: none;
  flex: 0 0 auto;
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
    position: absolute;
    left: 50%;
    top: -4.2vh;
    width: 31.5vw;
    margin: 0;
    transform: translateX(-50%);
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
      <img className="home-lobby-img" src={src} alt="" draggable="false" />
      {children}
    </button>
  );
}

function HomeLobby({
  accountLabel = "",
  accountOnline = false,
  accountNotice = "",
  backgroundDesktop = "/background/desktop bleu.png",
  backgroundMobile = "/background/mobile bleu.png",
  canResumeNow = false,
  dailyRemainingCount = 0,
  duelBlueScore = 0,
  duelRedScore = 0,
  homeChatUnreadCount = 0,
  homeChatUnreadIsBotOnly = false,
  isAuthServerUnavailable = false,
  isAuthStatusPending = false,
  isConnecting = false,
  loginError = "",
  onDismissResume,
  onOpenAccount,
  onOpenChat,
  onOpenDaily,
  onOpenDuel,
  onOpenPlayers,
  onOpenSettings,
  onOpenStats,
  onOpenVault,
  onPlay,
  onResume,
  playerTeam = "",
  playersCount = 0,
  resumePhaseLabel = "",
  resumeRoomLabel = "",
  savedSessionNick = "",
}) {
  const statusText =
    loginError ||
    accountNotice ||
    (isAuthStatusPending
      ? "Vérification du compte..."
      : isAuthServerUnavailable
      ? "Serveur occupé, réessaie dans quelques secondes."
      : "");
  const safeAccountLabel = accountLabel || savedSessionNick || "Compte";
  const disabled = isConnecting || isAuthStatusPending;
  const playButtonSrc = playerTeam === "red" ? HOME_ASSETS.playRed : HOME_ASSETS.playBlue;
  const screenStyle = {
    "--home-bg-mobile": `url("${backgroundMobile}")`,
    "--home-bg-desktop": `url("${backgroundDesktop}")`,
  };

  return (
    <div className="home-lobby-screen" style={screenStyle}>
      <style>{styles}</style>
      <div className="home-lobby-shell">
        <img
          className="home-title home-lobby-img"
          src={HOME_ASSETS.title}
          alt="Gobble"
          draggable="false"
        />

        <HomeImageButton
          alt="Compte"
          className="home-account"
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
          className="home-duel"
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
          className={`home-status-panel ${
            canResumeNow ? "home-status-panel-resume" : "home-status-panel-message"
          }`}
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
        </div>

        <div className="home-play-row">
          <HomeImageButton
            alt="Jouer"
            className="home-play"
            src={playButtonSrc}
            onClick={onPlay}
            disabled={disabled}
          />
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

        <div className="home-bottom-nav" aria-label="Navigation accueil">
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
            disabled={isConnecting}
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
      </div>
    </div>
  );
}

export default React.memo(HomeLobby);
