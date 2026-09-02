import React from "react";
import { CHAT_REACTION_EMOJIS } from "../chat/chatPresentationConfig.js";
import InterTournamentLobby from "./InterTournamentLobby.jsx";
import LiveSalonScene from "./LiveSalonScene.jsx";
import LiveSalonUtilityBar from "./LiveSalonUtilityBar.jsx";
import MiniTournamentStartOverlay from "./MiniTournamentStartOverlay.jsx";
import TrainingRoundPicker from "./TrainingRoundPicker.jsx";

export default function LiveLobbyScreen({ runtime }) {
  const {
    beginChatEditFromMessage,
    blockedCount,
    blockedEntries,
    chatEditTarget,
    chatInput,
    chatInputDisabled,
    chatInputPlaceholder,
    chatInputRef,
    chatOverlays,
    chatReplyTarget,
    clearChatEditTarget,
    clearChatReplyTarget,
    cycleChatHistory,
    darkMode,
    deleteOwnChatMessage,
    devRoundTypes,
    duelTeam,
    getLiveNickClassName,
    getNowServerMs,
    handleChatInputFocus,
    installId,
    mobileChatUnreadCount,
    openPlayersOverlayAlpha,
    openSettingsPanel,
    openUserMenu,
    openWeeklyStatsOverlay,
    openWordVaultPage,
    playersAlphaList,
    returnToLobby,
    roundPreparing,
    selfNick,
    selfReadyForTournament,
    sendChatReaction,
    setChatInput,
    setChatReplyTargetFromMessage,
    setChatTab,
    setIsChatRulesOpen,
    setShowBlockedList,
    setTournamentReady,
    showBlockedList,
    signalLivePlayerActivity,
    startTrainingRound,
    submitChat,
    tournamentLobby,
    trainingBusy,
    unblockInstallId,
  } = runtime;

    return (
      <>
        <LiveSalonScene
          blockedCount={blockedCount}
          blockedEntries={blockedEntries}
          chatEditTarget={chatEditTarget}
          chatInput={chatInput}
          chatInputDisabled={chatInputDisabled}
          chatInputPlaceholder={chatInputPlaceholder}
          chatInputRef={chatInputRef}
          chatReplyTarget={chatReplyTarget}
          chatTab="messages"
          className="fixed inset-0 z-[1200] live-salon-scene-fullscreen"
          cycleChatHistory={cycleChatHistory}
          darkMode={darkMode}
          getAuthorNickClassName={getLiveNickClassName}
          messagesUnreadCount={mobileChatUnreadCount}
          onChangeChatTab={setChatTab}
          onChatInputFocus={handleChatInputFocus}
          onClearChatEdit={clearChatEditTarget}
          onClearChatReply={clearChatReplyTarget}
          onDeleteOwnMessage={deleteOwnChatMessage}
          onEditOwnMessage={beginChatEditFromMessage}
          onOpenRules={() => setIsChatRulesOpen(true)}
          onOpenUserMenu={openUserMenu}
          onReactToMessage={sendChatReaction}
          onSelectChatReply={setChatReplyTargetFromMessage}
          onToggleBlockedList={() => setShowBlockedList((prev) => !prev)}
          onUnblockInstallId={unblockInstallId}
          onUserActivity={signalLivePlayerActivity}
          reactionEmojis={CHAT_REACTION_EMOJIS}
          salonControls={
            <InterTournamentLobby
              lobby={tournamentLobby}
              onBack={returnToLobby}
              onReady={setTournamentReady}
              selfReady={selfReadyForTournament}
              team={duelTeam}
              trainingControl={
                <TrainingRoundPicker
                  darkMode={darkMode}
                  devRoundTypes={devRoundTypes}
                  lobby={tournamentLobby}
                  onTrainingStart={startTrainingRound}
                  team={duelTeam}
                  trainingBusy={trainingBusy}
                  variant="art"
                />
              }
            />
          }
          selfInstallId={installId}
          selfNick={selfNick}
          setChatInput={setChatInput}
          showBlockedList={showBlockedList}
          submitChat={submitChat}
          team={duelTeam}
          utilityControls={
            <LiveSalonUtilityBar
              humanCount={
                Number.isFinite(tournamentLobby?.totalHumanCount)
                  ? tournamentLobby.totalHumanCount
                  : playersAlphaList.filter((entry) => !entry?.isBot).length
              }
              onOpenPlayers={openPlayersOverlayAlpha}
              onOpenSettings={openSettingsPanel}
              onOpenStats={openWeeklyStatsOverlay}
              onOpenVault={openWordVaultPage}
            />
          }
        />
        {chatOverlays}
        <MiniTournamentStartOverlay
          lobby={tournamentLobby}
          preparing={!!roundPreparing}
          serverNowMs={getNowServerMs()}
        />
      </>
    );
}
