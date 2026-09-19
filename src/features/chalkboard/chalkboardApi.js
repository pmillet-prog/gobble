async function readJson(response) {
  const payload = await response.json().catch(() => ({}));
  if (response.ok && payload?.ok !== false) return payload;
  const error = new Error(payload?.error || `http_${response.status}`);
  error.status = response.status;
  throw error;
}

export async function sendChalkboardCopy() {
  return readJson(await fetch("/api/chalkboard/admin/send-copy", { method: "POST", credentials: "include", headers: { Accept: "application/json" } }));
}

export async function fetchChalkboardExport(id, { signal } = {}) {
  return readJson(await fetch(`/api/chalkboard/admin/exports/${encodeURIComponent(id)}`, { credentials: "include", headers: { Accept: "application/json" }, signal }));
}

export async function fetchChalkboardFonts({ signal } = {}) {
  const response = await fetch("/api/chalkboard/fonts", {
    credentials: "include",
    headers: { Accept: "application/json" },
    signal,
  });
  return readJson(response);
}

export async function fetchChalkboardAccess({ signal } = {}) {
  return readJson(await fetch("/api/chalkboard/access", {
    credentials: "include", headers: { Accept: "application/json" }, signal,
  }));
}

export async function fetchChalkboardArchives({ before, signal } = {}) {
  const query = before ? `?before=${encodeURIComponent(before)}` : "";
  const payload = await readJson(await fetch(`/api/chalkboard/archives${query}`, {
    credentials: "include", headers: { Accept: "application/json" }, signal,
  }));
  if (!Array.isArray(payload.archives)) throw new Error("archives_unavailable");
  return payload;
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

export async function undoChalkboardDeletion(board) {
  const response = await fetch(`/api/chalkboard/${encodeURIComponent(board)}/undo-delete`, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  return readJson(response);
}
