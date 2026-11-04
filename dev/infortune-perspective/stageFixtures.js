// Fictional workshop entrants. No account, network ranking or saved avatar is changed.
export const STAGE_ACTOR_BASE_Y = 110;
const CONTESTANT_BASE_Y = STAGE_ACTOR_BASE_Y - 30;
export const STAGE_CONTESTANTS = Object.freeze([
  { id: "alix", nick: "ALIX", color: "#39b8bb", position: [345, CONTESTANT_BASE_Y, 355], height: 290,
    avatar: { base: "femme", hair: "pixie", hairColor: "#863e27", brows: "arched", eyes: "almond", irisColor: "#4e8a7a", nose: "short", mouths: "full_neutral", clothes: "turtleneck_femme", clothesColor: "#299da5", glasses: "vue_ronde", glassesColor: "#785e42" } },
  { id: "sam", nick: "SAM", color: "#e38d61", position: [-345, CONTESTANT_BASE_Y, 355], height: 290,
    avatar: { base: "homme", hair: "shortcurls", hairColor: "#38251b", brows: "bushy", eyes: "smiling", irisColor: "#835b38", nose: "wide", mouths: "wide_neutral", clothes: "shirt_homme", clothesColor: "#dc8154", facialhair: "", tone: "custom", customColor: "#bd8059" } },
]);
export const STAGE_HOST = Object.freeze({ position: [0, STAGE_ACTOR_BASE_Y, 490], height: 290 });
export const STAGE_FLOOR = -150;

// Placements belong to the studio; names and account identities belong to the
// round. Undefined explicitly retains the standalone workshop's demo entrants.
export function placeStageContestants(players = STAGE_CONTESTANTS) {
  return players.slice(0, 2).map((player, index) => ({ ...player,
    position: [...STAGE_CONTESTANTS[index].position], height: STAGE_CONTESTANTS[index].height,
    color: STAGE_CONTESTANTS[index].color }));
}
