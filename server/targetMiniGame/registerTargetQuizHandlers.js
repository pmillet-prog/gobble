import { recordTargetQuizResult } from "./targetQuizRoundResults.js";
import { normalizeTargetQuizSummary } from "../../shared/targetQuizSummary.js";

export const targetQuizRoundKey = (roomId, roundId) => `${roomId}#${roundId}`;

export function resolveTargetQuizContext(socket, payload, {
  getRoom, getSocketPlayerIdentity, areDevToolsAllowedForSocket, now = Date.now,
}) {
  const identity = getSocketPlayerIdentity(socket);
  if (!identity) throw new Error("auth_required");
  const room = getRoom(socket.roomId);
  const player = room?.players?.get(socket.id);
  if (!player || player.connected === false || String(player.token || "").startsWith("bot-")) {
    throw new Error("not_logged_in");
  }
  if (Number(player.userId) !== Number(identity.userId)) throw new Error("not_logged_in");
  const round = room.currentRound;
  // Both the older room training and standalone training stay excluded,
  // including when a developer requests a simulation.
  if (round?.training || player.standaloneTraining?.sessionId) throw new Error("training_disabled");
  if (!round || String(payload?.roundId) !== String(round.id)) throw new Error("stale_round");
  if (round.status !== "running" || !(round.endsAt > now())) throw new Error("round_finished");
  const devPreview = payload?.devPreview === true;
  if (devPreview) {
    if (!areDevToolsAllowedForSocket(socket)) throw new Error("account_not_allowed");
  } else {
    if (!["target_long", "target_score"].includes(round.special?.type)) throw new Error("not_target_round");
    if (!round.targetFoundAt?.has(player.nick)) throw new Error("target_not_found");
    if (round.endsAt - Number(round.targetFoundAt.get(player.nick)) <= 5000) throw new Error("target_found_too_late");
  }
  const userId = Number(identity.userId);
  const identityKey = Number.isSafeInteger(userId) && userId > 0
    ? `user:${userId}` : `install:${identity.installId}`;
  if (identityKey === "install:undefined" || identityKey === "install:") throw new Error("not_logged_in");
  return {
    playerKey: `${devPreview ? "dev:" : ""}${identityKey}`,
    roundId: targetQuizRoundKey(room.id, round.id),
    publicRoundId: round.id,
    endsAt: devPreview ? Math.min(round.endsAt, now() + 90_000) : round.endsAt,
    roundEndsAt: round.endsAt,
    room, devPreview,
  };
}

