import React from "react";
import useMobileBackTarget from "../mobile/useMobileBackTarget.js";
import { CHALKBOARD_BOARD } from "../../../shared/chalkboardRules.js";

import {
  fetchChalkboard,
  fetchChalkboardAccess,
  publishChalkboardIntervention,
} from "./chalkboardApi.js";
import { getElementBounds } from "./chalkboardModel.js";
import useChalkboardRenderer from "./useChalkboardRenderer.js";
import useOverlayViewport from "../../hooks/useOverlayViewport.js";
import useChalkboardViewport from "./useChalkboardViewport.js";
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
import useChalkboardEdgeScroll from "./useChalkboardEdgeScroll.js";
import useChalkboardModeration from "./useChalkboardModeration.js";
import ChalkboardModerationPreview from "./ChalkboardModerationPreview.jsx";
import ChalkboardModerationControls from "./ChalkboardModerationControls.jsx";
import ChalkboardMaintenanceDialog from "./ChalkboardMaintenanceDialog.jsx";
import ChalkboardLoadingIndicator from "./ChalkboardLoadingIndicator.jsx";
import "./chalkboard.css";

const board = CHALKBOARD_BOARD;
const ChalkboardArchives = React.lazy(() => import("./ChalkboardArchives.jsx"));

export default function ChalkboardApplication(props) {
  const [archives, setArchives] = React.useState(false);
  useMobileBackTarget(() => setArchives(false), archives);
  const viewportRef = useOverlayViewport();
  return <div ref={viewportRef} className="chalkboard-viewport">{archives
    ? <React.Suspense fallback={<main className="chalkboard-app"><button className="chalkboard-back" onClick={() => setArchives(false)}>Retour au tableau</button><p role="status">Chargement des archives…</p></main>}>
        <ChalkboardArchives onClose={() => setArchives(false)} />
      </React.Suspense>
    : <ChalkboardBoard {...props} onArchives={() => setArchives(true)} />}</div>;
}

function getErrorMessage(error) {
  if (error?.message === "maintenance_mode") return "Le grand tableau est fermé pendant la mise à jour.";
  if (error?.status === 401 || error?.message === "auth_required") {
    return "Connecte-toi à ton compte pour valider une intervention.";
  }
  if (error?.message === "empty_intervention") return "Ton intervention est vide.";
  if (error?.message === "drawing_limit") return "Le brouillon dépasse la limite de dessin. Annule les derniers gestes puis publie pour continuer. Ton brouillon est conservé.";
  if (error?.status === 413) return "Le dessin est trop volumineux pour être envoyé. Ton brouillon est conservé ; annule les derniers gestes puis réessaie.";
  if (error?.message === "moderation_forbidden") return "Accès de modération refusé.";
  if (error?.message === "erasure_forbidden") return "Tu peux uniquement gommer tes propres interventions.";
  if (error?.message === "erasure_limit") return "La limite de passages d’éponge est atteinte. Annule les derniers gestes pour pouvoir valider.";
  if (error?.message === "stale_week") return "Le tableau a été renouvelé. Abandonne ce brouillon pour repartir sur le nouveau tableau.";
  if (error?.message === "invalid_erasure") return "Ce passage d’éponge n’a pas pu être enregistré. Annule ce geste et réessaie.";
  return "Le tableau n'est pas disponible pour le moment.";
}

