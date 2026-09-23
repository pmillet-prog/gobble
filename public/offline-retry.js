(() => {
  const retry = document.getElementById("retry");
  const status = document.getElementById("status");
  // A service-worker fallback keeps the requested URL: preserve invitations and
  // future shortcuts. Visiting /offline.html directly returns to the homepage.
  const destination = location.pathname === "/offline.html" ? "/" : location.href;
  retry.href = destination;
  retry.addEventListener("click", event => {
    event.preventDefault();
    status.textContent = "Nouvelle tentative…";
    if (destination === location.href) location.reload();
    else location.assign(destination);
  });
  window.addEventListener("online", () => {
    status.textContent = "La connexion semble revenue. Tu peux réessayer.";
  });
})();