export function createTargetQuizSocketHandlers({ service, logger = console, markActivity, ...dependencies }) {
  const owners = new Map();

  function register(socket) {
    let binding = null;
    let connected = true;
    let queue = Promise.resolve();
    let queued = 0;
    let dismissal = null;

    function bindQuestion(response) {
      const token = response.nextQuestion?.questionToken || response.question?.questionToken || null;
      if (token !== binding.questionToken) binding.questionShown = false;
      binding.questionToken = token;
      binding.feedbackToken = binding.questionShown ? null : response.feedback?.questionToken || null;
    }

    function ownsQuestionToken(questionToken) {
      return questionToken === binding?.questionToken ||
        questionToken === binding?.feedbackToken;
    }

    function release() {
      if (binding && owners.get(binding.playerKey) === socket.id) owners.delete(binding.playerKey);
      binding = null;
    }

    async function stopCurrent(questionToken) {
      if (!binding || owners.get(binding.playerKey) !== socket.id) return { ok: true, phase: "stopped" };
      const current = binding;
      const response = await service.stop({
        playerKey: current.playerKey, roundId: current.roundId,
        ...(questionToken ? { questionToken } : {}),
      });
      if (!questionToken || ownsQuestionToken(questionToken)) release();
      return { ...response, roundId: current.publicRoundId };
    }

    function handle(event, action) {
      socket.on(event, (payload = {}, callback) => {
        const reply = typeof callback === "function" ? callback : () => {};
        if (!connected || queued >= 8) { reply({ ok: false, error: "quiz_busy" }); return; }
        queued += 1;
        const work = async () => {
          try {
            if (!connected) return;
            const result = await action(payload && typeof payload === "object" ? payload : {});
            if (connected) reply(result);
          } catch (error) {
            if (connected) reply({ ok: false, error: error?.message || "quiz_unavailable" });
          } finally { queued -= 1; }
        };
        queue = queue.then(work, work);
      });
    }

    handle("targetQuiz:start", async payload => {
      const context = resolveTargetQuizContext(socket, payload, dependencies);
      if (binding && (binding.playerKey !== context.playerKey || binding.roundId !== context.roundId)) {
        await stopCurrent();
      }
      const owner = owners.get(context.playerKey);
      if (owner && owner !== socket.id) throw new Error("quiz_in_use");
      const wasBound = !!binding;
      owners.set(context.playerKey, socket.id);
      binding = { ...context, questionToken: binding?.questionToken || null };
      try {
        const response = await service.start({ ...context, onSummary: summary => {
          recordTargetQuizResult(context, summary);
          // Private delivery also survives a last-second answer or closing the panel.
          socket.emit("targetQuiz:progress", { roundId: context.publicRoundId, ...normalizeTargetQuizSummary(summary), streak: summary.streak });
        } });
        bindQuestion(response);
        try {
          if (!connected) throw new Error("not_logged_in");
          const current = resolveTargetQuizContext(socket, payload, dependencies);
          if (current.playerKey !== context.playerKey || current.roundId !== context.roundId) throw new Error("stale_round");
        } catch (error) {
          await stopCurrent();
          throw error;
        }
        return { ...response, roundId: context.publicRoundId };
      } catch (error) {
        if (!wasBound) release();
        throw error;
      }
    });

    for (const [event, method] of [["targetQuiz:shown", "shown"], ["targetQuiz:answer", "answer"]]) {
      handle(event, async payload => {
        if (!binding || String(payload.roundId) !== String(binding.publicRoundId)) throw new Error("stale_round");
        if (owners.get(binding.playerKey) !== socket.id) throw new Error("quiz_in_use");
        const context = resolveTargetQuizContext(socket, { ...payload, devPreview: binding.devPreview }, dependencies);
        if (context.playerKey !== binding.playerKey || context.roundId !== binding.roundId) throw new Error("stale_round");
        if (typeof payload.questionToken !== "string" || payload.questionToken.length > 128) throw new Error("invalid_question_token");
        const response = await service[method]({
          playerKey: binding.playerKey, roundId: binding.roundId,
          questionToken: payload.questionToken, choiceIndex: payload.choiceIndex,
        });
        if (response.question || response.nextQuestion) bindQuestion(response);
        if (method === "shown" && payload.questionToken === binding.questionToken) {
          binding.questionShown = true;
          binding.feedbackToken = null;
        }
        if (method === "answer") markActivity?.(context.room, socket, "target_quiz_answer");
        return { ...response, roundId: binding.publicRoundId };
      });
    }

    handle("targetQuiz:dismiss", async payload => {
      if (dismissal && String(payload.roundId) === String(dismissal.context.publicRoundId)) {
        const context = resolveTargetQuizContext(socket, { ...payload, devPreview: dismissal.context.devPreview }, dependencies);
        if (context.playerKey === dismissal.context.playerKey) return dismissal.response;
      }
      if (!binding || String(payload.roundId) !== String(binding.publicRoundId)) throw new Error("stale_round");
      if (owners.get(binding.playerKey) !== socket.id) throw new Error("quiz_in_use");
      const context = resolveTargetQuizContext(socket, { ...payload, devPreview: binding.devPreview }, dependencies);
      if (context.playerKey !== binding.playerKey || context.roundId !== binding.roundId) throw new Error("stale_round");
      const response = await service.dismiss(context);
      dismissal = { context, response: { ...response, roundId: context.publicRoundId } };
      release();
      return dismissal.response;
    });

    handle("targetQuiz:stop", async payload => {
      if (!binding || String(payload.roundId) !== String(binding.publicRoundId)) return { ok: true, phase: "stopped" };
      // A delayed unmount from an old question must never stop its successor.
      if (payload.questionToken && !ownsQuestionToken(payload.questionToken)) return { ok: true, phase: "stopped" };
      return stopCurrent(payload.questionToken);
    });

    socket.on("disconnect", () => {
      connected = false;
      queue = queue.then(() => stopCurrent(), () => stopCurrent()).catch(error => {
        logger.warn("[target-quiz] disconnect save failed", error?.message || error);
        release();
      });
    });
  }

  async function closeRoomRound(roomId, roundId) {
    if (roundId == null) return;
    const roundKey = targetQuizRoundKey(roomId, roundId);
    await service.closeRound(roundKey);
    // Bindings stay until the client's stop/disconnect; they cannot answer a
    // closed round, and start releases them before entering a different round.
  }

  return { register, closeRoomRound };
}
