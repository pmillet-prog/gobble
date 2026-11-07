import { INFORTUNE_REWARDS } from '../../shared/infortuneWheel.js';

// Read the existing presentation, without a GPU readback or a new shader.
export function captureWheelResultExit({ scene, flatStage, graphics, flat, result }) {
  const origin = scene?.getBoundingClientRect();
  if (!origin?.width || !result) return null;
  const counter = scene.closest('.infortune-game')?.querySelector('.currency-counter--bank')
    || document.querySelector('.currency-layer .currency-counter--bank');
  const bank = counter?.getBoundingClientRect();
  let source;
  if (flat) {
    const card = flatStage?.querySelector('.flat-wheel-stage__result');
    const label = card?.querySelector('strong');
    if (!label) return null;
    const bounds = label.getBoundingClientRect(), halo = card.getBoundingClientRect(), style = getComputedStyle(label);
    source = { x: bounds.x + bounds.width / 2 - origin.x, y: bounds.y + bounds.height / 2 - origin.y,
      width: bounds.width, height: bounds.height, text: label.textContent,
      font: style.font, fontSize: parseFloat(style.fontSize), color: style.color, letterSpacing: style.letterSpacing,
      halo: { width: halo.width, height: halo.height, offsetY: halo.y + halo.height / 2 - (bounds.y + bounds.height / 2),
        background: getComputedStyle(card).backgroundImage, radius: 12 } };
    card.style.visibility = 'hidden';
  } else source = graphics?.takeResultPresentation?.();
  const finish = source => {
    if (!source) return null;
    const amount = result.kind === 'amount' ? result.amount : result.kind === 'bonus' ? INFORTUNE_REWARDS.bonus : 0;
    return { ...source, x: source.x + origin.x, y: source.y + origin.y,
      target: bank?.width ? { x: bank.x + bank.width / 2, y: bank.y + bank.height / 2 } : null,
      transfer: amount > 0, label: result.label,
      amountLabel: amount > 0 && result.kind !== 'amount' ? `${amount.toLocaleString('fr-FR')} €` : null };
  };
  return source?.then ? source.then(finish) : finish(source);
}
