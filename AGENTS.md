# Project Collaboration Notes

## Working Style

- Act as a senior engineering collaborator, not just an executor.
- When a requested approach is risky, brittle, or mixes responsibilities, say so plainly and suggest the cleaner option.
- Keep the user's product goal in mind, but push back on shortcuts that would make live operation harder later.
- Do not touch the VM or live deployment unless the user explicitly asks for it in the current conversation.

## Access And Safety

- Sensitive tools must be gated by server-side account authorization, not by hidden UI gestures alone.
- Passwords may be useful as a second barrier, but should not be the primary authorization model.
- Prefer allowlists by authenticated account/user id for live-only powers.
- Keep test/dev controls and real moderation powers separate.

## Dev Menu

- The dev menu is for testing only: forced round types, fake bot medals, chat test fill/clear, bot test chatter/reactions, temporary bot count adjustments.
- Dev access should remain reversible and server-controlled.
- Default local dev accounts are expected to include `Tigre` and `Test`.
- Live dev account allowlists should be configured server-side, for example through environment variables, not hardcoded into the repo.

## Moderation Menu

- Moderation should be a separate menu from the dev menu.
- It should be accessible only to explicitly authorized accounts, so future non-dev moderators can be added safely.
- Expected moderation features:
  - alphabetic list of connected human players;
  - kick;
  - temporary ban, initially 5 minutes;
  - optional temporary chat mute;
  - explicit client-facing reason and remaining delay;
  - server-side audit log with moderator, target, action, duration, and timestamp.
- Prefer moderation by authenticated `userId`; fall back to `installId` for guests; use IP-based restrictions only as a last resort.
- Configure live moderation accounts server-side, for example with `GOBBLE_MOD_ACCOUNTS`, rather than hardcoding live operators into the repo.
