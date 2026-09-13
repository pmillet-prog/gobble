import React from "react";
import { loadChalkboardTexture } from "./chalkboardTexture.js";

export default function useChalkboardTexture() {
  const [src, setSrc] = React.useState("");
  React.useEffect(() => {
    const controller = new AbortController();
    let texture = null, pending = false, timer = 0, failures = 0;
    const load = async () => {
      if (texture || pending || controller.signal.aborted) return;
      pending = true;
      window.clearTimeout(timer);
      try {
        texture = await loadChalkboardTexture({ signal: controller.signal });
        if (controller.signal.aborted) { texture.release(); texture = null; return; }
        setSrc(texture.src);
      } catch (error) {
        if (error.name !== "AbortError" && ++failures <= 3) timer = window.setTimeout(load, failures * 1000);
      } finally { pending = false; }
    };
    const retry = () => { if (!texture) { failures = 0; void load(); } };
    void load();
    window.addEventListener("online", retry);
    window.addEventListener("focus", retry);
    navigator.serviceWorker?.addEventListener("controllerchange", retry);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
      window.removeEventListener("online", retry);
      window.removeEventListener("focus", retry);
      navigator.serviceWorker?.removeEventListener("controllerchange", retry);
      texture?.release();
    };
  }, []);
  return src;
}
