import React from "react";
import { CHALKBOARD_BOARD } from "../../../shared/chalkboardRules.js";

import {
  fetchChalkboard,
  fetchChalkboardAccess,
  publishChalkboardIntervention,
} from "./chalkboardApi.js";
import {
  CHALKBOARD_WORLD,
  getElementBounds,
} from "./chalkboardModel.js";
import { ChalkboardRenderer } from "./chalkboardRenderer.js";
import { getChalkboardPointer } from "./chalkboardCanvasWindow.js";
import ChalkboardBackdrop from "./ChalkboardBackdrop.jsx";
import ChalkboardControls from "./ChalkboardControls.jsx";
import ChalkboardExportButton from "./ChalkboardExportButton.jsx";
import ChalkboardEraserCursor from "./ChalkboardEraserCursor.jsx";
import ChalkboardScrollHints from "./ChalkboardScrollHints.jsx";
import { collectChalkboardErasureCleanup } from "./chalkboardErasureCleanup.js";
import ChalkboardTextComposer from "./ChalkboardTextComposer.jsx";
import ChalkboardIcon from "./ChalkboardIcon.jsx";
import useChalkboardEditor from "./useChalkboardEditor.js";
import useChalkboardPan from "./useChalkboardPan.js";
import useChalkboardModeration from "./useChalkboardModeration.js";
import ChalkboardModerationPreview from "./ChalkboardModerationPreview.jsx";
import ChalkboardModerationControls from "./ChalkboardModerationControls.jsx";
import ChalkboardMaintenanceDialog from "./ChalkboardMaintenanceDialog.jsx";
import "./chalkboard.css";

const board = CHALKBOARD_BOARD;

function getErrorMessage(error) {
  if (error?.message === "maintenance_mode") return "Le grand tableau est fermé pendant la mise à jour.";
  if (error?.status === 401 || error?.message === "auth_required") {
    return "Connecte-toi à ton compte pour valider une intervention.";
  }
  if (error?.message === "empty_intervention") return "Ton intervention est vide.";
  if (error?.message === "moderation_forbidden") return "Accès de modération refusé.";
  if (error?.message === "erasure_forbidden") return "Tu peux uniquement gommer tes propres interventions.";
  if (error?.message === "erasure_limit") return "La limite de passages d’éponge est atteinte. Annule les derniers gestes pour pouvoir valider.";
  if (error?.message === "stale_week") return "Le tableau a été renouvelé. Abandonne ce brouillon pour repartir sur le nouveau tableau.";
  if (error?.message === "invalid_erasure") return "Ce passage d’éponge n’a pas pu être enregistré. Annule ce geste et réessaie.";
  return "Le tableau n'est pas disponible pour le moment.";
}

