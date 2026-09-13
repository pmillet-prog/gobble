import React from "react";
import { hitTestIntervention } from "./chalkboardModel.js";
import { deleteChalkboardIntervention, undoChalkboardDeletion } from "./chalkboardApi.js";

export default function useChalkboardModeration({ board, interventions, canModerate, canUndoDelete, busy, setBusy, setNotice, reload, getErrorMessage }) {
  const [mode, setMode] = React.useState(false);
  const [hoveredId, setHoveredId] = React.useState("");
  const [selectedId, setSelectedId] = React.useState("");
  const close = React.useCallback(() => { setMode(false); setHoveredId(""); setSelectedId(""); }, []);
  React.useEffect(close, [board, canModerate, close]);
  React.useEffect(() => {
    if (selectedId && !interventions.some(entry => entry.id === selectedId)) setSelectedId("");
    if (hoveredId && !interventions.some(entry => entry.id === hoveredId)) setHoveredId("");
  }, [interventions, selectedId, hoveredId]);
  const hit = point => {
    if (!mode || !canModerate || busy || !point) return "";
    for (let index = interventions.length - 1; index >= 0; index--) {
      if (hitTestIntervention(interventions[index], point.worldX, point.worldY)) return interventions[index].id;
    }
    return "";
  };
  const hover = point => { if (!selectedId) setHoveredId(hit(point)); };
  const select = point => { const id = hit(point); setSelectedId(id); setHoveredId(id); };
  const clearHover = () => setHoveredId("");
  const clearSelection = () => { setSelectedId(""); setHoveredId(""); };
  const selected = interventions.find(entry => entry.id === selectedId) || null;
  const preview = selected || interventions.find(entry => entry.id === hoveredId) || null;
  const run = async (command, success) => {
    if (busy || !canModerate) return;
    setBusy(true);
    setNotice("");
    try {
      await command();
      clearSelection();
      await reload({ quiet: true });
      setNotice(success);
    } catch (error) {
      setNotice(error?.message === "undo_not_available" ? "Cet effacement ne peut plus être annulé." : getErrorMessage(error));
      if (error?.message === "undo_not_available" || error?.status === 404) await reload({ quiet: true });
    } finally { setBusy(false); }
  };
  return {
    mode, selected, preview, close, hover, select, clearHover, clearSelection,
    toggle: () => { if (!busy && canModerate) { setMode(value => !value); clearSelection(); } },
    erase: () => selected && run(() => deleteChalkboardIntervention(selected.id), "Intervention effacée. Tu peux annuler ce dernier effacement."),
    undo: () => canUndoDelete && run(() => undoChalkboardDeletion(board), "Le dernier effacement a été annulé."),
  };
}