function ChalkboardBoard({ canPublish = false, connection, onClose, onArchives }) {
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
  const canvasRef = React.useRef(null);
  const scrollRef = React.useRef(null);
  const snapshotRef = React.useRef(snapshot);
  const editor = useChalkboardEditor();
  const draftWeekRef = React.useRef("");
  const { viewport, scale, worldWidth, worldHeight, onScroll } = useChalkboardViewport(scrollRef);
  const interacting = editing && editor.tool !== "pan" && !busy && !maintenanceMode;
  const erasing = editing && editor.tool === "erase";
  const edgeScroll = useChalkboardEdgeScroll({ scrollRef, editor, scale, enabled: interacting });
  const { rendererRef, rendering } = useChalkboardRenderer({ canvasRef, scrollRef, snapshot, board, viewport, scale, worldHeight, editing, erasing, editor });

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

  React.useEffect(() => {
    const node = scrollRef.current;
    if (!node) return undefined;
    const handleWheel = (event) => {
      if (interacting || Math.abs(event.deltaX) >= Math.abs(event.deltaY) || !event.deltaY) return;
      if (node.scrollHeight > node.clientHeight + 1 && !event.shiftKey) return;
      event.preventDefault();
      node.scrollLeft += event.deltaY;
    };
    node.addEventListener("wheel", handleWheel, { passive: false });
    return () => node.removeEventListener("wheel", handleWheel);
  }, [interacting]);

  const getPointerPosition = React.useCallback(
    (event, rect = scrollRef.current?.getBoundingClientRect()) =>
      getChalkboardPointer(event, rect, scrollRef.current?.scrollLeft ?? viewport.scrollLeft, scale, scrollRef.current?.scrollTop ?? viewport.scrollTop),
    [scale, viewport.scrollLeft, viewport.scrollTop]
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
    edgeScroll.track(event);
  };

  const handlePointerUp = (event) => {
    if (event.isPrimary) edgeScroll.stop();
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
    edgeScroll.stop();
    editor.pointerCancel();
    if (canvasRef.current?.hasPointerCapture?.(event.pointerId)) canvasRef.current.releasePointerCapture(event.pointerId);
  };

  const handleScroll = () => {
    moderation.clearHover();
    onScroll();
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
        worldY: (viewport.scrollTop + Math.min(viewport.height, worldHeight) / 2) / scale,
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

  const previewText = text => {
    if (maintenanceMode) return;
    const first = !editor.elements.some(element => element.id === editor.textEntry?.id);
    const element = editor.updateTextEntry(text, viewport);
    if (first && element && scrollRef.current) {
      scrollRef.current.scrollLeft = element.cx * scale - viewport.width / 2;
      scrollRef.current.scrollTop = element.cy * scale - Math.min(viewport.height, worldHeight) / 2;
    }
  };

  const publish = async () => {
    const elements = editor.elements;
    if (!elements?.length || busy || maintenanceMode || !canPublish) return;
    setBusy(true);
    setNotice("Publication en cours…");
    try {
      const hasErasures = elements.some(element => element.type === "erase");
      const cleanup = hasErasures ? await collectChalkboardErasureCleanup(snapshot.interventions, elements, { loadedFonts: editor.loadedFonts }) : null;
      const draft = !hasErasures && !rendererRef.current?.asyncRaster && rendererRef.current?.captureDraft(elements, editor.selectedTextId);
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
  useMobileBackTarget(() => { if (!busy) close(); });

  return (
    <>
    <main className={`chalkboard-app chalkboard-board${editor.textEntry ? " is-composing" : ""}`} inert={maintenanceMode ? "" : undefined} aria-hidden={maintenanceMode || undefined}>
      <header className="chalkboard-header">
        <button type="button" className="chalkboard-back" onClick={close} disabled={busy} aria-label="Retour à l'accueil"><ChalkboardIcon name="back" /><span>Accueil</span></button>
        <div className="chalkboard-heading">
          <h1>Le grand tableau</h1>
          <span>Anonyme · effacé chaque lundi</span>
        </div>
        <div className="chalkboard-admin-actions">
          <button type="button" className="chalkboard-admin-button" onClick={onArchives} disabled={busy || editing} title={editing ? "Termine ton intervention pour consulter les archives" : "Voir les tableaux précédents"}>Archives</button>
          {snapshot.canModerate ? <>
          <ChalkboardExportButton disabled={busy || editing} onNotice={setNotice} />
          {!editing && <button type="button" className="chalkboard-admin-button" aria-label={moderation.mode ? "Quitter la modération" : "Modérer le tableau"} aria-pressed={moderation.mode} onClick={moderation.toggle} disabled={busy}><ChalkboardIcon name="erase" /><span>{moderation.mode ? "Fin de modération" : "Modérer"}</span></button>}
          </> : null}
        </div>
      </header>

      <div className="chalkboard-frame">
        <section ref={scrollRef} className={`chalkboard-scroll ${interacting ? "is-editing" : ""} ${interacting && editor.tool === "erase" ? "is-erasing" : ""} ${moderation.mode ? "is-moderating" : ""}`} onScroll={handleScroll} aria-label="Le grand tableau" tabIndex={0}>
          <div className="chalkboard-world" style={{
            width: `${Math.max(viewport.width, worldWidth)}px`,
            height: `${Math.max(viewport.height, worldHeight)}px`,
            "--chalkboard-scale": scale,
            "--chalkboard-world-height": `${worldHeight}px`,
            "--chalkboard-viewport-width": `${viewport.width}px`,
            "--chalkboard-viewport-height": `${viewport.height}px`,
          }}>
            <ChalkboardBackdrop />
            <canvas ref={canvasRef} className="chalkboard-canvas" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerLeave={moderation.clearHover} onPointerUp={handlePointerUp} onPointerCancel={handlePointerCancel} onLostPointerCapture={handlePointerCancel} />
            <div className="chalkboard-canvas-shell">
              <ChalkboardEraserCursor canvasRef={canvasRef} viewportRef={scrollRef} enabled={interacting && editor.tool === "erase"} size={editor.eraserSize} scale={scale} />
              {moderation.mode && <ChalkboardModerationPreview intervention={moderation.preview} viewport={viewport} scale={scale} />}
              <ChalkboardLoadingIndicator pending={loading || rendering} />
              {!loading && !snapshot.interventions.length && !editing && !moderation.mode ? <div className="chalkboard-empty">
                <span>À toi la craie !</span>
                <p>Un bug à signaler, une idée pour le jeu, un dessin…</p>
                <small>{canPublish ? "Choisis « Écrire » ou « Dessiner » dans les outils du tableau." : "Connecte-toi depuis l’accueil pour apporter ta contribution."}</small>
              </div> : null}
            </div>
          </div>
        </section>
        <ChalkboardScrollHints scrollRef={scrollRef} enabled={!interacting && !moderation.mode && !loading} viewport={viewport} worldWidth={worldWidth} />
        {notice ? <div className="chalkboard-notice" role="status">{notice}</div> : null}
      </div>

      {moderation.mode
        ? <ChalkboardModerationControls moderation={moderation} canUndo={snapshot.canUndoDelete} busy={busy} />
        : editor.textEntry ? <ChalkboardTextComposer
        text={editor.textEntry.rawText}
        font={editor.textEntry.font}
        color={editor.textEntry.color}
        fonts={editor.loadedFonts}
        onStyleChange={editor.updateTextStyle}
        onCancel={editor.cancelTextEntry}
        onChange={previewText}
        onFinish={editor.finishTextEntry}
        fontsReady={editor.fontsReady}
      /> : <ChalkboardControls editor={editor} editing={editing} busy={busy || loading || maintenanceMode} canPublish={canPublish} onTool={chooseTool} onCancel={cancelEditing} onPublish={publish}
        onEditText={() => { const element = editor.elements.find(item => item.id === editor.selectedTextId); if (element) editor.beginTextEntry({ element, viewport, worldX: element.cx, worldY: element.cy }); }} />}
    </main>
    {maintenanceMode ? <ChalkboardMaintenanceDialog hasDraft={editor.hasDraft || !!editor.textEntry} onClose={close} /> : null}
    </>
  );
}
