async function readJson(response) {
  const payload = await response.json().catch(() => ({}));
  if (response.ok && payload?.ok !== false) return payload;
  const error = new Error(payload?.error || `http_${response.status}`);
  error.status = response.status;
  throw error;
}

export async function fetchChalkboard(board, { revision, signal, weekId } = {}) {
  const query = new URLSearchParams();
  if (Number.isFinite(revision)) query.set("revision", String(revision));
  if (weekId) query.set("weekId", weekId);
  const suffix = query.size ? `?${query.toString()}` : "";
  const response = await fetch(`/api/chalkboard/${encodeURIComponent(board)}${suffix}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
    signal,
  });
  return readJson(response);
}

export async function publishChalkboardIntervention(board, intervention) {
  const response = await fetch(
    `/api/chalkboard/${encodeURIComponent(board)}/interventions`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(intervention),
    }
  );
  return readJson(response);
}

export async function deleteChalkboardIntervention(id) {
  const response = await fetch(`/api/chalkboard/interventions/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  return readJson(response);
}
