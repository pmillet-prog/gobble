import { prepareInfortuneContestant } from '../../src/features/infortune/prepareInfortuneContestant.js';
import { placeStageContestants } from './stageFixtures.js';

// The avatar compositor also serves the shop/profile and remains DOM-owned.
// Transfer only the two finished cutouts; all stage texture work happens off-thread.
export async function prepareWheelWorkerPortraits(contestants, isDisposed) {
  const portraits = [];
  let renderer;
  try {
    for (const player of placeStageContestants(contestants)) {
      if (isDisposed()) throw new DOMException('Cancelled', 'AbortError');
      const canvas = Object.assign(document.createElement('canvas'), { width: 600, height: 600 });
      try {
        const source = await prepareInfortuneContestant(player, { makeCanvas: () => canvas, isDisposed,
          loadRenderer: async () => renderer ||= await (await import('../../src/features/avatar/avatarRenderer.js')).createAvatarRenderer() });
        if (!source || isDisposed()) throw new DOMException('Cancelled', 'AbortError');
        portraits.push({ id: player.id, image: await createImageBitmap(source) });
      } finally { canvas.width = canvas.height = 0; }
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    if (isDisposed()) throw new DOMException('Cancelled', 'AbortError');
    return portraits;
  } catch (error) {
    for (const portrait of portraits) portrait.image.close();
    throw error;
  }
}
