import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { adb, connectWebView, delay, packageName, serial } from './webview-session.mjs';

// Read-only replay: this server never contacts a backend. Give it a previously
// captured public /api/chalkboard/free response, not an empty placeholder board.
if (!serial.startsWith('emulator-')) throw new Error('Use an emulator, not a player device');
const outputDirectory = '.tmp/hybrid-measurements';
const snapshotPath = process.env.GOBBLE_CHALKBOARD_SNAPSHOT || `${outputDirectory}/chalkboard-snapshot.json`;
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
const currentManifest = JSON.parse(await readFile('dist/native-assets.json', 'utf8'));
const liveManifest = JSON.parse(await readFile(process.env.GOBBLE_CHALKBOARD_LIVE_MANIFEST || `${outputDirectory}/native-assets-live.json`, 'utf8'));
const fontCatalog = JSON.parse(await readFile(process.env.GOBBLE_CHALKBOARD_FONT_CATALOG || `${outputDirectory}/chalkboard-fonts-live.json`, 'utf8'));
assert.ok(snapshot.interventions?.length, 'A filled board snapshot is required');
assert.ok(fontCatalog.fonts?.length, 'A real chalk font catalogue is required');
const samples = Number(process.env.GOBBLE_CHALKBOARD_SAMPLES || 3);
assert.ok(Number.isInteger(samples) && samples >= 1 && samples <= 10);
const boardTimeout = Number(process.env.GOBBLE_CHALKBOARD_TIMEOUT_MS || 90000);
assert.ok(Number.isInteger(boardTimeout) && boardTimeout >= 10000 && boardTimeout <= 600000);
const summary = {
  revision: snapshot.revision, weekId: snapshot.weekId, interventions: snapshot.interventions.length,
  elements: snapshot.interventions.flatMap(item => item.elements || []).length,
  points: snapshot.interventions.flatMap(item => item.elements || []).reduce((count, item) => count + (item.points?.length || 0), 0),
};

// Passive instrumentation only: keep the production worker, drawing algorithm,
// tile order, fonts and delays. A marker proves its script came from this local
// fixture; a worker accidentally bypassing the fixture cannot pass the benchmark.
const workerInstrumentation = `(() => {
  const send = self.postMessage.bind(self);
  const emit = (kind, detail = {}) => send({__gobbleChalkMeasure:{kind,at:performance.now(),...detail}});
  const source = new WeakMap();
  const OriginalFontFace = self.FontFace;
  self.FontFace = new Proxy(OriginalFontFace, {construct(Target,args){const face=Reflect.construct(Target,args);source.set(face,args[1]);return face;}});
  const originalLoad = OriginalFontFace.prototype.load;
  OriginalFontFace.prototype.load = function(...args) {
    const started=performance.now(), family=this.family, url=source.get(this);
    emit('font-start',{family,url});
    return originalLoad.apply(this,args).then(result=>{emit('font',{family,url,started,duration:performance.now()-started,ok:true});return result;},error=>{emit('font',{family,url,started,duration:performance.now()-started,ok:false,error:String(error)});throw error;});
  };
  const jobs=new Map();
  self.addEventListener('message',event=>{if(event.data?.id){jobs.set(event.data.id,performance.now());emit('raster-start',{id:event.data.id,fonts:event.data.fonts?.length,groups:event.data.groups?.length,points:event.data.groups?.reduce((total,group)=>total+group.items.reduce((count,item)=>count+(item.element.points?.length||0),0),0)});}});
  self.postMessage=function(message,...args){
    if(message?.id&&jobs.has(message.id)){const started=jobs.get(message.id);jobs.delete(message.id);emit('raster',{id:message.id,started,duration:performance.now()-started,error:!!message.error});}
    return send(message,...args);
  };
  try { new PerformanceObserver(list=>{for(const r of list.getEntries())emit('resource',{name:r.name,initiatorType:r.initiatorType,duration:r.duration,transferSize:r.transferSize,encodedBodySize:r.encodedBodySize});}).observe({type:'resource',buffered:true}); } catch {}
  emit('fixture-worker-ready');
})();\n`;

