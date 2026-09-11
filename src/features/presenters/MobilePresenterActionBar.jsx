import React from "react";

import { UI_IMAGE_KEYS, getUiImageUrl } from "../../assets/uiAssetManifest.js";
import { getInterventionFramePosition } from "../../components/botInterventions/spriteInterventionAnimation.js";
import { CAPELLO_INTERVENTION_CONFIG } from "../../components/capello/capelloAnimation.js";
import { LEPERS_INTERVENTION_CONFIG } from "../../components/lepers/lepersAnimation.js";
import { PIVOT_INTERVENTION_CONFIG } from "../../components/pivot/pivotAnimation.js";
import { ROMEJKO_INTERVENTION_CONFIG } from "../../components/romejko/romejkoAnimation.js";
import { useChatUnreadState } from "../chat/useChatUnreadState.js";
import { PRESENTER_HINT_KEYS } from "./createPresenterHintsController.js";
import usePresenterHintsController from "./usePresenterHintsController.js";

export const PRESENTERS = Object.freeze([
  {
    key: PRESENTER_HINT_KEYS.romejko,
    config: ROMEJKO_INTERVENTION_CONFIG,
  },
  {
    key: PRESENTER_HINT_KEYS.lepers,
    config: LEPERS_INTERVENTION_CONFIG,
  },
  {
    key: PRESENTER_HINT_KEYS.capello,
    config: CAPELLO_INTERVENTION_CONFIG,
    buttonScale: 1.12,
  },
]);

export const PIVOT_PRESENTER = Object.freeze({
  key: PRESENTER_HINT_KEYS.pivot,
  config: PIVOT_INTERVENTION_CONFIG,
  buttonScale: 1.4,
  buttonOffsetY: "15%",
});

export function HomeActionButton({
  imageKey,
  imageOffsetY = 0,
  imageScale = 1,
  isChatLauncher = false,
  label,
  onClick,
  size = "clamp(58px, 18vw, 68px)",
  unreadCount = 0,
}) {
  return (
    <button
      type="button"
      className="relative inline-flex shrink-0 items-center justify-center select-none"
      style={{ width: size, height: size }}
      onClick={onClick}
      aria-label={label}
      data-chat-launcher-button={isChatLauncher ? "true" : undefined}
    >
      <img
        src={getUiImageUrl(imageKey)}
        alt=""
        aria-hidden="true"
        className="h-full w-full object-contain drop-shadow-md"
        style={{ transform: `translateY(${imageOffsetY}) scale(${imageScale})` }}
        draggable="false"
      />
      {unreadCount > 0 ? (
        <span className="absolute right-[8%] top-[8%] min-w-[20px] h-5 px-1 rounded-full bg-red-600 text-[10px] font-extrabold text-white shadow-md flex items-center justify-center">
          {unreadCount >= 10 ? "9+" : unreadCount}
        </span>
      ) : null}
    </button>
  );
}

