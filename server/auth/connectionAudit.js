import { createConnectionAuditRepository } from './connectionAuditRepository.js';
import { createConnectionIpResolver } from './connectionClientIp.js';

export function createConnectionAudit({ filename, repository = createConnectionAuditRepository({ filename }),
  resolveIp = createConnectionIpResolver(), warn = console.warn, intervalMs = 3600000 } = {}) {
  let timer, closed = false, pendingWrites = 0, warnedAt = 0;
  const jobs = new Set();
  function warning(error) {
    if (Date.now() - warnedAt < 60000) return;
    warnedAt = Date.now();
    // Never send IPs, session tokens or request bodies to the general log.
    warn('[connection-audit] journal indisponible', error?.code || 'audit_unavailable');
  }
  function track(task) {
    const job = Promise.resolve().then(task).catch(warning);
    jobs.add(job);
    void job.finally(() => jobs.delete(job));
    return job;
  }
  return {
    start() {
      if (timer || closed) return;
      void track(() => repository.purge());
      timer = setInterval(() => track(() => repository.purge()), intervalMs);
      timer.unref?.();
    },
    // The account comes from server authentication, never the request body.
    record(request, account, installId, kind) {
      if (closed || !account?.id) return Promise.resolve();
      if (pendingWrites >= 500) { warning(); return Promise.resolve(); }
      const event = { userId: account.id, nick: account.usernameDisplay, installId, kind, ...resolveIp(request) };
      pendingWrites++;
      return track(() => repository.record(event)).finally(() => { pendingWrites--; });
    },
    list: (userId, before) => repository.list(userId, before),
    async close() {
      closed = true;
      clearInterval(timer);
      await Promise.all([...jobs]);
      await repository.close();
    },
  };
}
