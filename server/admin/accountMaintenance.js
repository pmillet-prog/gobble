const locked = new Set();
export const isAccountUnderMaintenance = userId => locked.has(Number(userId));
export async function withAccountMaintenance(userIds, task) {
  const ids = [...new Set(userIds.map(Number))];
  if (ids.some(isAccountUnderMaintenance)) throw new Error("account_busy");
  ids.forEach(id => locked.add(id));
  try { return await task(); }
  finally { ids.forEach(id => locked.delete(id)); }
}
