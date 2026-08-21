export function createEmptyAuthForm(overrides = {}) {
  return {
    username: "",
    password: "",
    confirmPassword: "",
    email: "",
    currentPassword: "",
    ...overrides,
  };
}

export function normalizeAuthUsernameInput(raw) {
  return String(raw || "").replace(/\s+/g, " ").trim();
}
