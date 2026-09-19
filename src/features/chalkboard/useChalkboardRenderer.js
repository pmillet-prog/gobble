import React from "react";
import { ChalkboardRenderer } from "./chalkboardRenderer.js";

export default function useChalkboardRenderer({ canvasRef, scrollRef, snapshot, board, viewport, scale, worldHeight, editing, erasing, editor }) {
  const rendererRef = React.useRef(null);
  const drawRef = React.useRef(() => {});
  const [rendering, setRendering] = React.useState(false);

  React.useLayoutEffect(() => {
    let frame = 0;
    let paintFrame = 0;
    let disposed = false;
    const schedule = () => {
      if (disposed || frame || paintFrame) return;
      if (!renderer.asyncRaster || renderer.asyncRaster.failed) setRendering(true);
      // Give the loading indicator a paint before a synchronous fallback.
      frame = requestAnimationFrame(() => {
        frame = 0;
        paintFrame = requestAnimationFrame(() => {
          paintFrame = 0;
          if (!disposed) drawRef.current();
        });
      });
    };
    let worker;
    if (typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined" && typeof FontFace !== "undefined") {
      try { worker = new Worker(new URL("./chalkboardRasterWorker.js", import.meta.url), { type: "module" }); } catch (_) { /* Canvas fallback. */ }
    }
    const renderer = new ChalkboardRenderer(canvasRef.current, { worker, onChange: schedule });
    renderer.requestRender = schedule;
    rendererRef.current = renderer;
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      cancelAnimationFrame(paintFrame);
      renderer.destroy();
      rendererRef.current = null;
    };
  }, [canvasRef]);

  React.useLayoutEffect(() => {
    const renderer = rendererRef.current;
    renderer.asyncRaster?.setFonts(editor.loadedFonts);
    renderer.invalidateText();
  }, [editor.fontsReady, editor.loadedFonts]);

  React.useLayoutEffect(() => {
    const renderer = rendererRef.current;
    const draw = () => {
      renderer.setInterventions(snapshot.interventions, snapshot.revision, `${board}:${snapshot.weekId}`);
      renderer.renderWorldView({ width: viewport.width, height: worldHeight, scale,
        scrollLeft: scrollRef.current?.scrollLeft ?? viewport.scrollLeft,
        draftElements: editing ? editor.getRenderElements() : [],
        selectedTextId: editing ? editor.selectedTextId : "", onlyOwn: erasing });
      setRendering(renderer.loading);
    };
    drawRef.current = draw;
    const fontsLoaded = () => { renderer.invalidateText(); renderer.requestRender(); };
    document.fonts?.addEventListener("loadingdone", fontsLoaded);
    renderer.requestRender();
    const unsubscribe = editor.subscribeRender(draw);
    return () => {
      unsubscribe();
      document.fonts?.removeEventListener("loadingdone", fontsLoaded);
    };
  }, [board, editing, erasing, editor.getRenderElements, editor.subscribeRender, editor.selectedTextId,
    editor.fontsReady, editor.loadedFonts, scale, snapshot.interventions, snapshot.revision, snapshot.weekId,
    viewport.height, viewport.scrollLeft, viewport.width, worldHeight, scrollRef]);

  return { rendererRef, rendering };
}
