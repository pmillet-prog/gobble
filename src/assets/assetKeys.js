export const IMAGE_KEYS = {
  favicon: "img_favicon",
  gobbleBadge: "img_gobble_badge",
  gobblarsBadge: "img_gobblars_badge",
  bigwords: {
    gobble: "img_bigwords_gobble",
    doubleGobble: "img_bigwords_double_gobble",
    epique: "img_bigwords_epique",
    enorme: "img_bigwords_enorme",
    excellent: "img_bigwords_excellent",
    fabuleux: "img_bigwords_fabuleux",
  },
  vocab: {
    creche: "img_vocab_creche",
    maternelle: "img_vocab_maternelle",
    primaire: "img_vocab_primaire",
    college: "img_vocab_college",
    lycee: "img_vocab_lycee",
    bac: "img_vocab_bac",
    prepa: "img_vocab_prepa",
    universite: "img_vocab_universite",
    licence: "img_vocab_licence",
    master: "img_vocab_master",
    doctorat: "img_vocab_doctorat",
    academie: "img_vocab_academie",
  },
};

export const SFX_KEYS = {
  gobbleVoice: "sfx_gobble_voice",
  doubleGobbleVoice: "sfx_double_gobble_voice",
  blackHole: "sfx_black_hole",
  chebabeu: "sfx_chebabeu",
  clavier: "sfx_clavier",
  souris: "sfx_souris",
  shortWord: "sfx_short_word",
  roundStart: "sfx_round_start",
  specialFound: "sfx_special_found",
  tictac10: "sfx_tictac10",
  coeur: "sfx_coeur",
  tictoc: "sfx_tictoc",
  vocabOverlay: "sfx_vocab_overlay",
  vocabCling: "sfx_vocab_cling",
  invalidWord: "sfx_invalid_word",
  dejaJoue: "sfx_deja_joue",
  uiClick: "sfx_ui_click",
  uiClose: "sfx_ui_close",
  tournamentFireworks: "sfx_tournament_fireworks",
  tournamentApplause: "sfx_tournament_applause",
  clickAlt: "sfx_ui_click2",
  errorAlt: "sfx_error_alt",
};

export function makeIncrementalSfxKey(label) {
  return `sfx_tile_step_${label}`;
}

export function makeScoreSfxKey(label) {
  return `sfx_score_${label}`;
}

export function makeScore2SfxKey(label) {
  return `sfx_score2_${label}`;
}
