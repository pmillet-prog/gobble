import test from "node:test";
import assert from "node:assert/strict";
import hairModule from "../../src/features/avatar/renderer/lot_005_renderer.js";
import headwearModule from "../../src/features/avatar/renderer/lot_007_renderer.js";
import { createImageBounds, transformImageBounds } from "../../src/features/avatar/renderer/canvasBounds.js";
import fitting from "../../src/features/avatar/renderer/hair-fitting.js";
import { normalizeAvatar } from "../../shared/avatarConfiguration.js";
import { createNativeAvatarRenderer, createCanvas, loadImage, avatarCatalog, avatarAssetRoot } from "./helpers/avatarCanvasHarness.js";
import { fileURLToPath } from "node:url";

const image = (x, y, w, h) => {
  const canvas = createCanvas(1024,1024),ctx=canvas.getContext("2d");
  ctx.fillStyle="#fff";ctx.fillRect(x,y,w,h);return canvas;
};
const alpha = (canvas,x,y) => canvas.getContext("2d").getImageData(x,y,1,1).data[3];

test("hair fitting retains negative coordinates, anatomical masks and hat masking", () => {
  for (const anatomical of [false,true]) {
    const part={id:"test",fitting:{...fitting.defaults(),dy:-100},
      ...(anatomical?{layer_partition:{method:"lower_head_occlusion"}}:{})};
    const assets={hair_test:image(400,30,200,200),hair_test_back:image(500,30,100,200),
      hair_test_lower_head_femme:image(500,0,524,1024)};
    const hair=hairModule.create(createCanvas,{parts:[part]});
    const state={hair:"test",base:"femme",headwear:"hat"};
    const paint=(draw)=>{const canvas=createCanvas(1024,1280);const ctx=canvas.getContext("2d");ctx.translate(0,128);draw(ctx);return canvas;};
    const front=paint(ctx=>hair.draw(ctx,assets,state,"front"));
    const back=paint(ctx=>hair.draw(ctx,assets,state,"back"));
    assert.equal(alpha(front,450,68),255,"front tuft at y=-60 survives");
    assert.equal(alpha(back,550,68),anatomical?0:255,"anatomical mask stays in head coordinates");
    if(anatomical) assert.equal(alpha(front,550,68),255);
    const hat={id:"hat",anchor:{x:512,y:120},attachment:{x:512,y:120},
      fitting:{...fitting.defaults(),strokes:[{mask:"hide",erase:false,size:20,points:[[450,-60]]}]}};
    const headwear=headwearModule.create(createCanvas,{parts:[hat]});
    const masked=paint(ctx=>headwear.drawHair(ctx,assets,state,hair,"front"));
    assert.equal(alpha(masked,450,68),0,"hat eraser works above the authoring frame");
    assert.equal(alpha(masked,470,68),255,"hat pass preserves neighbouring overflow");
    const all=paint(ctx=>headwear.drawHair(ctx,assets,{...state,headwearHair:"all"},hair,"front"));
    assert.equal(alpha(all,450,68),255);
    const hidden=paint(ctx=>headwear.drawHair(ctx,assets,{...state,headwearHair:"hide"},hair,"front"));
    assert.equal(alpha(hidden,450,68),0);
    assets.headwear_hat_hair_keep=image(0,0,1024,1024);
    const under=paint(ctx=>headwear.drawHair(ctx,assets,{...state,headwearHair:"under"},hair,"front"));
    assert.equal(alpha(under,470,68),0,"under-hat mask still intentionally removes hair outside its kept area");
  }
});

test("six affected hairstyles keep their full height in portraits and face thumbnails, including allowed adjustments", async () => {
  const {renderer,restore}=await createNativeAvatarRenderer();
  const measure=createImageBounds(createCanvas);
  try {
    for(const id of ["spikes","gobble_f10","gobble_f09","gobble_f04","bun","gobble_f06"]){
      const part=avatarCatalog.families.hair.find(p=>p.id===id);
      const source=await loadImage(fileURLToPath(new URL(part.file,avatarAssetRoot)));
      for(const base of ["homme","femme"]) {
        const saved=normalizeAvatar({base,hair:id,hairScale:base==="femme"?1.05:1,hairDy:base==="femme"?-15:0},avatarCatalog);
        const before=JSON.stringify(saved),result=await renderer.prepare(saved,{transparent:true});
        const hairBounds=transformImageBounds(measure(source),fitting.placement(part,saved));
        for(const view of ["portrait","face"]){
          const canvas=createCanvas(320,320);result.draw(canvas,view);
          const b=measure(canvas),v=canvas.gobbleViewport;
          const expected=v.oy+(hairBounds.top-v.crop[1])*v.ratio;
          assert.ok(Math.abs(b.top-expected)<=2,`${id}/${base}/${view}: top ${b.top}, expected ${expected}`);
          assert.ok(b.top>0,`${id}/${view}: camera leaves room above hair`);
          canvas.width=canvas.height=0;
        }
        assert.equal(JSON.stringify(saved),before);
      }
    }
  } finally {restore();}
});
