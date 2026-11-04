import { infortunePlayerKey } from "../../shared/infortunePlateaus.js";
import { PRESENTER_IDENTITIES } from "../../shared/presenterIdentities.js";
import { INFORTUNE_REWARDS, infortuneSectors, applyInfortuneResult } from "../../shared/infortuneWheel.js";

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
  timers = globalThis, onChange = () => {} }) {
  const sectors = infortuneSectors(policy.exchangeEnabled), members = new Map(), resolved = new Set();
  const order = new Map(groups.map(group => [group.id, shuffled(group.members.map(p => p.id), random)]));
  const deadlineAt = policy.openedAt + policy.windowMs;
  let revision = 0, timer = null, closed = false;
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
      bank: player.isBot ? ledger.presenters.get(player.presenterKey) || 0 : null });
  }
  const bank = member => member.player.isBot ? member.bank : ledger.banks.get(member.player.id) || 0;
  const setBank = (member, value) => { if (member.player.isBot) member.bank = value; else ledger.banks.set(member.player.id, value); };
  function snapshot() {
    return { version: 1, revision, roundNumber: policy.roundNumber, hidden: !!policy.banksHidden,
      exchangeEnabled: !!policy.exchangeEnabled, deadlineAt, resolvedGroups: [...resolved],
      exchangeOrder: Object.fromEntries(order),
      members: Object.fromEntries([...members].map(([id, member]) => [id, {
        ...(!policy.banksHidden ? { bank: bank(member) } : {}), spin: member.spin,
        needsExchange: member.needsExchange, choiceMade: member.choiceMade, target: member.target,
      }])) };
  }
  function settleGroups(force = false) {
    for (const group of groups) {
      if (resolved.has(group.id)) continue;
      const candidates = group.members.map(p => members.get(p.id));
      if (!force && candidates.some(m => m.spin === "pending" || m.needsExchange && !m.choiceMade)) continue;
      for (const member of candidates) if (member.spin === "pending") member.spin = "skipped";
      for (const id of order.get(group.id)) {
        const member = members.get(id), other = members.get(member.target);
        if (!member.needsExchange || !other) continue;
        const previous = bank(member); setBank(member, bank(other)); setBank(other, previous);
      }
      resolved.add(group.id);
    }
    if (resolved.size === groups.length) { closed = true; if (timer !== null) timers.clearTimeout(timer); timer = null; }
  }
  function publish() { revision++; onChange(snapshot()); }
  function close() { if (closed) return; settleGroups(true); publish(); }
  function submit(id, action) {
    if (now() >= deadlineAt) close();
    const member = members.get(id);
    if (!member || member.player.isBot) return { ok: false, error: "Ce plateau ne t’est pas attribué." };
    if (action.type === "snapshot") return { ok: true, economy: snapshot() };
    // Repeated requests/acks are harmless, including after settlement.
    if (action.type === "spin" && member.spin !== "pending" || action.type === "exchange" && member.choiceMade)
      return { ok: true, economy: snapshot() };
    if (closed || resolved.has(member.group.id)) return { ok: false, error: "Le temps du plateau est écoulé.", economy: snapshot() };
    if (action.type === "spin") {
      if (action.skip) member.spin = "skipped";
      else {
        if (!Number.isInteger(action.index) || !sectors[action.index]) return { ok: false, error: "Secteur invalide." };
        const sector = sectors[action.index];
        setBank(member, applyInfortuneResult(bank(member), sector, action.quality));
        member.spin = "done"; member.needsExchange = sector.kind === "exchange";
      }
    } else if (action.type === "exchange") {
      const target = members.get(action.target);
      if (!member.needsExchange || !target || target === member || target.group !== member.group)
        return { ok: false, error: "Choisis l’un des deux candidats de ton plateau." };
      member.choiceMade = true; member.target = action.target;
    } else return { ok: false, error: "Action inconnue." };
    settleGroups(); publish(); return { ok: true, economy: snapshot() };
  }
  settleGroups();
  if (!closed) { timer = timers.setTimeout(close, Math.max(0, deadlineAt - now())); timer?.unref?.(); }
  return { snapshot, submit, close, dispose() { if (timer !== null) timers.clearTimeout(timer); timer = null; closed = true; } };
}
