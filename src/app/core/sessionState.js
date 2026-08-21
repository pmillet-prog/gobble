export const SESSION_STATE_FIELDS = Object.freeze([
  "authState",
  "canResumeSession",
  "connectionError",
  "isConnecting",
  "isLoggedIn",
  "loginError",
  "nickname",
  "resumePending",
  "resumeSnapshot",
  "serverStatus",
]);

export const SESSION_STATE_FIELD_SET = new Set(SESSION_STATE_FIELDS);

export function createInitialSessionState({ nickname = "" } = {}) {
  return Object.freeze({
    authState: {
      legacyProfile: null,
      loading: true,
      status: "loading",
      user: null,
    },
    canResumeSession: false,
    connectionError: "",
    isConnecting: false,
    isLoggedIn: false,
    loginError: "",
    nickname: String(nickname || ""),
    resumePending: false,
    resumeSnapshot: null,
    serverStatus: "waiting",
  });
}