const pageInstrumentation = `(() => {
  const bench=window.__chalkBench={current:null,workers:[],fonts:[],fetches:[],longTasks:[],errors:[]};
  performance.setResourceTimingBufferSize(5000);
  const now=()=>performance.now();
  const activity=()=>{if(bench.current)bench.current.lastActivity=now();};
  bench.start=label=>{bench.current={label,started:now(),lastActivity:now(),mountedAt:null,textureAt:null,firstPaintAt:null,workerOffset:bench.workers.length,fontOffset:bench.fonts.length,fetchOffset:bench.fetches.length,longTaskOffset:bench.longTasks.length};};
  const originalFetch=window.fetch;
  window.fetch=async function(...args){
    const name=String(args[0]?.url||args[0]);
    if(!name.includes('/api/chalkboard/'))return originalFetch.apply(this,args);
    const record={name,started:now()};bench.fetches.push(record);
    try {
      const response=await originalFetch.apply(this,args);record.headersAt=now();record.status=response.status;
      const originalJson=response.json.bind(response);
      response.json=async()=>{const value=await originalJson();record.parsedAt=now();record.interventions=value.interventions?.length;activity();return value;};
      return response;
    } catch(error){record.error=String(error);record.endedAt=now();activity();throw error;}
  };
  const originalLoad=FontFace.prototype.load;
  FontFace.prototype.load=function(...args){
    if(!this.family.includes('Gobble')||!this.family.includes('Chalk'))return originalLoad.apply(this,args);
    const record={family:this.family,started:now()};bench.fonts.push(record);
    return originalLoad.apply(this,args).then(value=>{record.endedAt=now();record.ok=true;activity();return value;},error=>{record.endedAt=now();record.ok=false;record.error=String(error);activity();throw error;});
  };
  const OriginalWorker=window.Worker;
  window.Worker=class extends OriginalWorker {
    constructor(url,options){
      super(url,options);
      if(!String(url).includes('chalkboardRasterWorker'))return;
      const record={url:String(url),started:now(),jobs:[],traces:[],errors:[],active:0,fixture:false};bench.workers.push(record);
      const originalPost=this.postMessage.bind(this);
      this.postMessage=(data,...args)=>{record.jobs.push({id:data.id,started:now(),fonts:data.fonts?.length,groups:data.groups?.length,bounds:data.bounds,ratio:data.ratio});record.active++;activity();return originalPost(data,...args);};
      this.addEventListener('message',event=>{
        if(event.data?.__gobbleChalkMeasure){event.stopImmediatePropagation();const trace=event.data.__gobbleChalkMeasure;record.traces.push(trace);if(trace.kind==='fixture-worker-ready')record.fixture=true;return;}
        const job=record.jobs.find(item=>item.id===event.data?.id&&!item.endedAt);
        if(job){job.endedAt=now();job.error=!!event.data.error;record.active--;activity();}
      });
      this.addEventListener('error',event=>{record.errors.push({at:now(),message:event.message||'worker_error'});record.active=0;activity();});
    }
  };
  const originalDraw=CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage=function(...args){
    const result=originalDraw.apply(this,args);
    if(bench.current&&this.canvas.classList?.contains('chalkboard-canvas')){bench.current.firstPaintAt??=now();bench.current.lastPaintAt=now();activity();}
    return result;
  };
  const observer=new MutationObserver(()=>{
    const sample=bench.current;if(!sample)return;
    if(document.querySelector('.chalkboard-scroll'))sample.mountedAt??=now();
    if(document.querySelector('.chalkboard-surface-panel')?.style.backgroundImage.includes('blob:'))sample.textureAt??=now();
  });observer.observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['style']});
  try {new PerformanceObserver(list=>{for(const e of list.getEntries())bench.longTasks.push({started:e.startTime,duration:e.duration});}).observe({type:'longtask',buffered:true});}catch{}
  window.addEventListener('error',event=>bench.errors.push({at:now(),message:event.message}));
  bench.state=()=>{
    const sample=bench.current;if(!sample)return null;
    const workers=bench.workers.slice(sample.workerOffset);
    const fetches=bench.fetches.slice(sample.fetchOffset);
    const fonts=Array.from(document.fonts).filter(face=>face.family.includes('Gobble')&&face.family.includes('Chalk'));
    return {mounted:!!sample.mountedAt,texture:!!sample.textureAt,painted:!!sample.firstPaintAt,
      fontsLoaded:fonts.filter(face=>face.status==='loaded').length,
      fontLoadsPending:bench.fonts.slice(sample.fontOffset).filter(item=>!item.endedAt).length,
      snapshotParsed:fetches.some(item=>/\\/api\\/chalkboard\\/free(?:\\?|$)/.test(item.name)&&item.parsedAt),
      workers:workers.length,fixtureWorkers:workers.filter(item=>item.fixture).length,
      lastJobFonts:workers.length?Math.min(...workers.map(item=>item.jobs.at(-1)?.fonts??-1)):-1,
      pending:workers.reduce((n,item)=>n+item.active,0),jobs:workers.reduce((n,item)=>n+item.jobs.length,0),
      workerErrors:workers.reduce((n,item)=>n+item.errors.length+item.jobs.filter(job=>job.error).length,0),
      quietMs:now()-sample.lastActivity,loader:!!document.querySelector('.chalkboard-loader')};
  };
  bench.result=(readPixels=true)=>{
    const sample=bench.current, canvas=document.querySelector('.chalkboard-canvas');
    let nonTransparentSamples=0,pixelHash=2166136261;
    if(readPixels&&canvas?.width&&canvas.height){const ctx=canvas.getContext('2d');const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;for(let i=0;i<data.length;i++){pixelHash=Math.imul(pixelHash^data[i],16777619);if(i%4===3&&data[i])nonTransparentSamples++;}}
    return {sample,state:bench.state(),nonTransparentPixels:nonTransparentSamples,pixelHash:readPixels?(pixelHash>>>0).toString(16):null,canvas:canvas?{width:canvas.width,height:canvas.height,rect:canvas.getBoundingClientRect().toJSON(),style:canvas.style.cssText}:null,
      viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio,orientation:screen.orientation.type},
      workers:bench.workers.slice(sample.workerOffset),fonts:bench.fonts.slice(sample.fontOffset),fetches:bench.fetches.slice(sample.fetchOffset),longTasks:bench.longTasks.slice(sample.longTaskOffset),errors:bench.errors,
      resources:performance.getEntriesByType('resource').filter(r=>r.startTime>=sample.started).map(r=>({name:r.name,initiatorType:r.initiatorType,startTime:r.startTime,duration:r.duration,transferSize:r.transferSize,encodedBodySize:r.encodedBodySize,responseEnd:r.responseEnd}))};
  };
})();`;

