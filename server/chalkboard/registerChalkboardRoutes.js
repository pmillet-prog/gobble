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
  service = createChalkboardService(),
}) {
  app.get("/api/chalkboard/admin/audit", async (req, res) => {
    setJsonHeaders(res);
    const identity = await requireRequestIdentity(req, res);
    if (!identity) return;
    if (!isModerator(identity)) {
      return res.status(403).json({ ok: false, error: "moderation_forbidden" });
    }
    return res.json({ ok: true, ...service.exportSealedAudit() });
  });

  app.get("/api/chalkboard/:board", async (req, res) => {
    setJsonHeaders(res);
    const identity = await getRequestIdentity(req);
    const snapshot = service.getSnapshot(req.params?.board);
    if (!snapshot.ok) return res.status(404).json(snapshot);
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
        canModerate: !!identity && isModerator(identity),
      });
    }
    return res.json({ ...snapshot, canModerate: !!identity && isModerator(identity) });
  });

  app.post("/api/chalkboard/:board/interventions", async (req, res) => {
    setJsonHeaders(res);
    const identity = await requireRequestIdentity(req, res);
    if (!identity) return;
    const result = service.addIntervention(req.params?.board, req.body, identity);
    if (!result.ok) return res.status(400).json(result);
    return res.status(201).json(result);
  });

  app.delete("/api/chalkboard/interventions/:id", async (req, res) => {
    setJsonHeaders(res);
    const identity = await requireRequestIdentity(req, res);
    if (!identity) return;
    if (!isModerator(identity)) {
      return res.status(403).json({ ok: false, error: "moderation_forbidden" });
    }
    const result = service.deleteIntervention(req.params?.id);
    if (!result.ok) {
      return res.status(result.error === "not_found" ? 404 : 400).json(result);
    }
    return res.json(result);
  });
}
