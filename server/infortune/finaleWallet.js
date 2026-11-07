export function createFinaleWallet({ persistence, roomId, tournamentId, onBalance }) {
  return {
    async read(entry) {
      if (!entry.installId) return null;
      return persistence.readFinaleWallet({ installId: entry.installId });
    },
    async pay(entry, purchase) {
      if (!entry.installId) return { ok: false, error: 'unavailable' };
      const result = await persistence.payFinaleLetter({ ...purchase, installId: entry.installId,
        purchaseKey: `${roomId}:${tournamentId}:${purchase.letter}:${purchase.requestId}`,
        meta: { roomId, tournamentId, letter: purchase.letter, nick: entry.nick } });
      if (Number.isFinite(result?.balance)) onBalance?.(entry, result.balance);
      return result;
    },
  };
}
