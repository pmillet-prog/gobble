import { createChalkboardService } from "./chalkboardService.js";

function setJsonHeaders(res) {
  res.set("Content-Type", "application/json; charset=utf-8");
  res.set("Cache-Control", "no-store");
}

export function registerChalkboardRoutes({
  app,
  getRequestIdentity,
  requireRequestIdentity,
  isModerator,
  isMaintenanceModeActive = () => false,
  service = createChalkboardService(),
  exports: exportService,
}) {
  // Express 4 does not forward rejected async handlers by itself. A disk or
  // export failure must produce an HTTP error, never hang a player's request.
  function blockDuringMaintenance(res) {
    if (!isMaintenanceModeActive()) return false;
    setJsonHeaders(res);
    res.status(503).json({
      ok: false, error: "maintenance_mode", maintenanceMode: true, canAccess: false,
      message: "Le grand tableau est fermé pendant la mise à jour.",
    });
    return true;
  }
  const router = Object.fromEntries(["get", "post", "delete"].map(method => [
    method, (route, handler) => app[method](route, (req, res) => {
      if (blockDuringMaintenance(res)) return;
      return Promise.resolve(handler(req, res)).catch(() =>
        res.status(503).json({ ok: false, error: "chalkboard_unavailable" })
      );
    }),
  ]));
  router.get("/api/chalkboard/access", async (req, res) => {
    setJsonHeaders(res);
    return res.json({ ok: true, canAccess: true });
  });

  router.get("/api/chalkboard/admin/audit", async (req, res) => {
    setJsonHeaders(res);
    const identity = await requireRequestIdentity(req, res);
    if (!identity) return;
    if (!isModerator(identity)) {
      return res.status(403).json({ ok: false, error: "moderation_forbidden" });
    }
    return res.json({ ok: true, ...await service.exportSealedAudit() });
  });

  router.get("/api/chalkboard/fonts", async (req, res) => {
    setJsonHeaders(res);
    return res.json({ ok: true, fonts: service.getFonts() });
  });

  router.get("/api/chalkboard/:board", async (req, res) => {
    setJsonHeaders(res);
    const identity = await getRequestIdentity(req);
    if (blockDuringMaintenance(res)) return;
    const snapshot = await service.getSnapshot(req.params?.board, identity);
    if (!snapshot.ok) return res.status(404).json(snapshot);
    const canModerate = !!identity && isModerator(identity);
    const canUndoDelete = canModerate && await service.canUndoDeletion(snapshot.board, identity);
    const requestedRevision = Number(req.query?.revision);
    const requestedWeekId = String(req.query?.weekId || "");
    if (
      Number.isFinite(requestedRevision) &&
      requestedRevision === snapshot.revision &&
      requestedWeekId === snapshot.weekId
    ) {
      return res.json({
        ok: true,
        board: snapshot.board,
        weekId: snapshot.weekId,
        revision: snapshot.revision,
        unchanged: true,
        canModerate,
        canUndoDelete,
      });
    }
    return res.json({ ...snapshot, canModerate, canUndoDelete });
  });

  router.post("/api/chalkboard/:board/interventions", async (req, res) => {
    setJsonHeaders(res);
    const identity = await requireRequestIdentity(req, res);
    if (!identity || blockDuringMaintenance(res)) return;
    const result = await service.addIntervention(req.params?.board, req.body, identity);
    if (!result.ok) return res.status(result.error === "erasure_forbidden" ? 403 : result.error === "stale_week" ? 409 : 400).json(result);
    return res.status(201).json(result);
  });

  router.delete("/api/chalkboard/interventions/:id", async (req, res) => {
    setJsonHeaders(res);
    const identity = await requireRequestIdentity(req, res);
    if (!identity || blockDuringMaintenance(res)) return;
    if (!isModerator(identity)) {
      return res.status(403).json({ ok: false, error: "moderation_forbidden" });
    }
    const result = await service.deleteIntervention(req.params?.id, identity);
    if (!result.ok) {
      return res.status(result.error === "not_found" ? 404 : 400).json(result);
    }
    return res.json(result);
  });

  router.post("/api/chalkboard/:board/undo-delete", async (req, res) => {
    setJsonHeaders(res);
    const identity = await requireRequestIdentity(req, res);
    if (!identity || blockDuringMaintenance(res)) return;
    if (!isModerator(identity)) return res.status(403).json({ ok: false, error: "moderation_forbidden" });
    const result = await service.undoLastDeletion(req.params?.board, identity);
    if (!result.ok) return res.status(result.error === "undo_not_available" ? 409 : 400).json(result);
    return res.json(result);
  });

  let lastManualSend = 0;
  router.post("/api/chalkboard/admin/send-copy", async (req, res) => {
    setJsonHeaders(res);
    const identity = await requireRequestIdentity(req, res);
    if (!identity) return;
    if (!isModerator(identity)) return res.status(403).json({ ok: false, error: "moderation_forbidden" });
    if (!exportService || !service.queueExport) return res.status(503).json({ ok: false, error: "export_unavailable" });
    if (Date.now() - lastManualSend < 30000) return res.status(429).json({ ok: false, error: "export_rate_limited" });
    lastManualSend = Date.now();
    const job = await service.queueExport(identity);
    void exportService.tick().catch(() => {});
    return res.status(202).json({ ok: true, ...job, mailConfigured: exportService.configured() });
  });

  router.get("/api/chalkboard/admin/exports/:id", async (req, res) => {
    setJsonHeaders(res);
    const identity = await requireRequestIdentity(req, res);
    if (!identity) return;
    if (!isModerator(identity)) return res.status(403).json({ ok: false, error: "moderation_forbidden" });
    const job = await service.repository?.exportStatus(req.params.id);
    if (!job) return res.status(404).json({ ok: false, error: "not_found" });
    return res.json({ ok: true, id: job.id, status: job.sent_at ? "sent" : job.error ? "pending_retry" : "processing", pngReady: !!job.png_path, mailConfigured: !!exportService?.configured() });
  });
}
