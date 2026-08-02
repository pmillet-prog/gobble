export function isTrainingRound(round) {
  return !!round?.training;
}

export function shouldPersistRoundProgress(round) {
  return !!round && !isTrainingRound(round);
}
