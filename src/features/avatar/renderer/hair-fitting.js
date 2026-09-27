// Maintained runtime renderer; the workshop importer preserves this module.
import { createImageBounds, transformImageBounds, layerExtent, makeWorldCanvas } from "./canvasBounds.js";
import dependency0 from "./headwear-fitting.js";
export default (function(F){
  'use strict';
  function placement(part,state,fit=part.fitting||F.defaults()) {
    const anchor=part.anchor||{x:512,y:120};
    return {anchor,x:anchor.x+fit.dx+(state.hairDx||0),y:anchor.y+fit.dy+(state.hairDy||0),scale:fit.scale*(state.hairScale??1)};
  }
  function create(makeCanvas) {
    const partitions=new WeakMap(),cache=new Map();
    const imageBounds=createImageBounds(makeCanvas);
    const bounds=(assets,state,part,fit)=>assets['hair_'+part.id]
      ? transformImageBounds(imageBounds(assets['hair_'+part.id]),placement(part,state,fit)) : null;
    function partition(full,back) {
      if(partitions.has(back))return partitions.get(back);
      const c=makeCanvas(1024,1024),ctx=c.getContext('2d');
      ctx.drawImage(full,0,0);const source=ctx.getImageData(0,0,1024,1024).data;
      ctx.clearRect(0,0,1024,1024);ctx.drawImage(back,0,0);const pixels=ctx.getImageData(0,0,1024,1024);
      for(let i=0;i<source.length;i+=4){pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=255;pixels.data[i+3]=source[i+3]?Math.min(255,Math.round(pixels.data[i+3]*255/source[i+3])):0;}
      ctx.putImageData(pixels,0,0);partitions.set(back,c);return c;
    }
    function prepare(assets,state,part,fit,tint) {
      const key='hair_'+part.id,source=assets[key];if(!source)return null;
      const signature=JSON.stringify([part.id,fit,state.base,state.hairColor,state.hairScale,state.hairDx,state.hairDy]);
      if(cache.has(signature))return cache.get(signature);
      const t=placement(part,state,fit),extent=layerExtent(bounds(assets,state,part,fit));
      const make=()=>makeWorldCanvas(makeCanvas,extent);
      const behind=make(),hide=make(),bc=behind.getContext('2d');
      if(part.layer_partition?.method==='lower_head_occlusion') {
        const mask=assets[key+'_lower_head_'+(state.base||'femme')];if(mask)bc.drawImage(mask,0,0);
      } else if(assets[key+'_back']) F.transform(bc,t,()=>bc.drawImage(partition(source,assets[key+'_back']),0,0));
      F.transform(bc,t,()=>F.paint(bc,fit.strokes,'behind'));
      F.transform(hide.getContext('2d'),t,()=>F.paint(hide.getContext('2d'),fit.strokes,'hide'));
      const full=make(),fc=full.getContext('2d');
      F.transform(fc,t,()=>fc.drawImage(tint(key,source,assets[key+'_mask'],state.hairColor,part),0,0));
      const result={behind,hide,...extent};
      for(const layer of ['full','front','back']) {
        const c=make(),ctx=c.getContext('2d');ctx.drawImage(full,extent.left,extent.top);
        if(layer!=='full'){ctx.globalCompositeOperation=layer==='back'?'destination-in':'destination-out';ctx.drawImage(behind,extent.left,extent.top);}
        ctx.globalCompositeOperation='destination-out';ctx.drawImage(hide,extent.left,extent.top);result[layer]=c;
      }
      cache.set(signature,result);if(cache.size>4)cache.delete(cache.keys().next().value);return result;
    }
    function overlay(ctx,result) {
      if(!result)return;
      for(const [mask,color] of [[result.behind,'#00caff'],[result.hide,'#ff4e64']]) {
        const c=makeCanvas(mask.width,mask.height),cc=c.getContext('2d');cc.drawImage(mask,0,0);cc.globalCompositeOperation='source-in';cc.fillStyle=color;cc.fillRect(0,0,c.width,c.height);
        ctx.save();ctx.globalAlpha=.4;ctx.drawImage(c,result.left,result.top);ctx.restore();
      }
    }
    return {prepare,overlay,bounds};
  }
  return {...F,placement,create};
})(dependency0);
