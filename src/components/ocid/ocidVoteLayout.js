export const OCID_BOT_OPTION_LIMITS = Object.freeze({
  compact: 14,
  regular: 20,
});

export function selectVisibleOcidVoteOptions(options, { compact = false } = {}) {
  const allOptions = Array.isArray(options) ? options.filter((option) => option?.id) : [];
  const botLimit = compact ? OCID_BOT_OPTION_LIMITS.compact : OCID_BOT_OPTION_LIMITS.regular;
  if (allOptions.length <= botLimit) {
    return { hiddenBotCount: 0, options: allOptions };
  }
  const optionsWithoutBots = allOptions.filter((option) => !option?.botOnly);
  return {
    hiddenBotCount: allOptions.length - optionsWithoutBots.length,
    options: optionsWithoutBots,
  };
}

export function getOcidVoteGridLayout(optionCount, { compact = false } = {}) {
  const count = Math.max(1, Number(optionCount) || 1);
  const singleColumnLimit = compact ? 7 : 8;
  const twoColumnLimit = compact ? 18 : 20;
  const targetRows = compact ? 7 : 8;
  const columns =
    count <= singleColumnLimit
      ? 1
      : count <= twoColumnLimit
      ? 2
      : Math.min(4, Math.max(3, Math.ceil(count / targetRows)));
  const rows = Math.max(1, Math.ceil(count / columns));
  const fontSizePx = compact
    ? rows <= 6
      ? 12
      : rows <= 8
      ? 10
      : 9
    : rows <= 7
    ? 14
    : rows <= 9
    ? 12
    : 10;
  return { columns, fontSizePx, rows };
}