export function PresenterButton({
  controller,
  disabled = false,
  presenter,
  state,
  darkMode,
  size = "clamp(58px, 18vw, 68px)",
  shortcutLabel = "",
}) {
  const {
    buttonOffsetY = "0%",
    buttonScale = 1.06,
    config,
    key,
    portrait,
  } = presenter;
  const hasHint = !!state?.hasHint;
  const pending = !!state?.pending;
  const stunned = !!state?.stunned;
  const unavailable = disabled || !hasHint || stunned;
  const buttonUrl = stunned
    ? config.reactionUrls?.stars || config.buttonUrl
    : config.buttonUrl;
  const label = `${config.accessibleName}${
    disabled
      ? " : indisponible pendant cette manche"
      : stunned
      ? " : indisponible jusqu'à la prochaine phase"
      : hasHint
      ? " : afficher l'indice"
      : " : aucun indice disponible"
  }${shortcutLabel ? ` (raccourci ${shortcutLabel})` : ""}`;

  return (
    <div
      className="relative shrink-0 overflow-visible"
      style={{ width: size, height: size }}
    >
      <button
        type="button"
        className={`relative h-full w-full overflow-visible transition-[filter,opacity,transform] active:scale-95 ${
          !unavailable ? "opacity-100" : "opacity-50 grayscale"
        }`}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          controller?.request(key, {
            originRect: {
              height: rect.height,
              left: rect.left,
              top: rect.top,
              width: rect.width,
            },
          });
        }}
        disabled={unavailable}
        aria-label={label}
        title={label}
      >
        {buttonUrl ? (
          <img
            src={buttonUrl}
            alt=""
            className="h-full w-full object-contain drop-shadow-md"
            style={{
              transform: `translateY(${stunned ? "0%" : buttonOffsetY}) scale(${
                stunned ? 1.04 : buttonScale
              })`,
            }}
            draggable="false"
            aria-hidden="true"
          />
        ) : (
          <span className="absolute inset-0 overflow-hidden rounded-full" aria-hidden="true">
            <span
              className="absolute left-1/2 block -translate-x-1/2 bg-no-repeat"
              style={{
                backgroundImage: `url("${config.spriteUrl}")`,
                backgroundPosition: getInterventionFramePosition(
                  config.neutralFrame,
                  config.frameCount
                ),
                backgroundSize: `${config.frameCount * 100}% 100%`,
                height: portrait?.height || "100%",
                top: portrait?.top || 0,
                width: portrait?.width || "100%",
              }}
            />
          </span>
        )}
      </button>
      {pending && !unavailable ? (
        <span
          className="pointer-events-none absolute z-20 flex items-center justify-center rounded-full font-black leading-none text-white animate-pulse"
          style={{
            left: "73%",
            top: "16%",
            width: "clamp(22px, 25%, 30px)",
            height: "clamp(22px, 25%, 30px)",
            transform: "translate(-50%, -50%)",
            border: "2.5px solid #fff8dc",
            background: "radial-gradient(circle at 34% 25%, #ffef83 0 13%, #ff5a36 38%, #c9142f 76%)",
            boxShadow:
              "0 0 0 2px rgba(116, 8, 28, 0.92), 0 0 13px rgba(255, 59, 48, 0.9), inset 0 1px 2px rgba(255,255,255,0.78)",
            fontSize: "15px",
            textShadow: "0 1px 1px rgba(70, 0, 8, 0.9)",
          }}
          aria-hidden="true"
        >
          !
        </span>
      ) : null}
    </div>
  );
}

function MobilePresenterActionBar({
  darkMode = false,
  height = 0,
  hostRef = null,
  onOpenChat,
  onOpenPlayers,
  presentersDisabled = false,
  roundId = null,
}) {
  const controller = usePresenterHintsController();
  const presenterState = React.useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  );
  const { mobileChatUnreadCount } = useChatUnreadState();
  const buttonSize = `min(clamp(44px, 18vw, 68px), ${Math.max(44, height - 8)}px)`;

  React.useEffect(() => {
    controller.setRound(roundId);
  }, [controller, roundId]);

  React.useLayoutEffect(() => {
    if (!hostRef?.current) return undefined;
    return controller.setInterventionHost(hostRef.current, "above");
  }, [controller, hostRef]);

  return (
    <div
      className={`-ml-2 grid w-[calc(100%+16px)] flex-none grid-cols-5 items-center justify-items-center overflow-visible rounded-2xl px-1 ${
        darkMode
          ? "bg-gradient-to-b from-slate-800/55 to-slate-950/85"
          : "bg-gradient-to-b from-white/55 to-slate-200/85"
      }`}
      style={{ height: `${Math.max(0, Math.round(height))}px` }}
      aria-label="Commandes de jeu"
    >
      <div>
        <HomeActionButton
          imageKey={UI_IMAGE_KEYS.home.players}
          imageScale={1.42}
          label="Ouvrir la liste des joueurs"
          onClick={onOpenPlayers}
          size={buttonSize}
        />
      </div>
      {PRESENTERS.map((presenter) => (
        <PresenterButton
          key={presenter.key}
          controller={controller}
          disabled={presentersDisabled}
          presenter={presenter}
          state={presenterState.entries[presenter.key]}
          darkMode={darkMode}
          size={buttonSize}
        />
      ))}
      <div>
        <HomeActionButton
          imageKey={UI_IMAGE_KEYS.home.chat}
          isChatLauncher
          label="Ouvrir le chat"
          onClick={onOpenChat}
          size={buttonSize}
          unreadCount={mobileChatUnreadCount}
        />
      </div>
    </div>
  );
}

