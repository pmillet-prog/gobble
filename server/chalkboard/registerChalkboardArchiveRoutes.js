import path from "node:path";

const isWeek = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

export function registerChalkboardArchiveRoutes({ router, repository }) {
  // Same public readership as the live board. Only completed weekly images are
  // exposed: never manual exports, snapshots, identities or filesystem paths.
  router.get("/api/chalkboard/archives", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const before = req.query?.before;
    if (before != null && !isWeek(before)) return res.status(400).json({ ok: false, error: "invalid_week" });
    if (!repository?.listArchives) return res.status(503).json({ ok: false, error: "archives_unavailable" });
    const rows = await repository.listArchives(before || "9999-99-99", 31);
    const archives = rows.slice(0, 30).map(row => ({
      weekId: row.week_id,
      imageUrl: `/api/chalkboard/archives/${row.week_id}/image.png`,
    }));
    return res.json({ ok: true, archives, next: rows.length > 30 ? archives.at(-1).weekId : null });
  });

  router.get("/api/chalkboard/archives/:weekId/image.png", async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!isWeek(req.params?.weekId)) return res.status(404).json({ ok: false, error: "not_found" });
    const archive = await repository?.getArchive?.(req.params.weekId);
    if (!archive) return res.status(404).json({ ok: false, error: "not_found" });
    res.set("Content-Type", "image/png");
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    await new Promise(resolve => {
      res.sendFile(path.resolve(archive.png_path), { maxAge: "1y", immutable: true }, error => {
        if (error && !res.headersSent) {
          res.set("Cache-Control", "no-store");
          res.set("Content-Type", "application/json; charset=utf-8");
          res.status(error.statusCode === 404 ? 404 : 503).json({ ok: false, error: "archive_unavailable" });
        } else if (error && !res.writableEnded) res.destroy();
        resolve();
      });
    });
  });
}
