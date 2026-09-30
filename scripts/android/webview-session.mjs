import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import WebSocket from 'ws';

const execFile = promisify(execFileCallback);
export const packageName = 'fr.gobble.hybrid.prototype';
const sdk = process.env.ANDROID_HOME || path.join(process.env.LOCALAPPDATA || '', 'Android/Sdk');
const adbPath = path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
export const serial = process.env.GOBBLE_ANDROID_DEVICE || 'emulator-5554';
export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function adb(...args) {
  return (await execFile(adbPath, ['-s', serial, ...args], { windowsHide: true, timeout: 30000 })).stdout.trim();
}
export async function connectWebView() {
  let page;
  for (let i = 0; i < 40; i++) {
    try {
      const pid = (await adb('shell', 'pidof', packageName)).split(' ')[0];
      if (pid) {
        await adb('forward', 'tcp:9224', `localabstract:webview_devtools_remote_${pid}`);
        const targets = await fetch('http://127.0.0.1:9224/json').then(response => response.json());
        page = targets.find(target => target.type === 'page' && target.url.startsWith('https://gobble.fr')
          && !target.description?.includes('"visible":false'));
        if (page) break;
      }
    } catch { /* Activity/WebView starting. */ }
    await delay(500);
  }
  if (!page) throw new Error('Prototype WebView debugging endpoint unavailable');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  let sequence = 0;
  const pending = new Map(), listeners = new Set();
  socket.on('message', raw => {
    const message = JSON.parse(raw);
    if (message.id) {
      const item = pending.get(message.id);
      if (!item) return;
      pending.delete(message.id); clearTimeout(item.timer);
      if (message.error) item.reject(new Error(JSON.stringify(message.error)));
      else item.resolve(message.result);
    } else for (const listener of listeners) listener(message);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  return {
    send,
    async evaluate(expression, userGesture = false) {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    },
    listen(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    close() { socket.close(); },
  };
}
