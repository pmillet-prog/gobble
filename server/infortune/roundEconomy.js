import { infortunePlayerKey } from "../../shared/infortunePlateaus.js";
import { PRESENTER_IDENTITIES } from "../../shared/presenterIdentities.js";
import { INFORTUNE_REWARDS, infortuneSectors, applyInfortuneResult, infortuneLaunchBonus } from "../../shared/infortuneWheel.js";
import { INFORTUNE_EXCHANGE_CHOICE_MS, planInfortuneExchanges } from "../../shared/infortuneExchangePlan.js";

// Attached to the tournament, not a socket or a nickname. A reconnect preserves
// the account; replacing the tournament releases its ledger naturally.
export function createInfortuneLedger() {
  return { banks: new Map(), creditedRounds: new Set(), presenters: new Map(), presenterResults: new Map(), presenterRound: 0 };
}
export function creditInfortuneGobbles(ledger, roundId, players, gobbles) {
  if (ledger.creditedRounds.has(roundId)) return;
  ledger.creditedRounds.add(roundId);
  const credited = new Set();
  for (const player of players) {
    const key = infortunePlayerKey(player);
    if (!key || player.isBot || credited.has(key)) continue;
    credited.add(key);
    const count = Math.max(0, Math.floor(Number(gobbles?.get(player.nick)) || 0));
    ledger.banks.set(key, (ledger.banks.get(key) || 0) + count * INFORTUNE_REWARDS.gobble);
  }
}
function shuffled(values, random) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function createInfortuneRoundEconomy({ ledger, policy, groups, now = Date.now, random = Math.random,
  timers = globalThis, onChange = () => {}, onReward = () => {} }) {
  const sectors = infortuneSectors(policy.exchangeEnabled), members = new Map(), resolved = new Set(), replays = new Map();
  const order = new Map(groups.map(group => [group.id, shuffled(group.members.map(p => p.id), random)]));
  const deadlineAt = policy.openedAt + policy.windowMs;
  const spinDeadlineAt = deadlineAt - (policy.exchangeEnabled ? INFORTUNE_EXCHANGE_CHOICE_MS : 0);
  let revision = 0, timer = null, choiceTimer = null, closed = false;
  // All presenter identities advance once per round, including those not cast
  // that round. Each appearance gets a private copy: exchanges never cross trios.
  while (ledger.presenterRound < policy.roundNumber) {
    for (const key of Object.keys(PRESENTER_IDENTITIES)) {
      const pool = infortuneSectors(ledger.presenterRound + 1 === 4);
      const sector = pool[Math.floor(random() * pool.length)];
      ledger.presenters.set(key, applyInfortuneResult(ledger.presenters.get(key) || 0, sector));
      ledger.presenterResults.set(key, sector.kind);
    }
    ledger.presenterRound++;
  }
  for (const group of groups) for (const player of group.members) {
    if (!player.isBot && !ledger.banks.has(player.id)) ledger.banks.set(player.id, 0);
    const exchange = player.isBot && policy.exchangeEnabled && ledger.presenterResults.get(player.presenterKey) === "exchange";
    const opponents = group.members.filter(other => other.id !== player.id);
    members.set(player.id, { player, group, spin: player.isBot ? "done" : "pending", needsExchange: !!exchange,
      choiceMade: !!exchange, target: exchange ? opponents[Math.floor(random() * opponents.length)].id : null,
      presented: !!player.isBot, launchUntil: null, choiceUntil: null, bank: player.isBot ? ledger.presenters.get(player.presenterKey) || 0 : null });
  }
  const bank = member => member.player.isBot ? member.bank : ledger.banks.get(member.player.id) || 0;
  const setBank = (member, value) => { if (member.player.isBot) member.bank = value; else ledger.banks.set(member.player.id, value); };
  function snapshot(viewerId) {
    return { version: 1, revision, roundNumber: policy.roundNumber, hidden: !!policy.banksHidden,
      exchangeEnabled: !!policy.exchangeEnabled, openedAt: policy.openedAt, deadlineAt, spinDeadlineAt,
      choiceUntil: members.get(viewerId)?.choiceUntil || Math.max(0, ...[...members.values()].filter(member => !member.choiceMade).map(member => member.choiceUntil || 0)) || null,
      resolvedGroups: [...resolved],
      pendingLaunches: [...members.values()].filter(member => member.spin === 'pending' && member.launchBonus == null).length,
      pendingResults: [...members.values()].filter(member => member.spin === 'pending').length,
      complete: closed && [...members.values()].every(member => member.presented),
      exchangeOrder: Object.fromEntries(order),
      exchangeReplays: Object.fromEntries([...replays].map(([id, exchanges]) => [id, exchanges.map(exchange => ({ ...exchange }))])),
      members: Object.fromEntries([...members].map(([id, member]) => [id, {
        ...(!policy.banksHidden || id === viewerId || resolved.has(member.group.id) ? { bank: bank(member) } : {}),
        launchUntil: member.launchUntil, choiceUntil: member.choiceUntil,
        launched: member.launchBonus != null || member.spin === 'done', presented: member.presented,
        ...(id === viewerId ? { result: member.result || null, launchBonus: member.launchBonus, launchBank: member.launchBank } : {}),
        revealed: resolved.has(member.group.id), spin: member.spin,
        needsExchange: member.needsExchange, choiceMade: member.choiceMade, target: member.target,
      }])) };
  }
  function settleGroups(force = false) {
    // Each choice gets its own full window after that player's camera returns.
    // A slow participant in another trio must not postpone this decision.
    if (policy.exchangeEnabled) for (const member of members.values()) {
      if (!member.needsExchange || member.choiceMade || !member.presented) continue;
      member.choiceUntil ||= Math.min(deadlineAt, now() + INFORTUNE_EXCHANGE_CHOICE_MS);
      if (now() >= member.choiceUntil) {
        member.target = null;
        member.choiceMade = true;
      }
    }
    for (const group of groups) {
      if (resolved.has(group.id)) continue;
      const candidates = group.members.map(p => members.get(p.id));
      if (!force && candidates.some(m => m.spin === "pending" || m.needsExchange && !m.choiceMade || policy.exchangeEnabled && !m.presented)) continue;
      for (const member of candidates) {
        if (member.spin === "pending") automaticSpin(member);
        if (member.needsExchange && !member.choiceMade) {
          member.target = null;
          member.choiceMade = true;
        }
      }
      const plan = planInfortuneExchanges(Object.fromEntries(candidates.map(member => [member.player.id, bank(member)])),
        Object.fromEntries(candidates.filter(member => member.needsExchange).map(member => [member.player.id, member.target])), order.get(group.id));
      for (const member of candidates) setBank(member, plan.banks[member.player.id]);
      replays.set(group.id, plan.exchanges);
      resolved.add(group.id);
    }
    if (resolved.size === groups.length) {
      closed = true; if (timer !== null) timers.clearTimeout(timer); if (choiceTimer !== null) timers.clearTimeout(choiceTimer);
      timer = choiceTimer = null;
    } else {
      if (choiceTimer !== null) timers.clearTimeout(choiceTimer);
      const deadlines = [...members.values()].filter(member => member.choiceUntil && !member.choiceMade).map(member => member.choiceUntil);
      choiceTimer = deadlines.length ? timers.setTimeout(() => { choiceTimer = null; settleGroups(); publish(); }, Math.max(0, Math.min(...deadlines) - now())) : null;
      choiceTimer?.unref?.();
    }
  }
  function automaticSpin(member) {
    const index = Math.floor(random() * sectors.length), sector = sectors[index], before = bank(member);
    setBank(member, applyInfortuneResult(bank(member), sector));
    member.result = { index, sector, before, after: bank(member), automatic: true };
    member.spin = "done"; member.needsExchange = sector.kind === "exchange";
    onReward(member.player.id, member.result);
  }
  function creditLaunch(member, quality) {
    if (member.launchBonus != null) return;
    member.launchBonus = infortuneLaunchBonus(quality);
    setBank(member, bank(member) + member.launchBonus);
    member.launchBank = bank(member);
  }
  function finishSpins() {
    if (closed) return;
    for (const member of members.values()) if (member.spin === "pending") automaticSpin(member);
    for (const member of members.values()) member.presented = true;
    settleGroups(); publish();
  }
  function publish() { revision++; onChange(snapshot()); }
  function close() { if (closed) return; settleGroups(true); publish(); }
  function submit(id, action) {
    if (now() >= deadlineAt) close();
    else if (now() >= spinDeadlineAt) finishSpins();
    const member = members.get(id);
    if (!member || member.player.isBot) return { ok: false, error: "Ce plateau ne t’est pas attribué." };
    if (action.type === "snapshot") return { ok: true, economy: snapshot(id) };
    if (now() < policy.openedAt) return { ok: false, error: "La roue ouvre après les résultats." };
    if ([...members.values()].some(candidate => candidate.choiceUntil && !candidate.choiceMade && now() >= candidate.choiceUntil)) { settleGroups(); publish(); }
    if (action.type === "presented") {
      if (member.spin === "pending") return { ok: false, error: "Le lancer n’est pas terminé." };
      if (!member.presented) { member.presented = true; settleGroups(); publish(); }
      return { ok: true, economy: snapshot(id) };
    }
    if (action.type === "ready" && !closed) {
      member.launchUntil ||= Math.min(spinDeadlineAt, now() + policy.launchWindowMs);
      return { ok: true, economy: snapshot(id) };
    }
    // Repeated requests/acks are harmless, including after settlement.
    if (action.type === 'launch' && (member.launchBonus != null || member.spin !== 'pending'))
      return { ok: true, economy: snapshot(id) };
    if (action.type === "spin" && member.spin !== "pending" || action.type === "exchange" && member.choiceMade)
      return { ok: true, economy: snapshot(id) };
    if (closed || resolved.has(member.group.id)) return { ok: false, error: "Le temps du plateau est écoulé.", economy: snapshot(id) };
    if (action.type === 'launch') {
      creditLaunch(member, action.quality); publish(); return { ok: true, economy: snapshot(id) };
    } else if (action.type === "spin") {
      if (action.skip) automaticSpin(member);
      else {
        if (!Number.isInteger(action.index) || !sectors[action.index]) return { ok: false, error: "Secteur invalide." };
        // Also accepts older clients whose first acknowledged message is the result.
        creditLaunch(member, action.quality);
        const sector = sectors[action.index], before = bank(member);
        setBank(member, applyInfortuneResult(bank(member), sector));
        member.result = { index: action.index, sector, before, after: bank(member), automatic: false };
        member.spin = "done"; member.needsExchange = sector.kind === "exchange";
        onReward(member.player.id, member.result);
      }
    } else if (action.type === "exchange") {
      if (!member.choiceUntil) return { ok: false, error: "Ton lancer se termine.", economy: snapshot(id) };
      const target = members.get(action.target);
      if (!member.needsExchange || action.target !== null && (!target || target === member || target.group !== member.group))
        return { ok: false, error: "Choisis l’un des deux candidats de ton plateau." };
      member.choiceMade = true; member.target = action.target;
    } else return { ok: false, error: "Action inconnue." };
    settleGroups(); publish(); return { ok: true, economy: snapshot(id) };
  }
  settleGroups();
  if (!closed) { timer = timers.setTimeout(finishSpins, Math.max(0, spinDeadlineAt - now())); timer?.unref?.(); }
  return { snapshot, submit, close, dispose() { if (timer !== null) timers.clearTimeout(timer); if (choiceTimer !== null) timers.clearTimeout(choiceTimer); timer = choiceTimer = null; closed = true; } };
}