function ResultsChatButton({ onClick, size }) {
  const { mobileChatUnreadCount } = useChatUnreadState();
  return (
    <HomeActionButton
      imageKey={UI_IMAGE_KEYS.home.chat}
      isChatLauncher
      label="Ouvrir le chat"
      onClick={onClick}
      size={size}
      unreadCount={mobileChatUnreadCount}
    />
  );
}

export function ResultsActionBar({
  darkMode = false,
  hostRef = null,
  layout = "mobile",
  onOpenChat,
  onOpenPlayers,
  onOpenStats,
  onReturnLobby,
  roundId = null,
}) {
  const controller = usePresenterHintsController();
  const presenterState = React.useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  );
  const desktop = layout === "desktop";
  const buttonSize = desktop ? "min(25cqi, 112px)" : "clamp(58px, 18vw, 68px)";

  React.useLayoutEffect(() => {
    if (desktop) return controller.setInterventionHost(hostRef?.current, "inside-top");
  }, [controller, desktop, hostRef]);

  React.useEffect(() => {
    controller.setRound(roundId);
  }, [controller, roundId]);

  return (
    <div
      className={`grid flex-none items-center justify-items-center overflow-visible rounded-2xl px-1 ${
        desktop
          ? "mt-2 w-full grid-cols-3 border-t border-slate-300 py-2 dark:border-slate-700"
          : "-ml-2 grid-cols-5 h-[clamp(66px,18vw,78px)] w-[calc(100%+16px)]"
      } ${
        darkMode
          ? "bg-gradient-to-b from-slate-800/55 to-slate-950/85"
          : "bg-gradient-to-b from-white/55 to-slate-200/85"
      }`}
      style={desktop ? { containerType: "inline-size" } : undefined}
      aria-label="Commandes des résultats"
    >
      {!desktop ? (
        <HomeActionButton
          imageKey={UI_IMAGE_KEYS.home.players}
          imageScale={1.42}
          label="Ouvrir la liste des joueurs"
          onClick={onOpenPlayers}
          size={buttonSize}
        />
      ) : null}
      <HomeActionButton
        imageKey={UI_IMAGE_KEYS.live.returnRed}
        imageOffsetY="2%"
        imageScale={1.22}
        label="Retourner au lobby"
        onClick={onReturnLobby}
        size={buttonSize}
      />
      <PresenterButton
        controller={controller}
        darkMode={darkMode}
        presenter={PIVOT_PRESENTER}
        size={buttonSize}
        state={presenterState.entries[PRESENTER_HINT_KEYS.pivot]}
      />
      <HomeActionButton
        imageKey={UI_IMAGE_KEYS.home.stats}
        imageOffsetY="-2%"
        imageScale={1.26}
        label="Ouvrir les statistiques"
        onClick={onOpenStats}
        size={buttonSize}
      />
      {!desktop ? <ResultsChatButton onClick={onOpenChat} size={buttonSize} /> : null}
    </div>
  );
}

export const MobileResultsActionBar = React.memo(ResultsActionBar);

export default React.memo(MobilePresenterActionBar);
