import { avatarApiError } from "./avatarApi.js";

async function requestInventory(userId, { items, signal } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 12000);
  try {
    const response = await fetch(`/api/auth/avatar/${items ? "purchase" : `inventory?userId=${userId}`}`, {
      method: items ? "POST" : "GET", credentials: "include", cache: "no-store", signal: controller.signal,
      headers: { Accept: "application/json", ...(items ? { "Content-Type": "application/json" } : {}) },
      ...(items ? { body: JSON.stringify({ userId, items }) } : {}),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) throw Object.assign(avatarApiError(data?.error), { inventory: data?.inventory });
    if (data.inventory?.userId !== Number(userId)) throw avatarApiError("avatar_account_changed");
    return data;
  } catch (error) {
    if (error?.code) throw error;
    throw avatarApiError();
  } finally { clearTimeout(timeout); signal?.removeEventListener("abort", abort); }
}

export async function requestAvatarInventory(userId, options) {
  return (await requestInventory(userId, options)).inventory;
}

export const purchaseAvatarItems = (userId, items) => requestInventory(userId, { items });
