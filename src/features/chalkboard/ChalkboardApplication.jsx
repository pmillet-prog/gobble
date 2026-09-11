import React from "react";

import {
  deleteChalkboardIntervention,
  fetchChalkboard,
  publishChalkboardIntervention,
} from "./chalkboardApi.js";
import {
  CHALKBOARD_PALETTE,
  CHALKBOARD_WORLD,
  hitTestIntervention,
} from "./chalkboardModel.js";
import { ChalkboardRenderer } from "./chalkboardRenderer.js";
import ChalkboardBackdrop from "./ChalkboardBackdrop.jsx";
import useChalkboardEditor from "./useChalkboardEditor.js";
import "./chalkboard.css";

const BOARD_OPTIONS = Object.freeze([
  { id: "feedback", label: "Bugs & idées", icon: "lightbulb" },
  { id: "free", label: "Figure libre", icon: "gesture" },
]);

function getErrorMessage(error) {
  if (error?.status === 401 || error?.message === "auth_required") {
    return "Connecte-toi à ton compte pour valider une intervention.";
  }
  if (error?.message === "empty_intervention") return "Ton intervention est vide.";
  if (error?.message === "moderation_forbidden") return "Accès de modération refusé.";
  return "Le tableau n'est pas disponible pour le moment.";
}

