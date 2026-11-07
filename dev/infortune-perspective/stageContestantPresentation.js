import { Vector3 } from "three";
import { DESK_SCREEN_TEXT, deskWallRadius } from "./stageDeskDimensions.js";

// Read only when a choice opens or the viewport changes, never per render frame.
export function stageContestantPresentation(actor, contestant, projection) {
  if (!actor || !contestant) return null;
  const project = point => {
    point.project(projection.camera);
    return { x: (point.x + 1) * projection.width / 2, y: (1 - point.y) * projection.height / 2 };
  };
  const angle = Math.atan2(contestant.position[0], contestant.position[2]);
  const radius = deskWallRadius(DESK_SCREEN_TEXT.nameY, "inner", angle);
  const name = project(new Vector3(Math.sin(angle) * radius, DESK_SCREEN_TEXT.nameY, Math.cos(angle) * radius));
  const nameTop = project(new Vector3(Math.sin(angle) * radius, DESK_SCREEN_TEXT.nameY + 15, Math.cos(angle) * radius));
  actor.updateWorldMatrix(true, false);
  const { width, height } = actor.geometry.parameters;
  const corners = [-1, 1].flatMap(x => [-1, 1].map(y => project(actor.localToWorld(new Vector3(x * width / 2, y * height / 2, 0)))));
  const left = Math.max(0, Math.min(...corners.map(p => p.x))), top = Math.max(0, Math.min(...corners.map(p => p.y)));
  const right = Math.min(projection.width, Math.max(...corners.map(p => p.x)));
  const bottom = Math.min(projection.height, Math.max(...corners.map(p => p.y)));
  return { name: { ...name, height: Math.max(1, Math.abs(name.y - nameTop.y)) },
    avatar: { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) } };
}
