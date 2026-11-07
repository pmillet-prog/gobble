import { applyInfortuneResult, infortuneSectors, INFORTUNE_REWARDS, infortuneLaunchBonus } from "../../shared/infortuneWheel.js";
import { planInfortuneExchanges } from "../../shared/infortuneExchangePlan.js";
import { infortuneLeaders } from '../../shared/infortuneLeaders.js';

export const WORKSHOP_TOURNAMENT_ROUNDS = 4;
const GROUP_ID = "workshop-tournament";

// A local ledger for the interactive workshop, with no socket, account or timer.
// The UI decides when opponents reveal their results; scoring and the frozen
// order of simultaneous exchanges follow the same rules as the live plateau.
export function createWorkshopTournament({ contestants, selfId = "workshop:self", initialBank = 0, random = Math.random }) {
  if (!Array.isArray(contestants) || contestants.length !== 2
    || contestants.some(player => !player?.id || player.id === selfId)
    || new Set(contestants.map(player => player.id)).size !== 2) {
    throw new Error("Le tournoi d’essai demande deux candidats distincts.");
  }
  if (!Number.isSafeInteger(initialBank) || initialBank < 0) throw new Error("Cagnotte initiale invalide.");
  const players = [{ id: selfId, nick: "Toi" }, ...contestants.map(({ id, nick, userId, isBot }) => ({ id, nick, userId, isBot }))];
  const opponentIds = Object.freeze(contestants.map(player => player.id));
  const banks = new Map(players.map(player => [player.id, initialBank]));
  const listeners = new Set(), history = [];
  let round = 0, phase = "wheel", members, exchangeOrder, snapshot, revision = 0;
  let exchangePlan = [], exchangeIndex = 0, scenario = "random";

  function draw(length) {
    const value = Number(random());
    return Math.floor(Math.min(1 - Number.EPSILON, Math.max(0, Number.isFinite(value) ? value : 0)) * length);
  }
  function startRound() {
    round++;
    phase = "wheel";
    exchangePlan = []; exchangeIndex = 0;
    members = new Map(players.map(player => [player.id, {
      spin: "pending", needsExchange: false, choiceMade: false, target: null,
      result: null, quality: null, startBank: banks.get(player.id),
    }]));
    exchangeOrder = players.map(player => player.id);
    for (let i = exchangeOrder.length - 1; i > 0; i--) {
      const j = draw(i + 1);
      [exchangeOrder[i], exchangeOrder[j]] = [exchangeOrder[j], exchangeOrder[i]];
    }
  }
  function refresh() {
    const hidden = round === WORKSHOP_TOURNAMENT_ROUNDS && ["wheel", "exchange-choice"].includes(phase);
    const resolved = ["round-complete", "finale-ready", "finale"].includes(phase);
    const publicMembers = Object.fromEntries(players.map(player => {
      const member = members.get(player.id);
      return [player.id, {
        ...(!hidden || player.id === selfId ? { bank: banks.get(player.id), result: member.result, quality: member.quality, launchBank: member.launchBank } : {}),
        spin: member.spin, needsExchange: member.needsExchange,
        choiceMade: member.choiceMade, target: !hidden || player.id === selfId ? member.target : null,
      }];
    }));
    const pending = opponentIds.filter(id => members.get(id).spin === "pending");
    const previousPending = snapshot?.pendingOpponentIds;
    const pendingOpponentIds = previousPending?.length === pending.length
      && pending.every((id, index) => previousPending[index] === id) ? previousPending : Object.freeze(pending);
    snapshot = {
      round, totalRounds: WORKSHOP_TOURNAMENT_ROUNDS, phase, revision,
      selfId, self: { id: selfId, nick: "Toi", ...publicMembers[selfId] },
      balance: banks.get(selfId),
      finaleBank: phase === "finale" ? banks.get(selfId) : null,
      exchangeEnabled: round === WORKSHOP_TOURNAMENT_ROUNDS,
      choosing: phase === "exchange-choice" && members.get(selfId).needsExchange && !members.get(selfId).choiceMade,
      scenario, exchangeOrder: [...exchangeOrder],
      exchanges: hidden ? [] : exchangePlan, exchangeIndex,
      activeExchange: phase === "exchange-replay" ? exchangePlan[exchangeIndex] : null,
      canAdvance: phase === "round-complete" || phase === "finale-ready",
      leaders: resolved ? infortuneLeaders(players, id => banks.get(id)) : [],
      opponentIds, pendingOpponentIds,
      economy: {
        version: 1, revision, roundNumber: round, hidden,
        exchangeEnabled: round === WORKSHOP_TOURNAMENT_ROUNDS,
        resolvedGroups: resolved ? [GROUP_ID] : [],
        exchangeOrder: { [GROUP_ID]: [...exchangeOrder] }, members: publicMembers,
      },
      // Opponent balances stay private until every result and choice is in.
      history: hidden ? history.map(entry => ({ round: entry.round, hidden: true }))
        : history.map(entry => ({ ...entry, members: Object.fromEntries(Object.entries(entry.members).map(([id, member]) => [id, { ...member }])),
          exchanges: entry.exchanges.map(exchange => ({ ...exchange })) })),
    };
  }
  function publish() {
    revision++;
    refresh();
    for (const listener of listeners) listener();
  }
  function completeRound() {
    history.push({ round, members: Object.fromEntries(players.map(player => {
      const member = members.get(player.id);
      return [player.id, { nick: player.nick, startBank: member.startBank, bank: banks.get(player.id),
        result: member.result, quality: member.quality, target: member.target }];
    })), exchanges: exchangePlan });
    phase = round < WORKSHOP_TOURNAMENT_ROUNDS ? "round-complete" : "finale-ready";
  }
  function settle() {
    if ([...members.values()].some(member => member.spin === "pending")) return;
    if ([...members.values()].some(member => member.needsExchange && !member.choiceMade)) {
      phase = "exchange-choice"; return;
    }
    exchangePlan = planInfortuneExchanges(Object.fromEntries(banks),
      Object.fromEntries([...members].filter(([, m]) => m.needsExchange).map(([id, m]) => [id, m.target])), exchangeOrder).exchanges;
    if (exchangePlan.length) phase = "exchange-replay";
    else completeRound();
  }
  function creditLaunch(id, quality) {
    const member = members.get(id);
    if (phase !== 'wheel' || member?.spin !== 'pending' || member.launchBank != null) return false;
    banks.set(id, banks.get(id) + infortuneLaunchBonus(quality));
    member.launchBank = banks.get(id);
    return true;
  }
  function applyResult(id, result, automaticChoice = false) {
    const member = members.get(id), sectors = infortuneSectors(round === WORKSHOP_TOURNAMENT_ROUNDS);
    if (phase !== "wheel" || !member || member.spin !== "pending" || !Number.isInteger(result?.index) || !sectors[result.index]) return false;
    const forced = round === 4 && (scenario === "all-exchange" || scenario === "self-exchange" && id === selfId || scenario === "opponents-exchange" && id !== selfId);
    const index = forced ? sectors.findIndex(sector => sector.kind === "exchange") : result.index;
    const sector = sectors[index];
    const quality = ["good", "perfect"].includes(result.launchQuality?.kind) ? result.launchQuality.kind : null;
    const launchBonus = sector.kind === "bankrupt" ? 0 : quality === "perfect" ? INFORTUNE_REWARDS.perfect
      : quality === "good" ? INFORTUNE_REWARDS.good : 0;
    creditLaunch(id, quality);
    banks.set(id, applyInfortuneResult(banks.get(id), sector));
    member.spin = "done";
    member.result = Object.freeze({ index, kind: sector.kind, amount: sector.amount, label: sector.label, launchBonus });
    member.quality = quality;
    member.needsExchange = sector.kind === "exchange";
    if (member.needsExchange && automaticChoice) {
      const targets = players.filter(player => player.id !== id);
      member.target = targets[draw(targets.length)].id;
      member.choiceMade = true;
    }
    settle(); publish(); return true;
  }
  function chooseExchange(id) {
    const self = members.get(selfId);
    if (phase !== "exchange-choice" || !self.needsExchange || self.choiceMade || id !== null && !opponentIds.includes(id)) return false;
    self.target = id; self.choiceMade = true;
    settle(); publish(); return true;
  }

  startRound(); refresh();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    setScenario(value) {
      if (!["random", "self-exchange", "opponents-exchange", "all-exchange"].includes(value) || round === 4 && members.get(selfId).spin !== "pending") return false;
      scenario = value; publish(); return true;
    },
    recordResult(result) { return applyResult(selfId, result); },
    launched(value) { if (creditLaunch(selfId, value?.quality?.kind)) publish(); },
    revealOpponent(id) {
      if (!opponentIds.includes(id) || phase !== "wheel" || members.get(id).spin !== "pending") return false;
      return applyResult(id, { index: draw(infortuneSectors(round === WORKSHOP_TOURNAMENT_ROUNDS).length) }, true);
    },
    chooseExchange,
    chooseAutomaticExchange() {
      if (!snapshot.choosing) return false;
      return chooseExchange(null);
    },
    advanceExchange(index) {
      if (phase !== "exchange-replay" || index !== exchangeIndex) return false;
      const exchange = exchangePlan[exchangeIndex];
      banks.set(exchange.from, exchange.targetBank); banks.set(exchange.to, exchange.sourceBank);
      exchangeIndex++;
      if (exchangeIndex === exchangePlan.length) completeRound();
      publish(); return true;
    },
    nextRound() {
      if (phase !== "round-complete") return false;
      startRound(); publish(); return true;
    },
    beginFinale() {
      if (phase !== "finale-ready") return false;
      phase = "finale"; publish(); return true;
    },
  };
}
