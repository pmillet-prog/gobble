import { Worker } from "node:worker_threads";

// One bounded queue keeps recoloring and PNG encoding off the game event loop.
export function createAvatarThumbnailRenderer() {
  let worker = null, current = null, timeout = null, idle = null;
  const queue = [];
  function stop() {
    clearTimeout(timeout); clearTimeout(idle);
    const previous = worker;
    worker = null;
    previous?.removeAllListeners();
    void previous?.terminate();
  }
  function fail(error) {
    const job = current;
    current = null;
    stop();
    job?.reject(error);
    dispatch();
  }
  function dispatch() {
    if (current) return;
    if (!queue.length) {
      idle = setTimeout(stop, 5000);
      idle.unref?.();
      return;
    }
    clearTimeout(idle);
    current = queue.shift();
    if (!worker) {
      try {
        worker = new Worker(new URL("./avatarThumbnailWorker.js", import.meta.url));
        worker.on("error", fail);
        worker.on("exit", () => fail(new Error("thumbnail_worker_exit")));
        worker.on("message", result => {
          clearTimeout(timeout);
          const job = current;
          current = null;
          if (result.png) job.resolve({ png: Buffer.from(result.png), renderVersion: 1 });
          else job.reject(new Error(result.error || "thumbnail_failed"));
          dispatch();
        });
      } catch (error) { fail(error); return; }
    }
    timeout = setTimeout(() => fail(new Error("thumbnail_timeout")), 15000);
    worker.postMessage({ avatar: current.avatar });
  }
  return {
    render(avatar) {
      if (queue.length >= 32) return Promise.reject(new Error("thumbnail_busy"));
      return new Promise((resolve, reject) => { queue.push({ avatar, resolve, reject }); dispatch(); });
    },
    dispose() {
      current?.reject(new Error("thumbnail_disposed")); current = null;
      queue.splice(0).forEach(job => job.reject(new Error("thumbnail_disposed")));
      stop();
    },
  };
}
