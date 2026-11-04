import React from "react";
import { CAMERA_SEQUENCES, CAMERA_TRACKS, cameraAt, keyframeTime } from "./cameraTimeline.js";
import "./cameraTimeline.css";

export function CameraTimeline({ editor, disabled = false }) {
  disabled ||= !editor.projectReady;
  const { timeline, transport, display } = editor;
  const { sequence, time, playing } = transport, duration = CAMERA_SEQUENCES[sequence].duration;
  const camera = cameraAt(timeline, sequence, time), selectedTime = keyframeTime(sequence, time);
  const projectSave = editor.projectSaves[sequence];
  const backups = editor.sequenceBackups(sequence);
  const savedInProject = editor.isSequenceSaved(sequence);
  return <section className="camera-timeline" aria-label="Timeline de réalisation caméra"
    ref={node => { display.current.root = node; }} style={{ "--camera-playhead": `${time / duration * 100}%` }}>
    <div className="camera-timeline__heading"><h2>La réalisation</h2><output ref={node => { display.current.clock = node; }}>{time.toFixed(2)} / {duration.toFixed(2)} s</output></div>
    <div className="camera-timeline__sequences" role="group" aria-label="Séquence caméra">
      {Object.entries(CAMERA_SEQUENCES).map(([id, value]) => <button key={id} type="button" aria-pressed={sequence === id}
        disabled={disabled} onClick={() => editor.select(id)}>{value.label} · {value.duration} s</button>)}
    </div>
    <div className="camera-timeline__transport">
      <button type="button" disabled={disabled} onClick={editor.restart} aria-label="Revenir au début de la séquence">↤ 0 s</button>
      <button type="button" disabled={disabled} onClick={editor.togglePlay}>{playing ? "Pause" : "Lire"}</button>
      <button type="button" disabled={disabled} onClick={editor.playAll}>Prévisualiser les 11 s</button>
    </div>
    {sequence === "launch" && <div className="camera-timeline__speed">
      <label htmlFor="camera-launch-speed">Déclencher sous <strong>{editor.speedThreshold.toFixed(2)} tour/s</strong></label>
      <input id="camera-launch-speed" type="range" min="0.05" max="3" step="0.05" value={editor.speedThreshold}
        disabled={disabled} onChange={event => editor.setSpeedThreshold(event.target.valueAsNumber)} />
      <span>Vitesse actuelle : <output ref={node => { display.current.velocity = node; }}>{(display.current.speed || 0).toFixed(2)} tour/s</output></span>
      <p>Seuil élevé : animation plus tôt. Seuil bas : plus près de l’arrêt. Ce réglage est sauvegardé avec le lancer.</p>
    </div>}
    <div className="camera-timeline__time">
      <label>Temps <input ref={node => { display.current.time = node; }} type="number" min="0" max={duration} step="0.1"
        defaultValue={time} disabled={disabled || playing} onChange={event => editor.seek(event.target.valueAsNumber)} onBlur={editor.refresh} /> s</label>
      <input ref={node => { display.current.scrub = node; }} type="range" aria-label="Position dans la séquence" min="0" max={duration}
        step="0.1" defaultValue={time} disabled={disabled} onChange={event => editor.seek(event.target.valueAsNumber)} />
    </div>
    <p className="camera-timeline__help">Choisis un instant, puis une valeur : un point est posé sur cette ligne. ◆ retire le point sélectionné.</p>
    <div className="camera-timeline__ruler" aria-hidden="true"><span /><div>{Array.from({ length: duration + 1 }, (_, index) => <span key={index}>{index}s</span>)}</div><span /><span /></div>
    <div className="camera-timeline__tracks">
      {CAMERA_TRACKS.map(({ key, label, min, max, unit }) => {
        const points = timeline[sequence][key], selected = points.some(point => point.time === selectedTime);
        return <div className="camera-timeline__row" key={key}>
          <label htmlFor={`camera-track-${key}`}>{label}<small>{unit}</small></label>
          <div className="camera-timeline__track">
            <button type="button" className="camera-timeline__seek" disabled={disabled}
              aria-label={`Choisir un instant pour ${label}`} onClick={event => {
                const rect = event.currentTarget.getBoundingClientRect();
                editor.seek(keyframeTime(sequence, (event.clientX - rect.left) / rect.width * duration));
              }} />
            {points.map(point => <button key={point.time} type="button" className="camera-timeline__key" disabled={disabled}
              style={{ left: `${point.time / duration * 100}%` }} aria-pressed={!playing && point.time === selectedTime}
              title={`${label} : ${point.value} ${unit} à ${point.time} s`} aria-label={`${label} : ${point.value} ${unit} à ${point.time} secondes`}
              onClick={() => editor.seek(point.time)}>◆</button>)}
            <span className="camera-timeline__playhead" />
          </div>
          <input id={`camera-track-${key}`} ref={node => { display.current.values[key] = node; }} type="number"
            min={min} max={max} step="0.1" defaultValue={camera[key]} disabled={disabled || playing}
            onChange={event => { if (Number.isFinite(event.target.valueAsNumber)) editor.setValue(key, event.target.valueAsNumber); }} onBlur={editor.refresh} />
          <button type="button" className="camera-timeline__toggle-key" disabled={disabled || playing}
            title={selected ? "Retirer ce point" : "Poser un point à cet instant"}
            aria-label={`${selected ? "Retirer" : "Ajouter"} le point ${label} à ${selectedTime} secondes`}
            onClick={() => selected ? editor.remove(key) : editor.setValue(key, camera[key])}>{selected ? "◆" : "◇"}</button>
        </div>;
      })}
    </div>
    <p className="camera-timeline__help">Le lancer démarre sous la vitesse choisie. Une fois l’animation terminée et la roue arrêtée, le retour plateau rejoint le cadrage de fin d’intro, avec le résultat affiché. Pose des points pour personnaliser ce retour.</p>
    {sequence === "results" && <p className="camera-timeline__help">Le secteur lumineux et ses caractères suivent aussi cette timeline. Après un lancer, rejoue ou parcours ces 3 secondes pour ajuster le bilan avec le dernier résultat.</p>}
    <label className="camera-timeline__automatic"><input type="checkbox" checked={editor.automatic} disabled={disabled}
      onChange={event => editor.setAutomatic(event.target.checked)} /> Jouer les séquences pendant les tours</label>
    <p className="camera-timeline__save" role="status">{!editor.projectReady ? "Chargement des séquences partagées…"
      : editor.projectLoadError || (editor.saved ? "Brouillon enregistré sur cet appareil." : "Sauvegarde indisponible : garde cet onglet ouvert.")}</p>
    <div className="camera-timeline__project-save">
      <button type="button" disabled={disabled || projectSave?.pending} onClick={() => editor.saveSequence(sequence)}>
        {projectSave?.pending ? "Sauvegarde…" : `Sauvegarder · ${CAMERA_SEQUENCES[sequence].label}`}
      </button>
      <p className="camera-timeline__save" role="status">{projectSave?.error || (savedInProject
        ? "Séquence partagée sauvegardée. Recharge l’atelier sur le téléphone pour la retrouver."
        : "Sauvegarde cette séquence pour la retrouver aussi sur les autres appareils.")}</p>
      {backups.length > 0 && <details><summary>Récupérer « {CAMERA_SEQUENCES[sequence].label} »</summary>
        <p className="camera-timeline__save">Reprends une version conservée sur cet appareil, puis sauvegarde-la pour la partager. Les autres séquences restent en place.</p>
        {backups.map(backup => <button key={backup.id} type="button" disabled={disabled || playing}
          onClick={() => editor.restoreDraftBackup(sequence, backup.id)}>{backup.label}</button>)}
      </details>}
    </div>
  </section>;
}
