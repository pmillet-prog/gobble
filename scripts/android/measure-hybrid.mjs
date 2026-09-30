import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { adb, connectWebView, delay, packageName } from './webview-session.mjs';

const manifest = JSON.parse(await readFile('android-hybrid/app/build/generated/web-assets/bundle-manifest.json', 'utf8'));
const mediaPaths = Object.keys(manifest.files);
const results = [];
const observe = `(() => {
  window.__hybridBench = {homeMountedMs:null};
  const observer = new MutationObserver(() => {
    if (document.querySelector('.home-play')) {
      window.__hybridBench.homeMountedMs = performance.now();
      observer.disconnect();
    }
  });
  observer.observe(document, {subtree:true,childList:true});
  performance.setResourceTimingBufferSize(2000);
})();`;

// Restart only this prototype. Never clear credentials or touch the published package.
for (const bundled of [false, true]) {
  await adb('shell', 'am', 'force-stop', packageName);
  await adb('shell', 'am', 'start', '-n', `${packageName}/fr.gobble.hybrid.MainActivity`, '--ez', 'bundledMedia', String(bundled));
  const session = await connectWebView();
  try {
    await session.send('Page.enable');
    await session.send('Network.enable');
    await session.send('Page.addScriptToEvaluateOnNewDocument', { source: observe });
    for (let sample = 1; sample <= 3; sample++) {
      for (const cache of ['cold', 'warm']) {
        if (cache === 'cold') await session.send('Network.clearBrowserCache');
        // Preserve the deliberate intro on both variants; session marker must not bias one side.
        await session.evaluate("sessionStorage.removeItem('gobble_boot_assets_ready_v2')");
        const before = await session.evaluate('GobbleNative.getDiagnostics()');
        const transferred = new Map(), requests = new Map(), failures = [];
        const unlisten = session.listen(({method, params}) => {
          if (method === 'Network.requestWillBeSent') {
            const url = new URL(params.request.url);
            if (url.origin === 'https://gobble.fr' && mediaPaths.includes(decodeURIComponent(url.pathname))) requests.set(params.requestId, url.pathname);
          }
          if (method === 'Network.loadingFinished' && requests.has(params.requestId)) transferred.set(params.requestId, params.encodedDataLength);
          if (method === 'Network.loadingFailed' && requests.has(params.requestId)) failures.push({ path: requests.get(params.requestId), error: params.errorText });
        });
        await session.send('Page.reload');
        let homeReady = false;
        for (let attempt = 0; attempt < 40; attempt++) {
          await delay(500);
          try { homeReady = await session.evaluate('!!window.__hybridBench?.homeMountedMs'); } catch { }
          if (homeReady) break;
        }
        if (!homeReady) throw new Error('Home did not mount within 20 seconds');
        await delay(1500);
        const result = await session.evaluate(`(async () => {
          const paths = new Set(${JSON.stringify(mediaPaths)});
          const resources = performance.getEntriesByType('resource').filter(r => new URL(r.name).origin === location.origin && paths.has(decodeURIComponent(new URL(r.name).pathname)));
          return {
            homeMountedMs: window.__hybridBench.homeMountedMs,
            fcpMs: performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
            mediaDurationMs: resources.reduce((sum,r)=>sum+r.duration,0),
            mediaRequests: resources.length,
            native: await GobbleNative.getDiagnostics(),
            browser: navigator.userAgent,
            fullscreenButton: !!document.querySelector('.home-display-mode-button'),
            serviceWorker: !!navigator.serviceWorker.controller
          };
        })()`);
        unlisten();
        const row = { bundled, cache, sample, ...result,
          measuredMediaTransferBytes: [...transferred.values()].reduce((sum,value)=>sum+value,0),
          bundledServedBytes: result.native.bundledResponseBytes - before.bundledResponseBytes,
          bundledServedRequests: result.native.bundledRequests - before.bundledRequests,
          failedMediaRequests: failures };
        results.push(row);
        console.log(JSON.stringify(row));
        await mkdir('.tmp/hybrid-measurements', {recursive:true});
        await writeFile('.tmp/hybrid-measurements/results.json', JSON.stringify({bundleVersion:manifest.version, measuredAt:new Date().toISOString(), method:'Web code in both variants; media from HTTPS or verified native store. Requires deployed native-assets.json; do not deploy during comparison. Browser cache cleared for cold, immediately reused for warm; unchanged intro timings. Emulator measurements, not a TWA comparison.', results}, null, 2));
      }
    }
  } finally { session.close(); }
}
