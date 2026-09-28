export function isAdminAccount(user, config = {}, env = process.env) {
  if (!user?.id) return false;
  const entries = value => Array.isArray(value) ? value : String(value || "").split(",");
  const names = [env.GOBBLE_ADMIN_ACCOUNTS, config.adminAccounts].flatMap(entries).map(value => String(value).trim().toLocaleLowerCase("fr"));
  const ids = [env.GOBBLE_ADMIN_USER_IDS, config.adminUserIds].flatMap(entries).map(value => String(value).trim());
  // Existing server-controlled dev accounts are the administrators unless an
  // explicit admin allowlist is provided. Moderators gain no account powers.
  const explicit = names.some(Boolean) || ids.some(Boolean);
  if (!explicit) {
    names.push(...(config.devAccountNames || []));
    ids.push(...(config.devAccountIds || []));
  }
  return ids.includes(String(user.id)) || names.includes(String(user.usernameDisplay || user.username_display || user.usernameNormalized || user.username_normalized || "").trim().toLocaleLowerCase("fr"));
}
