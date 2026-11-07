import { RELEASE_SCOPE } from "../../../shared/releaseScope.js";

// Local Vite sessions can exercise the real tournament integration. A shipped
// client still requires the release gate, even when an old server advertises it.
export const INFORTUNE_CLIENT_ENABLED = RELEASE_SCOPE.infortuneTournament || import.meta.env?.DEV === true;
