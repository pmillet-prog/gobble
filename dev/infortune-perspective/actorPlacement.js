// Keep the original image proportions. The side entrants face the play area
// on the rear half of the wheel, not the viewer. The stronger three-quarter
// angle remains foreshortened even at the workshop's widest focal length.
export function placeStageActor(actor, { position, height }) {
  actor.position.set(position[0], position[1] + height / 2, position[2]);
  actor.rotation.set(0, Math.atan2(-position[0], 120 - position[2]), 0);
  actor.updateMatrixWorld(true);
}
