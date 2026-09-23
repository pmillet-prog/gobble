import { avatarApiError } from "./avatarApi.js";

async function requestInventory(userId, { items, refundToken, quote = false, signal } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 12000);
  try {
    const writing = items !== undefined || refundToken !== undefined;
    const action = quote || refundToken !== undefined ? "refund" : items ? "purchase" : "inventory";
    const response = await fetch(`/api/auth/avatar/${action}${writing ? "" : `?userId=${userId}`}`, {
      method: writing ? "POST" : "GET", credentials: "include", cache: "no-store", signal: controller.signal,
      headers: { Accept: "application/json", ...(writing ? { "Content-Type": "application/json" } : {}) },
      ...(writing ? { body: JSON.stringify({ userId, items, refundToken }) } : {}),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) throw Object.assign(avatarApiError(data?.error), { inventory: data?.inventory, quote: data?.quote });
    if ((quote ? data.userId : data.inventory?.userId) !== Number(userId)) throw avatarApiError("avatar_account_changed");
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
export const requestAvatarRefundQuote = async (userId, options) => (await requestInventory(userId, { ...options, quote: true })).quote;
export const refundAvatarPurchases = (userId, refundToken, options) => requestInventory(userId, { ...options, refundToken });
