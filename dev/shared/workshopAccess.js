export async function canOpenWorkshop({ development = false, request } = {}) {
  if (development) return true;
  try {
    const response = await request();
    if (!response.ok) return false;
    const permission = await response.json();
    return permission.ok === true && permission.allowed === true;
  } catch { return false; }
}

export async function startWorkshop(load) {
  const root = document.getElementById("root");
  root.textContent = "Vérification de l’accès à l’atelier…";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const allowed = await canOpenWorkshop({ development: import.meta.env.DEV,
    request: () => fetch("/api/dev/workshops/access", { credentials: "include", cache: "no-store", signal: controller.signal }) });
  clearTimeout(timeout);
  if (!allowed) {
    root.innerHTML = '<main style="max-width:520px;margin:12vh auto;padding:24px;font:16px/1.6 system-ui"><h1>Atelier réservé aux comptes dev</h1><p>Connecte-toi depuis l’accueil, puis ouvre cet atelier dans les outils dev.</p><a href="/">Revenir à l’accueil</a></main>';
    return;
  }
  root.textContent = "Chargement de l’atelier…";
  try { await load(); }
  catch { root.textContent = "L’atelier n’a pas pu se charger. Recharge la page pour réessayer."; }
}
