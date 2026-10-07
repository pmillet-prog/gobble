// Keyboard visibility depends on lost visual height, not on its lower edge:
// WebKit can pan that smaller viewport until its bottom meets the layout bottom.
export function computeLiveSalonKeyboardViewport({
  surfaceHeight = 0,
  viewportHeight = 0,
  viewportWidth = 0,
  offsetTop = 0,
  offsetLeft = 0,
}) {
  const height = Math.max(0, Number(surfaceHeight) || 0);
  const visibleHeight = Math.max(0, Number(viewportHeight) || 0);
  const width = Math.max(0, Number(viewportWidth) || 0);
  const top = Math.max(0, Number(offsetTop) || 0);
  const left = Math.max(0, Number(offsetLeft) || 0);
  return {
    keyboardVisible: height - visibleHeight >= Math.max(110, height * 0.17),
    // Position from the visible edge, independently of the body's locked height.
    composerBottom: top + visibleHeight - 10,
    composerLeft: left + width * 0.04,
    composerWidth: width * 0.92,
  };
}