export default function ChalkboardApplication({ canPublish = false, onClose }) {
  const [board, setBoard] = React.useState("feedback");
  const [snapshot, setSnapshot] = React.useState({
    board: "feedback",
    interventions: [],
    revision: null,
    weekId: "",
    canModerate: false,
  });
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [feedbackKind, setFeedbackKind] = React.useState("idea");
  const [moderationMode, setModerationMode] = React.useState(false);
  const [notice, setNotice] = React.useState("");
  const [viewport, setViewport] = React.useState({ width: 1, height: 1, scrollLeft: 0 });
  const canvasRef = React.useRef(null);
  const scrollRef = React.useRef(null);
  const rendererRef = React.useRef(null);
  const snapshotRef = React.useRef(snapshot);
  const textInputRef = React.useRef(null);
  const scrollFrameRef = React.useRef(0);
  const editor = useChalkboardEditor();
  const scale = viewport.height / CHALKBOARD_WORLD.height;
  const worldWidth = CHALKBOARD_WORLD.width * scale;

  React.useLayoutEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const loadBoard = React.useCallback(
    async ({ quiet = false, signal } = {}) => {
      if (!quiet) setLoading(true);
      try {
        const currentSnapshot = snapshotRef.current;
        const payload = await fetchChalkboard(board, {
          revision: currentSnapshot.board === board ? currentSnapshot.revision : null,
          signal,
          weekId: currentSnapshot.board === board ? currentSnapshot.weekId : "",
        });
        setSnapshot((current) => {
          if (payload.unchanged) {
            if (current.canModerate === !!payload.canModerate) return current;
            return { ...current, canModerate: !!payload.canModerate };
          }
          if (
            current.revision === payload.revision &&
            current.weekId === payload.weekId &&
            current.canModerate === !!payload.canModerate
          ) {
            return current;
          }
          return {
            board: payload.board || board,
            interventions: Array.isArray(payload.interventions) ? payload.interventions : [],
            revision: payload.revision,
            weekId: payload.weekId || "",
            canModerate: !!payload.canModerate,
          };
        });
        setNotice("");
      } catch (error) {
        if (error?.name !== "AbortError") setNotice(getErrorMessage(error));
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [board]
  );

  React.useEffect(() => {
    const controller = new AbortController();
    void loadBoard({ signal: controller.signal });
    return () => controller.abort();
  }, [loadBoard]);

  React.useEffect(() => {
    let cancelled = false;
    let timer = 0;
    const poll = async () => {
      if (!cancelled && document.visibilityState === "visible") {
        await loadBoard({ quiet: true }).catch(() => {});
      }
      if (!cancelled) timer = window.setTimeout(poll, 10000);
    };
    timer = window.setTimeout(poll, 10000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [loadBoard]);

  React.useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) return undefined;
    const updateSize = () => {
      setViewport((current) => ({
        width: Math.max(1, node.clientWidth),
        height: Math.max(1, node.clientHeight),
        scrollLeft: node.scrollLeft,
      }));
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    const node = scrollRef.current;
    if (!node) return undefined;
    const handleWheel = (event) => {
      if (editing || Math.abs(event.deltaX) >= Math.abs(event.deltaY) || !event.deltaY) return;
      event.preventDefault();
      node.scrollLeft += event.deltaY;
    };
    node.addEventListener("wheel", handleWheel, { passive: false });
    return () => node.removeEventListener("wheel", handleWheel);
  }, [editing]);

  React.useEffect(() => {
    if (!editor.textEntry) return;
    const frame = requestAnimationFrame(() => textInputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [editor.textEntry]);

  React.useEffect(() => {
    if (board === "feedback" && editor.tool !== "text") editor.setTool("text");
  }, [board, editor.setTool, editor.tool]);

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
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setInterventions(snapshot.interventions, `${board}:${snapshot.weekId}:${snapshot.revision}`);
    renderer.render({
      width: viewport.width,
      height: viewport.height,
      scale,
      scrollLeft: viewport.scrollLeft,
      draftElements: editing ? editor.getRenderElements() : [],
      selectedTextId: editing ? editor.selectedTextId : "",
    });
  }, [
    board,
    editing,
    editor.renderTick,
    editor.selectedTextId,
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
    (event) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect || scale <= 0) return null;
      const screenX = event.clientX - rect.left;
      const screenY = event.clientY - rect.top;
      return {
        screenX,
        screenY,
        worldX: Math.max(0, Math.min(CHALKBOARD_WORLD.width, (screenX + viewport.scrollLeft) / scale)),
        worldY: Math.max(0, Math.min(CHALKBOARD_WORLD.height, screenY / scale)),
      };
    },
    [scale, viewport.scrollLeft]
  );

  const handlePointerDown = (event) => {
    const point = getPointerPosition(event);
    if (!point) return;
    if (editing) {
      event.preventDefault();
      canvasRef.current?.setPointerCapture?.(event.pointerId);
      editor.pointerDown({ ...point, scale });
      return;
    }
    if (!moderationMode || !snapshot.canModerate) return;
    const intervention = [...snapshot.interventions]
      .reverse()
      .find((entry) => hitTestIntervention(entry, point.worldX, point.worldY));
    if (!intervention) {
      setNotice("Aucune intervention à cet endroit.");
      return;
    }
    if (!window.confirm("Supprimer définitivement cette intervention du tableau ?")) return;
    setBusy(true);
    deleteChalkboardIntervention(intervention.id)
      .then(() => loadBoard())
      .catch((error) => setNotice(getErrorMessage(error)))
      .finally(() => setBusy(false));
  };

  const handlePointerMove = (event) => {
    if (!editing || !canvasRef.current?.hasPointerCapture?.(event.pointerId)) return;
    event.preventDefault();
    const nativeEvent = event.nativeEvent || event;
    const samples = nativeEvent.getCoalescedEvents?.() || [nativeEvent];
    const pointerSamples = samples.length ? samples : [nativeEvent];
    for (const sample of pointerSamples) {
      const point = getPointerPosition(sample);
      if (!point) continue;
      editor.pointerMove({ ...point, pressure: sample.pressure });
    }
  };

  const handlePointerUp = (event) => {
    if (!editing) return;
    if (canvasRef.current?.hasPointerCapture?.(event.pointerId)) {
      canvasRef.current.releasePointerCapture(event.pointerId);
    }
    editor.pointerUp();
  };

  const handleScroll = () => {
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

  const beginEditing = () => {
    setModerationMode(false);
    editor.setTool(board === "feedback" ? "text" : editor.tool);
    setNotice(canPublish ? "Ton brouillon reste sur cet appareil jusqu'à sa validation." : "Connecte-toi pour pouvoir valider.");
    setEditing(true);
  };

  const cancelEditing = () => {
    if (editor.hasDraft && !window.confirm("Abandonner ton brouillon ?")) return;
    editor.reset();
    setEditing(false);
    setNotice("");
  };

  const publish = async () => {
    if (!editor.hasDraft || busy) return;
    setBusy(true);
    setNotice("Validation en cours…");
    try {
      const result = await publishChalkboardIntervention(board, {
        feedbackKind,
        elements: editor.elements,
      });
      setSnapshot((current) => ({
        ...current,
        board,
        revision: result.revision,
        weekId: result.weekId,
        interventions: [...current.interventions, result.intervention],
      }));
      editor.reset();
      setEditing(false);
      setNotice("Intervention ajoutée anonymement au tableau.");
    } catch (error) {
      setNotice(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const changeBoard = (nextBoard) => {
    if (nextBoard === board) return;
    if (editor.hasDraft && !window.confirm("Changer de tableau et abandonner ton brouillon ?")) return;
    editor.reset();
    setEditing(false);
    setModerationMode(false);
    editor.setTool(nextBoard === "feedback" ? "text" : "chalk");
    setSnapshot((current) => ({
      ...current,
      board: nextBoard,
      interventions: [],
      revision: null,
      weekId: "",
    }));
    setBoard(nextBoard);
  };

  const close = () => {
    if (editor.hasDraft && !window.confirm("Quitter et abandonner ton brouillon ?")) return;
    onClose?.();
  };

  return (
    <main className="chalkboard-app">
      <header className="chalkboard-header">
        <button type="button" className="chalkboard-round-button chalkboard-back" onClick={close} aria-label="Retour à l'accueil">
          <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
        </button>
        <div className="chalkboard-heading">
          <h1>Le grand tableau</h1>
          <span>Anonyme · remis à zéro chaque lundi</span>
        </div>
        <div className="chalkboard-tabs" role="tablist" aria-label="Choisir un tableau">
          {BOARD_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={board === option.id}
              className={board === option.id ? "is-active" : ""}
              onClick={() => changeBoard(option.id)}
            >
              <span className="material-symbols-outlined" aria-hidden="true">{option.icon}</span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
        {!editing ? (
          <div className="chalkboard-header-actions">
            {snapshot.canModerate ? (
              <button
                type="button"
                className={`chalkboard-admin-button ${moderationMode ? "is-active" : ""}`}
                onClick={() => setModerationMode((value) => !value)}
                disabled={busy}
              >
                <span className="material-symbols-outlined" aria-hidden="true">ink_eraser</span>
                {moderationMode ? "Cliquer pour effacer" : "Modérer"}
              </button>
            ) : null}
            <button type="button" className="chalkboard-start-button" onClick={beginEditing}>
              <span className="material-symbols-outlined" aria-hidden="true">edit</span>
              Intervenir
            </button>
          </div>
        ) : null}
      </header>

      {editing ? (
        <section className="chalkboard-toolbar" aria-label="Outils du brouillon">
          <div className="chalkboard-tool-group">
            {board === "free" ? (
              <button type="button" className={editor.tool === "chalk" ? "is-active" : ""} onClick={() => editor.setTool("chalk")}>
                <span className="material-symbols-outlined" aria-hidden="true">draw</span>
                Craie
              </button>
            ) : null}
            <button type="button" className={editor.tool === "text" ? "is-active" : ""} onClick={() => editor.setTool("text")}>
              <span className="material-symbols-outlined" aria-hidden="true">text_fields</span>
              Texte
            </button>
          </div>
          {board === "free" && editor.tool === "chalk" ? (
            <div className="chalkboard-colors" aria-label="Couleur de la craie">
              {CHALKBOARD_PALETTE.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  aria-label={`Craie ${entry}`}
                  className={editor.color === entry ? "is-active" : ""}
                  style={{ "--chalk-color": entry }}
                  onClick={() => editor.setColor(entry)}
                />
              ))}
              <label className="chalkboard-custom-color" title="Autre couleur">
                <input type="color" value={editor.color} onChange={(event) => editor.setColor(event.target.value)} />
              </label>
              <label className="chalkboard-size">
                <span>Épaisseur</span>
                <input type="range" min="4" max="30" value={editor.size} onChange={(event) => editor.setSize(Number(event.target.value))} />
              </label>
            </div>
          ) : (
            <div className="chalkboard-text-help">Clique pour écrire · tire les poignées pour tourner ou agrandir</div>
          )}
          {board === "feedback" ? (
            <div className="chalkboard-kind" aria-label="Type de retour">
              <button type="button" className={feedbackKind === "bug" ? "is-active" : ""} onClick={() => setFeedbackKind("bug")}>Bug</button>
              <button type="button" className={feedbackKind === "idea" ? "is-active" : ""} onClick={() => setFeedbackKind("idea")}>Idée</button>
            </div>
          ) : null}
          <div className="chalkboard-draft-actions">
            <button type="button" onClick={editor.undo} disabled={!editor.historyCount} aria-label="Annuler la dernière action">
              <span className="material-symbols-outlined" aria-hidden="true">undo</span>
            </button>
            {editor.selectedTextId ? (
              <button type="button" onClick={editor.removeSelected} aria-label="Supprimer le texte sélectionné">
                <span className="material-symbols-outlined" aria-hidden="true">delete</span>
              </button>
            ) : null}
            <button type="button" className="chalkboard-cancel" onClick={cancelEditing}>Abandonner</button>
            <button type="button" className="chalkboard-publish" onClick={publish} disabled={!editor.hasDraft || busy || !canPublish}>
              {busy ? "Validation…" : "Valider"}
            </button>
          </div>
        </section>
      ) : null}

      {notice ? <div className="chalkboard-notice" role="status">{notice}</div> : null}

      <section
        ref={scrollRef}
        className={`chalkboard-scroll ${editing ? "is-editing" : ""} ${moderationMode ? "is-moderating" : ""}`}
        onScroll={handleScroll}
        aria-label={board === "feedback" ? "Tableau des bugs et des idées" : "Tableau de figure libre"}
      >
        <div
          className="chalkboard-world"
          style={{
            width: `${Math.max(viewport.width, worldWidth)}px`,
            "--chalkboard-scale": scale,
            "--chalkboard-viewport-width": `${viewport.width}px`,
          }}
        >
          <ChalkboardBackdrop />
          <div className="chalkboard-canvas-shell">
            <canvas
              ref={canvasRef}
              className="chalkboard-canvas"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            />
            {editor.textEntry ? (
              <input
                ref={textInputRef}
                className="chalkboard-text-entry"
                style={{ left: editor.textEntry.screenX, top: editor.textEntry.screenY }}
                type="text"
                maxLength={280}
                placeholder="Écris ici…"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    editor.finishTextEntry(event.currentTarget.value);
                  } else if (event.key === "Escape") {
                    editor.cancelTextEntry();
                  }
                }}
              />
            ) : null}
            {loading ? <div className="chalkboard-loader">La craie chauffe…</div> : null}
            {!loading && !snapshot.interventions.length && !editing ? (
              <div className="chalkboard-empty">Le tableau est encore vierge. À toi d'ouvrir le bal.</div>
            ) : null}
            {moderationMode ? <div className="chalkboard-moderation-hint">Mode admin · clique sur une intervention pour l'effacer</div> : null}
          </div>
        </div>
      </section>
      <footer className="chalkboard-footer" aria-hidden="true">
        <span>Fais défiler le tableau horizontalement</span>
        <span className="material-symbols-outlined">swipe</span>
      </footer>
    </main>
  );
}
