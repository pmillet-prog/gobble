const NICKNAME_STORAGE_KEY = "boggle_nick";

export function readBrowserSessionSnapshot(storage = globalThis?.localStorage) {
  if (!storage || typeof storage.getItem !== "function") {
    return { nickname: "" };
  }
  try {
    return { nickname: storage.getItem(NICKNAME_STORAGE_KEY) || "" };
  } catch (_) {
    return { nickname: "" };
  }
}