const availableVariants = [
  { name:'native-live', bundled:true, manifest:liveManifest },
  { name:'native-current', bundled:true, manifest:currentManifest },
  { name:'web-media', bundled:false, manifest:currentManifest },
];
const variantNames = process.env.GOBBLE_CHALKBOARD_VARIANTS?.split(',').map(value=>value.trim()).filter(Boolean);
if(variantNames)assert.ok(variantNames.length && variantNames.every(name=>availableVariants.some(item=>item.name===name)), 'Unknown benchmark variant');
const variants = variantNames ? [...new Set(variantNames)].map(name=>availableVariants.find(item=>item.name===name)) : availableVariants;
let variant = variants[0];
const requests = [];
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.wav':'audio/wav','.mp3':'audio/mpeg','.m4a':'audio/mp4','.ogg':'audio/ogg','.ttf':'font/ttf','.otf':'font/otf','.woff':'font/woff','.woff2':'font/woff2','.txt':'text/plain'};
const distRoot=path.resolve('dist');
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  const pathname=decodeURIComponent(url.pathname);
  const record={variant:variant.name,path:pathname,started:Date.now()};requests.push(record);
  const reply=(status,type,data)=>{record.status=status;record.bytes=Buffer.byteLength(data);res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store'});res.end(data);};
  if(pathname==='/native-assets.json')return reply(200,'application/json',JSON.stringify(variant.manifest));
  if(pathname==='/api/chalkboard/free')return reply(200,'application/json',JSON.stringify(snapshot));
  if(pathname==='/api/chalkboard/fonts')return reply(200,'application/json',JSON.stringify(fontCatalog));
  if(pathname==='/api/chalkboard/access')return reply(200,'application/json',JSON.stringify({ok:true,canAccess:true}));
  if(pathname.startsWith('/api/')||pathname.startsWith('/socket.io/'))return reply(200,'application/json',JSON.stringify({ok:true,user:null,maintenanceMode:false,rooms:[]}));
  const file=path.resolve(distRoot,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(distRoot+path.sep))return reply(400,'text/plain','Bad fixture path');
  try {
    let data=await readFile(file);
    if(/^\/assets\/chalkboardRasterWorker-[^/]+\.js$/.test(pathname))data=Buffer.concat([Buffer.from(workerInstrumentation),data]);
    return reply(200,mime[path.extname(file)]||'application/octet-stream',data);
  } catch {return reply(404,'text/plain','Missing local fixture');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port, origin=`http://127.0.0.1:${port}`;
await adb('reverse',`tcp:${port}`,`tcp:${port}`);
let session;
const results=[];
async function waitFor(expression,label,timeout=60000){
  const deadline=Date.now()+timeout;
  let nextProgress=Date.now()+10000;
  while(Date.now()<deadline){
    try{if(await session.evaluate(expression))return;}catch{}
    if(Date.now()>=nextProgress&&label.startsWith('filled board')){
      nextProgress=Date.now()+10000;
      const progress=await session.evaluate(`(()=>{const b=window.__chalkBench;return {state:b?.state(),workers:b?.workers.slice(b.current.workerOffset).map(w=>({url:w.url,fixture:w.fixture,active:w.active,jobCount:w.jobs.length,jobs:w.jobs.slice(-3).map(j=>({id:j.id,fonts:j.fonts,groups:j.groups,pendingMs:j.endedAt?null:performance.now()-j.started,duration:j.endedAt?j.endedAt-j.started:null,error:j.error})),traceCount:w.traces.length,traces:w.traces.slice(-6),errors:w.errors}))};})()`).catch(error=>({error:String(error)}));
      console.log(JSON.stringify({progress:label,...progress}));
    }
    await delay(150);
  }
  throw new Error(`Timeout: ${label}; ${JSON.stringify(await session.evaluate('window.__chalkBench?.state()').catch(()=>null))}`);
}
async function tap(selector){
  const point=await session.evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
}
async function measure(cache,sample){
  await waitFor('!!document.querySelector(".home-lobby-stage-complete")','home intro completed');
  const requestOffset=requests.length;
  const nativeBefore=await session.evaluate('GobbleNative.getDiagnostics()');
  await session.evaluate(`window.__chalkBench.start(${JSON.stringify(`${variant.name}-${sample}-${cache}`)})`);
  await tap('.home-chalkboard-button');
  await waitFor(`(()=>{const s=window.__chalkBench?.state();return s?.mounted&&s.texture&&s.painted&&s.snapshotParsed&&s.fontsLoaded>=${fontCatalog.fonts.length}&&!s.fontLoadsPending&&s.workers>0&&s.fixtureWorkers===s.workers&&s.lastJobFonts===${fontCatalog.fonts.length}&&s.jobs>0&&!s.pending&&!s.workerErrors&&!s.loader&&s.quietMs>500})()`,'filled board painted with fonts and worker complete',boardTimeout);
  const data=await session.evaluate('window.__chalkBench.result()');
  assert.ok(data.nonTransparentPixels>0,'The filled board must have visible ink');
  const capture=process.env.GOBBLE_CHALKBOARD_CAPTURE;
  if(capture&&sample===1){
    assert.match(capture,/^[a-z0-9-]+$/);
    const image=await session.send('Page.captureScreenshot',{format:'png'});
    await mkdir(outputDirectory,{recursive:true});
    await writeFile(`${outputDirectory}/chalkboard-${capture}-${variant.name}-${sample}-${cache}.png`,Buffer.from(image.data,'base64'));
    const bitmap=await session.evaluate('document.querySelector(".chalkboard-canvas").toDataURL("image/png")');
    await writeFile(`${outputDirectory}/chalkboard-${capture}-${variant.name}-${sample}-${cache}-canvas.png`,Buffer.from(bitmap.split(',')[1],'base64'));
    const deviceCapture=`/data/local/tmp/gobble-chalkboard-${Date.now()}.png`;
    await adb('shell','screencap','-p',deviceCapture);
    await adb('pull',deviceCapture,`${outputDirectory}/chalkboard-${capture}-${variant.name}-${sample}-${cache}-native.png`);
    await adb('shell','rm',deviceCapture);
  }
  assert.equal(await session.evaluate('!!navigator.serviceWorker.controller'),false,'Use the same native WebView without a service worker for every variant');
  const workers=data.workers;
  const finishedAt=Math.max(data.sample.lastPaintAt||0,data.sample.textureAt||0,...data.fonts.map(font=>font.endedAt||0),...workers.flatMap(worker=>worker.jobs.map(job=>job.endedAt||0)));
  const row={variant:variant.name,manifestVersion:variant.manifest.version,run:sample,cache,
    readyMs:finishedAt-data.sample.started,mountedMs:data.sample.mountedAt-data.sample.started,firstPaintMs:data.sample.firstPaintAt-data.sample.started,textureMs:data.sample.textureAt-data.sample.started,
    fontMs:data.fonts.length?Math.max(...data.fonts.map(font=>font.endedAt))-data.sample.started:0,
    workerJobs:workers.reduce((count,worker)=>count+worker.jobs.length,0),workerRasterMs:workers.flatMap(worker=>worker.traces).filter(trace=>trace.kind==='raster').reduce((total,trace)=>total+trace.duration,0),
    nativeBefore,nativeAfter:await session.evaluate('GobbleNative.getDiagnostics()'),fixtureRequests:requests.slice(requestOffset),...data};
  results.push(row);
  console.log(JSON.stringify({variant:row.variant,sample,cache,readyMs:Math.round(row.readyMs),firstPaintMs:Math.round(row.firstPaintMs),fontMs:Math.round(row.fontMs),workerRasterMs:Math.round(row.workerRasterMs),workerJobs:row.workerJobs,visiblePixels:row.nonTransparentPixels}));
}
async function save(error){
  await mkdir(outputDirectory,{recursive:true});
  const failedSample=error&&session?await session.evaluate('window.__chalkBench?.current ? window.__chalkBench.result(false) : null').catch(failure=>({captureError:String(failure)})):null;
  const medians=variants.flatMap(item=>['cold-http','warm-reopen'].map(cache=>{
    const rows=results.filter(row=>row.variant===item.name&&row.cache===cache);
    const median=key=>{const values=rows.map(row=>row[key]).sort((a,b)=>a-b);return values.length?values[Math.floor(values.length/2)]:null;};
    return{variant:item.name,cache,samples:rows.length,readyMs:median('readyMs'),firstPaintMs:median('firstPaintMs'),fontMs:median('fontMs'),workerRasterMs:median('workerRasterMs')};
  }));
  await writeFile(`${outputDirectory}/chalkboard-loading.json`,JSON.stringify({createdAt:new Date().toISOString(),scope:'Same Android WebView and local filled-board fixture; no Chrome/TWA timing claim. Cold means HTTP cache cleared; native APK/disk cache and credentials are preserved. Warm means closing and reopening this board in the same document.',snapshot:summary,manifests:{current:currentManifest.version,live:liveManifest.version},browser:session?await session.evaluate('navigator.userAgent').catch(()=>null):null,medians,results,failedSample,requests,error:error?String(error):null},null,2));
  console.log(JSON.stringify({snapshot:summary,medians,error:error?String(error):null}));
}
try {
  for(let sample=1;sample<=samples;sample++){
    // Rotate order to limit emulator warm-up bias between variants.
    const order=variants.map((_,index)=>variants[(index+sample-1)%variants.length]);
    for(const next of order){
      variant=next;session?.close();
      await adb('shell','am','force-stop',packageName);
      await adb('shell','am','start','-n',`${packageName}/fr.gobble.hybrid.MainActivity`,'--es','fixtureOrigin',origin,'--ez','bundledMedia',String(variant.bundled));
      session=await connectWebView();
      await session.send('Page.enable');await session.send('Network.enable');
      await session.send('Page.addScriptToEvaluateOnNewDocument',{source:pageInstrumentation});
      await session.send('Network.clearBrowserCache');
      await session.send('Page.reload',{ignoreCache:true});
      await waitFor('!!window.__chalkBench && !!document.querySelector(".home-play")','instrumented home mounted');
      await measure('cold-http',sample);
      await adb('shell','input','keyevent','4');
      await waitFor('!!document.querySelector(".home-play") && !document.querySelector(".chalkboard-scroll")','return home');
      await measure('warm-reopen',sample);
      await save();
    }
  }
} catch(error){await save(error);throw error;}
finally {
  session?.close();
  await adb('shell','am','force-stop',packageName).catch(()=>{});
  await adb('reverse','--remove',`tcp:${port}`).catch(()=>{});
  await new Promise(resolve=>server.close(resolve));
}
