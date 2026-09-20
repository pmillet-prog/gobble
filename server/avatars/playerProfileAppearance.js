import { userAvatars, avatarInventory } from "../auth/authService.js";
import { getDailyMedalsForUser } from "../stats/dailyMedalsService.js";

export async function getPlayerProfileAppearance(userId) {
  const saved = await userAvatars.get(userId);
  const inventory = await avatarInventory.get(userId);
  const avatar = await avatarInventory.appearance(userId, saved.avatar, inventory);
  return { avatar, dailyMedals: getDailyMedalsForUser(userId), avatarStats: { lepersCorrectAnswers: inventory.lepersCorrectAnswers } };
}
