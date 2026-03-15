import {
  findUserForAdmin,
  initAuthService,
  markMustResetPassword,
} from "../auth/authService.js";

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return "";
  return String(process.argv[index + 1] || "").trim();
}

async function main() {
  const username = readArg("--username");
  const rawUserId = readArg("--user-id");
  const userId = Number(rawUserId);

  if (!username && !(Number.isFinite(userId) && userId > 0)) {
    console.error("Usage: node ./scripts/auth-force-reset.js --username <pseudo>");
    console.error("   ou: node ./scripts/auth-force-reset.js --user-id <id>");
    process.exitCode = 1;
    return;
  }

  await initAuthService();
  const user = await findUserForAdmin({
    userId: Number.isFinite(userId) && userId > 0 ? userId : null,
    username,
  });

  if (!user) {
    console.error("Utilisateur introuvable.");
    process.exitCode = 1;
    return;
  }

  await markMustResetPassword(user.id, { invalidateSessions: true });
  console.log(
    JSON.stringify(
      {
        ok: true,
        userId: user.id,
        usernameDisplay: user.usernameDisplay,
        mustResetPassword: true,
        sessionsInvalidated: true,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err?.stack || err?.message || String(err));
  process.exitCode = 1;
});