export default function ChalkboardApplication({ canPublish = false, connection, onClose }) {
  const [snapshot, setSnapshot] = React.useState({
    board,
    interventions: [],
    revision: null,
    weekId: "",
    canModerate: false,
    canUndoDelete: false,
  });
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [maintenanceMode, setMaintenanceMode] = React.useState(false);
  const maintenanceVersionRef = React.useRef(0);
  const [editing, setEditing] = React.useState(false);
  const [notice, setNotice] = React.useState("");
  const [viewport, setViewport] = React.useState({ width: 1, height: 1, scrollLeft: 0 });
  const canvasRef = React.useRef(null);
  const scrollRef = React.useRef(null);
  const rendererRef = React.useRef(null);
  const snapshotRef = React.useRef(snapshot);
  const scrollFrameRef = React.useRef(0);
  const editor = useChalkboardEditor();
  const draftWeekRef = React.useRef("");
  const scale = viewport.height / CHALKBOARD_WORLD.height;
  const worldWidth = CHALKBOARD_WORLD.width * scale;
  const interacting = editing && editor.tool !== "pan" && !busy && !maintenanceMode;
  const erasing = editing && editor.tool === "erase";

  React.useLayoutEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  React.useEffect(() => {
    const onAvailability = (payload) => {
      maintenanceVersionRef.current += 1;
      setMaintenanceMode(!!payload?.maintenanceMode);
    };
    connection?.on?.("chalkboardAvailability", onAvailability);
    return () => connection?.off?.("chalkboardAvailability", onAvailability);
  }, [connection]);

  React.useEffect(() => {
    if (maintenanceMode) editor.pointerCancel();
  }, [maintenanceMode, editor.pointerCancel]);

  const loadBoard = React.useCallback(
    async ({ quiet = false, signal, accessOnly = false } = {}) => {
      const maintenanceVersion = ++maintenanceVersionRef.current;
      if (!quiet) setLoading(true);
      try {
        const currentSnapshot = snapshotRef.current;
        const payload = accessOnly ? await fetchChalkboardAccess({ signal }) : await fetchChalkboard(board, {
          revision: currentSnapshot.board === board ? currentSnapshot.revision : null,
          signal,
          weekId: currentSnapshot.board === board ? currentSnapshot.weekId : "",
        });
        if (maintenanceVersion === maintenanceVersionRef.current) setMaintenanceMode(false);
        if (accessOnly) return;
        setSnapshot((current) => {
          if (current.weekId > payload.weekId || (current.weekId === payload.weekId && current.revision > payload.revision)) return current;
          if (payload.unchanged) {
            if (current.canModerate === !!payload.canModerate && current.canUndoDelete === !!payload.canUndoDelete) return current;
            return { ...current, canModerate: !!payload.canModerate, canUndoDelete: !!payload.canUndoDelete };
          }
          if (
            current.revision === payload.revision &&
            current.weekId === payload.weekId &&
            current.canModerate === !!payload.canModerate &&
            current.canUndoDelete === !!payload.canUndoDelete
          ) {
            return current;
          }
          return {
            board: payload.board || board,
            interventions: Array.isArray(payload.interventions) ? payload.interventions : [],
            revision: payload.revision,
            weekId: payload.weekId || "",
            canModerate: !!payload.canModerate,
            canUndoDelete: !!payload.canUndoDelete,
          };
        });
        setNotice("");
      } catch (error) {
        if (error?.message === "maintenance_mode" && maintenanceVersion === maintenanceVersionRef.current) setMaintenanceMode(true);
        if (error?.name !== "AbortError") setNotice(getErrorMessage(error));
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [board]
  );

  const moderation = useChalkboardModeration({
    board, interventions: snapshot.interventions, canModerate: snapshot.canModerate,
    canUndoDelete: snapshot.canUndoDelete, busy, setBusy, setNotice, reload: loadBoard, getErrorMessage,
  });
  useChalkboardPan(scrollRef, !interacting && !moderation.mode && !busy && !maintenanceMode);

  React.useEffect(() => {
    const controller = new AbortController();
    void loadBoard({ signal: controller.signal });
    return () => controller.abort();
  }, [loadBoard]);

  React.useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    let timer = 0;
    const refreshAccess = () => {
      if (!cancelled && document.visibilityState === "visible") {
        void loadBoard({ quiet: true, signal: controller.signal, accessOnly: true });
      }
    };
    const poll = async () => {
      if (!cancelled && document.visibilityState === "visible") {
        await loadBoard({ quiet: true, signal: controller.signal, accessOnly: erasing }).catch(() => {});
      }
      if (!cancelled) timer = window.setTimeout(poll, 10000);
    };
    timer = window.setTimeout(poll, 10000);
    connection?.on?.("connect", refreshAccess);
    window.addEventListener("focus", refreshAccess);
    document.addEventListener("visibilitychange", refreshAccess);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
      connection?.off?.("connect", refreshAccess);
      window.removeEventListener("focus", refreshAccess);
      document.removeEventListener("visibilitychange", refreshAccess);
    };
  }, [connection, loadBoard, erasing]);

  React.useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) return undefined;
    const updateSize = () => {
      const width = Math.max(1, node.clientWidth);
      const height = Math.max(1, node.clientHeight);
      const left = node.scrollLeft;
      setViewport(current => {
        if (current.width === width && current.height === height) return current;
        // Tools and mobile keyboards change the surface height and its scale.
        // Preserve the world point in the middle, not its old pixel offset.
        const scrollLeft = current.height > 1
          ? Math.max(0, (left + current.width / 2) * height / current.height - width / 2)
          : left;
        return { width, height, scrollLeft };
      });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  React.useLayoutEffect(() => {
    // Apply after React has resized the world, so the browser uses the new
    // scroll limit. onScroll records any clamping at either end of the board.
    if (scrollRef.current) scrollRef.current.scrollLeft = viewport.scrollLeft;
  }, [viewport.width, viewport.height]);

  React.useEffect(() => {
    const node = scrollRef.current;
    if (!node) return undefined;
    const handleWheel = (event) => {
      if (interacting || Math.abs(event.deltaX) >= Math.abs(event.deltaY) || !event.deltaY) return;
      event.preventDefault();
      node.scrollLeft += event.deltaY;
    };
    node.addEventListener("wheel", handleWheel, { passive: false });
    return () => node.removeEventListener("wheel", handleWheel);
  }, [interacting]);

  React.useLayoutEffect(() => {
    if (!canvasRef.current) return undefined;
    const renderer = new ChalkboardRenderer(canvasRef.current);
    rendererRef.current = renderer;
    return () => {
      renderer.destroy();
      if (rendererRef.current === renderer) rendererRef.current = null;
    };
  }, []);

  React.useLayoutEffect(() => {
    if (editor.fontsReady) rendererRef.current?.invalidateText();
  }, [editor.fontsReady]);

  React.useLayoutEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setInterventions(snapshot.interventions, snapshot.revision, `${board}:${snapshot.weekId}`);
    const render = () => renderer.renderWorldView({
      width: viewport.width,
      height: viewport.height,
      scale,
      scrollLeft: viewport.scrollLeft,
      draftElements: editing ? editor.getRenderElements() : [],
      selectedTextId: editing ? editor.selectedTextId : "",
      onlyOwn: erasing,
    });
    const handleFontsLoaded = () => { renderer.invalidateText(); render(); };
    document.fonts?.addEventListener("loadingdone", handleFontsLoaded);
    render();
    const unsubscribe = editor.subscribeRender(render);
    return () => {
      unsubscribe();
      document.fonts?.removeEventListener("loadingdone", handleFontsLoaded);
    };
  }, [
    board,
    editing,
    erasing,
    editor.getRenderElements,
    editor.subscribeRender,
    editor.selectedTextId,
    editor.fontsReady,
    scale,
    snapshot.interventions,
    snapshot.revision,
    snapshot.weekId,
    viewport.height,
    viewport.scrollLeft,
    viewport.width,
  ]);

  React.useEffect(
    () => () => {
      if (scrollFrameRef.current) cancelAnimationFrame(scrollFrameRef.current);
    },
    []
  );

  const getPointerPosition = React.useCallback(
    (event, rect = scrollRef.current?.getBoundingClientRect()) =>
      getChalkboardPointer(event, rect, scrollRef.current?.scrollLeft ?? viewport.scrollLeft, scale),
    [scale, viewport.scrollLeft]
  );

  const handlePointerDown = (event) => {
    if (busy || maintenanceMode || !event.isPrimary || event.button !== 0) return;
    const point = getPointerPosition(event);
    if (!point) return;
    if (interacting) {
      event.preventDefault();
      canvasRef.current?.setPointerCapture?.(event.pointerId);
      editor.pointerDown({ ...point, scale, viewport, interventions: snapshot.interventions });
      return;
    }
    if (moderation.mode) moderation.select(point);
  };

  const handlePointerMove = (event) => {
    if (maintenanceMode || !event.isPrimary) return;
    if (moderation.mode) {
      if (event.pointerType !== "touch") moderation.hover(getPointerPosition(event));
      return;
    }
    if (!editing || !canvasRef.current?.hasPointerCapture?.(event.pointerId)) return;
    event.preventDefault();
    const nativeEvent = event.nativeEvent || event;
    const samples = nativeEvent.getCoalescedEvents?.() || [nativeEvent];
    const pointerSamples = samples.length ? samples : [nativeEvent];
    const rect = scrollRef.current?.getBoundingClientRect();
    for (const sample of pointerSamples) {
      const point = getPointerPosition(sample, rect);
      if (!point) continue;
      editor.pointerMove({ ...point, pressure: sample.pressure });
    }
  };

  const handlePointerUp = (event) => {
    if (maintenanceMode || !editing || !event.isPrimary) return;
    if (!canvasRef.current?.hasPointerCapture?.(event.pointerId)) return;
    const point = getPointerPosition(event);
    if (point) editor.pointerMove(point);
    editor.pointerUp();
    if (canvasRef.current?.hasPointerCapture?.(event.pointerId)) {
      canvasRef.current.releasePointerCapture(event.pointerId);
    }
  };

  const handlePointerCancel = (event) => {
    if (!event.isPrimary) return;
    editor.pointerCancel();
    if (canvasRef.current?.hasPointerCapture?.(event.pointerId)) canvasRef.current.releasePointerCapture(event.pointerId);
  };

  const handleScroll = () => {
    moderation.clearHover();
    if (scrollFrameRef.current) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = 0;
      const node = scrollRef.current;
      if (!node) return;
      setViewport((current) =>
        current.scrollLeft === node.scrollLeft
          ? current
          : { ...current, scrollLeft: node.scrollLeft }
      );
    });
  };

  const chooseTool = (tool) => {
    if (busy || loading || maintenanceMode) return;
    if (editing && editor.tool === tool) tool = "pan";
    if (!editing) draftWeekRef.current = snapshot.weekId;
    moderation.close();
    editor.cancelTextEntry();
    if (tool !== "text") editor.setSelectedTextId("");
    editor.setTool(tool);
    setNotice("");
    if (tool !== "pan") setEditing(true);
    if (tool === "text") {
      editor.beginTextEntry({
        worldX: (viewport.scrollLeft + viewport.width / 2) / scale,
        worldY: CHALKBOARD_WORLD.height / 2,
        viewport,
        autoPlace: true,
        occupied: [...snapshot.interventions.map(intervention => intervention.bounds), ...editor.elements.map(getElementBounds)],
      });
    }
  };

  const cancelEditing = () => {
    if (editor.hasDraft && !window.confirm("Abandonner ton brouillon ?")) return;
    editor.reset();
    setEditing(false);
    setNotice("");
  };

  const placeText = (text) => {
    if (maintenanceMode) return null;
    const result = editor.finishTextEntry(text, viewport);
    if (!result) return null;
    // Keep the chosen spot visible if the nearest free space was farther away.
    if (scrollRef.current) scrollRef.current.scrollLeft = result.position.x * scale - viewport.width / 2;
    if (!result.placementFound) setNotice("Cette zone est bien remplie. Place ton texte avant de le publier.");
    return result;
  };

  const publish = async () => {
    const elements = editor.elements;
    if (!elements?.length || busy || maintenanceMode || !canPublish) return;
    setBusy(true);
    setNotice("Publication en cours…");
    try {
      const hasErasures = elements.some(element => element.type === "erase");
      const cleanup = hasErasures ? await collectChalkboardErasureCleanup(snapshot.interventions, elements, { loadedFonts: editor.loadedFonts }) : null;
      const draft = !hasErasures && rendererRef.current?.captureDraft(elements, editor.selectedTextId);
      const result = await publishChalkboardIntervention(board, {
        elements: cleanup?.draftEmpty ? elements.filter(element => element.type === "erase") : elements,
        ...(cleanup ? { removeIds: cleanup.removeIds } : {}),
        weekId: draftWeekRef.current,
      });
      rendererRef.current?.reuseDraftForIntervention(result.intervention, draft);
      setSnapshot((current) => current.weekId > result.weekId || (current.weekId === result.weekId && current.revision > result.revision) ? current : ({
        ...current,
        board,
        revision: result.revision,
        weekId: result.weekId,
        interventions: result.interventions || [...current.interventions, result.intervention].filter(Boolean),
      }));
      editor.reset();
      setEditing(false);
      setNotice(hasErasures ? "Modifications enregistrées sur le tableau." : "Intervention ajoutée anonymement au tableau.");
    } catch (error) {
      if (error?.message === "maintenance_mode") {
        maintenanceVersionRef.current += 1;
        setMaintenanceMode(true);
      }
      setNotice(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if ((editor.hasDraft || editor.textEntry) && !window.confirm("Quitter et abandonner ton brouillon ?")) return;
    onClose?.();
  };

  return (
    <>
    <main className="chalkboard-app" inert={maintenanceMode ? "" : undefined} aria-hidden={maintenanceMode || undefined}>
      <header className="chalkboard-header">
        <button type="button" className="chalkboard-back" onClick={close} disabled={busy} aria-label="Retour à l'accueil"><ChalkboardIcon name="back" /><span>Accueil</span></button>
        <div className="chalkboard-heading">
          <h1>Le grand tableau</h1>
          <span>Anonyme · effacé chaque lundi</span>
        </div>
        {snapshot.canModerate ? <div className="chalkboard-admin-actions">
          <ChalkboardExportButton disabled={busy || editing} onNotice={setNotice} />
          {!editing && <button type="button" className="chalkboard-admin-button" aria-label={moderation.mode ? "Quitter la modération" : "Modérer le tableau"} aria-pressed={moderation.mode} onClick={moderation.toggle} disabled={busy}><ChalkboardIcon name="erase" /><span>{moderation.mode ? "Fin de modération" : "Modérer"}</span></button>}
        </div> : null}
      </header>

      <div className="chalkboard-frame">
        <section ref={scrollRef} className={`chalkboard-scroll ${interacting ? "is-editing" : ""} ${interacting && editor.tool === "erase" ? "is-erasing" : ""} ${moderation.mode ? "is-moderating" : ""}`} onScroll={handleScroll} aria-label="Le grand tableau" tabIndex={0}>
          <div className="chalkboard-world" style={{
            width: `${Math.max(viewport.width, worldWidth)}px`,
            "--chalkboard-scale": scale,
            "--chalkboard-viewport-width": `${viewport.width}px`,
          }}>
            <ChalkboardBackdrop />
            <canvas ref={canvasRef} className="chalkboard-canvas" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerLeave={moderation.clearHover} onPointerUp={handlePointerUp} onPointerCancel={handlePointerCancel} onLostPointerCapture={handlePointerCancel} />
            <div className="chalkboard-canvas-shell">
              <ChalkboardEraserCursor canvasRef={canvasRef} viewportRef={scrollRef} enabled={interacting && editor.tool === "erase"} size={editor.eraserSize} scale={scale} />
              {moderation.mode && <ChalkboardModerationPreview intervention={moderation.preview} viewport={viewport} scale={scale} />}
              {loading ? <div className="chalkboard-loader">Chargement du tableau…</div> : null}
              {!loading && !snapshot.interventions.length && !editing && !moderation.mode ? <div className="chalkboard-empty">
                <span>À toi la craie !</span>
                <p>Un bug à signaler, une idée pour le jeu, un dessin…</p>
                <small>{canPublish ? "Choisis « Écrire » ou « Dessiner » en bas du tableau." : "Connecte-toi depuis l’accueil pour apporter ta contribution."}</small>
              </div> : null}
            </div>
          </div>
        </section>
        <ChalkboardScrollHints scrollRef={scrollRef} enabled={!interacting && !moderation.mode && !loading} viewport={viewport} worldWidth={worldWidth} />
        {notice ? <div className="chalkboard-notice" role="status">{notice}</div> : null}
      </div>

      {moderation.mode
        ? <ChalkboardModerationControls moderation={moderation} canUndo={snapshot.canUndoDelete} busy={busy} />
        : <ChalkboardControls editor={editor} editing={editing} busy={busy || loading || maintenanceMode} canPublish={canPublish} onTool={chooseTool} onCancel={cancelEditing} onPublish={publish} />}
      {editor.textEntry ? <ChalkboardTextComposer
        canPublish={canPublish}
        onCancel={editor.cancelTextEntry}
        onPlace={placeText}
        font={editor.font}
        fontsReady={editor.fontsReady}
      /> : null}
    </main>
    {maintenanceMode ? <ChalkboardMaintenanceDialog hasDraft={editor.hasDraft || !!editor.textEntry} onClose={close} /> : null}
    </>
  );
}
