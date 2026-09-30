import { connectWebView } from './webview-session.mjs';
import { writeFile } from 'node:fs/promises';
const session = await connectWebView();
try {
  if (process.argv[2] === '--screenshot') {
    const screenshot = await session.send('Page.captureScreenshot', { format: 'png' });
    await writeFile('.tmp/hybrid-screenshot.png', Buffer.from(screenshot.data, 'base64'));
    console.log('.tmp/hybrid-screenshot.png');
  } else console.log(JSON.stringify(await session.evaluate(process.argv[2] || `
    (async () => ({
      title: document.title,
      text: document.body.innerText.slice(0, 1500),
      orientation: screen.orientation.type,
      fullscreen: !!document.fullscreenElement,
      serviceWorker: !!navigator.serviceWorker.controller,
      native: await window.GobbleNative?.getDiagnostics(),
      images: [...document.images].filter(image => !image.complete || !image.naturalWidth).map(image => image.getAttribute('src')).slice(0, 12)
    }))()`, process.argv[3] === 'gesture'), null, 2));
} finally { session.close(); }
