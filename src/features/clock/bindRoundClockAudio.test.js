import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeatureStore } from '../../app/core/createFeatureStore.js';
import { bindRoundClockAudio } from './bindRoundClockAudio.js';

function harness() {
  const store=createFeatureStore({remainingSeconds:20,running:true});
  const documentTarget={hidden:false,visibilityState:'visible'};
  const context={phase:'playing',resetToken:'round-1',specialRoundType:null,isLiveSpecial3WordsMode:false};
  const ticks=[],shortTicks=[];
  const release=bindRoundClockAudio({clock:{store},getContext:()=>context,documentTarget,
    playTickSound:value=>ticks.push(value),playOneShotAudio:(...value)=>shortTicks.push(value)});
  return {store,context,documentTarget,ticks,shortTicks,release,tick:value=>store.set('remainingSeconds',value)};
}

test('a normal final countdown plays once; a same-round resync cannot restart it',()=>{
  const h=harness();h.tick(11);h.tick(10);h.tick(9);
  assert.equal(h.ticks.length,1);
  h.store.patch({remainingSeconds:60,running:true});h.tick(10);
  assert.equal(h.ticks.length,1);
  h.context.resetToken='round-2';h.tick(60);h.tick(10);
  assert.equal(h.ticks.length,2);h.release();
});

test('returning within the last seconds never starts a ten-second clip late',()=>{
  const h=harness();h.tick(7);h.tick(6);h.tick(0);
  assert.equal(h.ticks.length,0);h.release();
});

test('background countdowns are consumed silently, including the three-second special countdown',()=>{
  const h=harness();h.context.isLiveSpecial3WordsMode=true;
  h.documentTarget.hidden=true;h.documentTarget.visibilityState='hidden';h.tick(10);h.tick(3);
  assert.equal(h.ticks.length,0);assert.equal(h.shortTicks.length,0);
  h.documentTarget.hidden=false;h.documentTarget.visibilityState='visible';h.tick(2);h.tick(0);
  assert.equal(h.ticks.length,0);assert.equal(h.shortTicks.length,0);h.release();
});

test('stopped clock snapshots cannot sound while the playing phase is catching up',()=>{
  const h=harness();h.store.patch({running:false,remainingSeconds:3});
  assert.equal(h.ticks.length,0);assert.equal(h.shortTicks.length,0);h.release();
});

test('the special countdown keeps its normal cue and never queues a late replay',()=>{
  const h=harness();h.context.isLiveSpecial3WordsMode=true;h.tick(3);h.tick(2);
  assert.equal(h.shortTicks.length,1);assert.equal(h.shortTicks[0][1].allowQueue,false);h.release();
});
