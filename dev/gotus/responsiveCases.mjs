import assert from "node:assert/strict";
import { GOTUS_READY } from "./inputUi.mjs";

export const RESPONSIVE_PROFILES = [
  { name: "320x568", width: 320, height: 568, mobile: true },
  { name: "360x640", width: 360, height: 640, mobile: true },
  { name: "390x844", width: 390, height: 844, mobile: true },
  { name: "430x932", width: 430, height: 932, mobile: true },
  { name: "landscape-844x390", width: 844, height: 390, mobile: true },
  { name: "desktop-1280x720", width: 1280, height: 720, mobile: false },
  { name: "desktop-1366x768", width: 1366, height: 768, mobile: false },
  { name: "desktop-1920x1080", width: 1920, height: 1080, mobile: false },
];

// No guesses or audio unlocking: this pass measures the real production wrappers,
// portal branch and hit targets, including controls reached by internal scrolling.
export async function runGotusResponsiveChecks({ cdp, evaluate, capture, waitFor, delay, origin, cases, desktopOnly = false, mobileOnly = false }) {
  const failures = [];
  const check = (condition, name, detail) => { if (!condition) failures.push({ name, detail }); };
  const profiles = desktopOnly ? RESPONSIVE_PROFILES.filter(profile => !profile.mobile)
    : mobileOnly ? RESPONSIVE_PROFILES.filter(profile => profile.mobile) : RESPONSIVE_PROFILES;
  for (const profile of profiles) {
    for (const surface of ["training", "live"]) {
      const name = `${profile.name}-${surface}`;
      await cdp("Emulation.setDeviceMetricsOverride", { width: profile.width, height: profile.height, deviceScaleFactor: 1, mobile: profile.mobile });
      await cdp("Page.navigate", { url: `${origin}/dev/gotus/` });
      await waitFor(() => evaluate("!!window.gotusFixture?.responsive"), `${name} fixture`);
      await evaluate(`gotusFixture.responsive(${JSON.stringify(surface)}, ${profile.mobile})`);
      await waitFor(() => evaluate(GOTUS_READY), `${name} ready`);
      await waitFor(() => evaluate("!document.querySelector('.gotus-intro')"), `${name} intro finished`);
      await delay(100);
      await capture(`responsive-${name}-top`);
      const geometry = await evaluate(`(() => {
        const panel=document.querySelector('.gotus__playground'), board=document.querySelector('.gotus__board');
        const rect=element=>element?.getBoundingClientRect().toJSON()||null;
        const cells=[...board.querySelectorAll('[role=gridcell]')].map(cell=>rect(cell));
        return { viewport:{width:innerWidth,height:innerHeight}, bodyWidth:document.body.scrollWidth,
          panel:rect(panel),board:rect(board),cells,panelScroll:panel.scrollHeight,panelHeight:panel.clientHeight,
          gameSurface:rect(document.querySelector('.gotus-surface')),
          studio:rect(panel.querySelector('.gotus__studio')),presenter:rect(panel.querySelector('.gotus__presenter')),
          chat:rect(document.querySelector('.gotus-surface__chat')),
          headerButtons:[...panel.querySelectorAll('.gotus__header button')].map(button=>({label:button.getAttribute('aria-label')||button.textContent.trim(),rect:rect(button)})),
          liveHost:rect(document.querySelector('.fixture-live__grid-host')),liveSizing:gotusFixture.liveSizing||null,
          footerButtons:[...panel.querySelectorAll('button')].filter(button=>['Voir la solution','Rejoindre le live'].includes(button.textContent.trim())).map(button=>({text:button.textContent.trim(),rect:rect(button)})),
          images:[...panel.querySelectorAll('img')].map(image=>({src:image.getAttribute('src'),loaded:image.complete&&image.naturalWidth>0}))
        };
      })()`);
      check(geometry.cells.length === 36, `${name}: 36 cases`, geometry.cells.length);
      check(geometry.bodyWidth <= profile.width + 1, `${name}: pas de débordement horizontal`, geometry.bodyWidth);
      check(geometry.cells.every(cell => Math.abs(cell.width / cell.height - 1) <= .04), `${name}: cases carrées à 4 % près`, geometry.cells[0]);
      check(Math.abs(geometry.board.width / geometry.board.height - 1) <= .04, `${name}: grille carrée à 4 % près`, geometry.board);
      if (!profile.mobile) {
        check(geometry.presenter?.height >= 179.5, `${name}: présentateur d'au moins 180 px`, geometry.presenter);
        check(geometry.chat?.width >= 299.5 && geometry.chat.right <= profile.width && geometry.chat.bottom <= profile.height,
          `${name}: colonne chat visible d'au moins 300 px`, geometry.chat);
        check(geometry.panelScroll <= geometry.panelHeight + 1, `${name}: jeu complet sans défilement desktop`, { client: geometry.panelHeight, scroll: geometry.panelScroll });
      } else {
        check(geometry.headerButtons.every(button => button.rect.height >= 43.5), `${name}: boutons de l'en-tête hauteur 44 px`, geometry.headerButtons);
      }
      check(geometry.images.every(image => image.loaded), `${name}: images chargées`, geometry.images);
      if (surface === "training") {
        for (const text of ["Voir la solution", "Rejoindre le live"]) {
          const button = geometry.footerButtons.find(item => item.text === text);
          check(button && button.rect.height >= 43.5, `${name}: ${text} hauteur 44 px`, button || null);
        }
      }
      {
        const rect = geometry.gameSurface;
        check(rect && rect.left >= -1 && rect.top >= -1 && rect.right <= profile.width + 1 && rect.bottom <= profile.height + 1,
          `${name}: surface dans le viewport`, rect);
      }
      const controls = await evaluate(`(async () => {
        const controls=[...document.querySelectorAll('.gotus__playground button:not(:disabled),.gotus__playground input:not(:disabled)')];
        const results=[];
        for (const element of controls) {
          element.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
          await new Promise(resolve=>requestAnimationFrame(resolve));
          const rect=element.getBoundingClientRect(), hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
          results.push({text:element.getAttribute('aria-label')||element.textContent.trim()||element.type,
            rect:rect.toJSON(),reachable:rect.x+rect.width/2>=0&&rect.x+rect.width/2<=innerWidth&&rect.y+rect.height/2>=0&&rect.y+rect.height/2<=innerHeight&&(hit===element||element.contains(hit))});
        }
        return results;
      })()`);
      check(controls.length >= 30 && controls.every(control => control.reachable), `${name}: tous les contrôles accessibles après défilement`, controls.filter(control => !control.reachable));
      await capture(`responsive-${name}-controls`);
      cases.push({ responsive: name, geometry, controls });
    }
  }
  assert.deepEqual(failures, [], JSON.stringify(failures, null, 2));
}
