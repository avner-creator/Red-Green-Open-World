/**
 * Dressing room, HUD wardrobe button and title dress-up button CSS. Light-on-dark with black
 * outlines; selected/worn/trying states differ by shape and brightness (the shop card styles in
 * cssEcon.ts are reused for the tiles).
 */
export const WARDROBE_CSS = `
/* ---------- dressing room ---------- */
.rg .dress{pointer-events:auto;background:#05060f}
.rg .dress .dr-bg{position:absolute;inset:0;background:
  radial-gradient(ellipse 34% 60% at 46% 52%,rgba(255,244,190,.38),rgba(255,244,190,0) 70%),
  repeating-conic-gradient(from 0deg at 46% 110%,rgba(255,255,255,.07) 0 6deg,rgba(255,255,255,0) 6deg 14deg),
  radial-gradient(ellipse at 46% 40%,#2b2f6e,#0b0d24 70%)}
.rg .dr-room{--u:clamp(4.2px,1vmin,20px);position:relative;width:100%;height:100%;display:grid;
  grid-template-columns:auto minmax(0,1fr) minmax(0,1.05fr);grid-template-rows:auto minmax(0,1fr);
  grid-template-areas:"top top top" "tabs stage grid";gap:calc(var(--u)*1.6);padding:calc(var(--u)*2) calc(var(--u)*2.4) calc(var(--u)*2.4)}
.rg .dr-top{grid-area:top;display:flex;align-items:center;gap:calc(var(--u)*1.6)}
.rg .dr-head{display:inline-flex;align-items:center;justify-content:center;width:calc(var(--u)*10);height:calc(var(--u)*8);border-radius:calc(var(--u)*2.4);
  background:linear-gradient(180deg,#ffe97a,var(--y) 55%,#f2b400);border:calc(var(--u)*.6) solid #000;box-shadow:0 0 0 calc(var(--u)*.45) #fff}
.rg .dr-head .ic{font-size:calc(var(--u)*6.4);color:#15110a;--out:#fff}
.rg .dr-top .wallet{margin-left:auto;font-size:calc(var(--u)*4.6)}
.rg .b.dr-close{min-width:max(48px,calc(var(--u)*9))!important;min-height:max(48px,calc(var(--u)*9))!important;font-size:calc(var(--u)*3.8)}
.rg .dr-tabs{grid-area:tabs;display:flex;flex-direction:column;gap:calc(var(--u)*1.4);overflow-y:auto;overflow-x:visible;padding:calc(var(--u)*1.2)}
.rg .b.dr-tab{min-width:max(52px,calc(var(--u)*11))!important;min-height:max(48px,calc(var(--u)*9.5))!important;font-size:calc(var(--u)*4.4);padding:0}
.rg .dr-tab[aria-selected="true"]{transform:translateX(calc(var(--u)*1)) scale(1.06)}
.rg .dr-tab.fresh::after,.rg .dr-tile.fresh::after{content:'';position:absolute;right:calc(var(--u)*-.9);top:calc(var(--u)*-.9);width:calc(var(--u)*2.6);height:calc(var(--u)*2.6);
  border-radius:50%;background:#fff;border:calc(var(--u)*.5) solid #000;box-shadow:0 0 calc(var(--u)*1.4) #fff;animation:rg-newdot 1s ease-in-out infinite alternate}
.rg .dr-tile.fresh.s-equipped::after,.rg .dr-tile.fresh.s-owned::after{display:none}
@keyframes rg-newdot{to{transform:scale(1.35)}}
.rg .dr-stage{grid-area:stage;position:relative;min-height:0;display:flex;align-items:center;justify-content:center}
.rg .dr-spot{position:absolute;left:50%;bottom:4%;width:78%;height:20%;transform:translateX(-50%);border-radius:50%;
  background:radial-gradient(ellipse,rgba(255,255,255,.28),rgba(255,255,255,0) 70%);pointer-events:none}
.rg .dr-canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:grab}
.rg .dr-canvas:active{cursor:grabbing}
.rg .dr-nostage .ic{font-size:calc(var(--u)*30)}
.rg .dr-turns{position:absolute;left:0;right:0;top:44%;display:flex;justify-content:space-between;pointer-events:none}
.rg .b.dr-turn{pointer-events:auto;font-size:calc(var(--u)*4.4);padding:0;min-width:max(48px,calc(var(--u)*8.5))!important;min-height:max(48px,calc(var(--u)*8.5))!important;border-radius:50%}
.rg .dr-float{position:absolute;right:4%;top:10%;display:none}
.rg .dr-float.on{display:block}
.rg .dr-float.pop{animation:rg-cbought .6s cubic-bezier(.2,1.6,.4,1)}
.rg .dr-float .fp{display:flex;align-items:center;justify-content:center;width:calc(var(--u)*22);height:calc(var(--u)*22);border-radius:50%;
  background:radial-gradient(circle,#ffffffd0,#ffffff30 60%,#ffffff00 70%);border:calc(var(--u)*.6) solid #fff}
.rg .dr-float .fp .ic{font-size:calc(var(--u)*13)}
.rg .dr-float .fp .pic{width:90%;height:90%;object-fit:contain}
.rg .dr-float .fp .sw{position:absolute;width:calc(var(--u)*15);height:calc(var(--u)*15);border-radius:50%;background:var(--sw);border:calc(var(--u)*.6) solid #000}
.rg .dr-try{position:absolute;left:50%;bottom:calc(var(--u)*1);transform:translateX(-50%);display:none;align-items:center;gap:calc(var(--u)*1.4)}
.rg .dr-try.on{display:flex}
.rg .dr-buy{min-height:calc(var(--u)*11.5);padding:0 calc(var(--u)*4);font-size:calc(var(--u)*6.4);border-radius:calc(var(--u)*4);animation:rg-buyp 1s ease-in-out infinite alternate}
.rg .dr-buy .gemc{display:inline-flex;font-size:1em}
.rg .dr-buy .gemc .ic{color:#15110a;--out:#fff}
.rg .dr-buy .ok{font-size:1em}
@keyframes rg-buyp{to{transform:scale(1.07);box-shadow:0 0 0 calc(var(--u)*.45) #fff,0 0 calc(var(--u)*5) calc(var(--u)*1.4) rgba(255,233,122,.85)}}
.rg .dr-need{display:inline-flex;align-items:center;gap:calc(var(--u)*1);padding:calc(var(--u)*1) calc(var(--u)*2.4);border-radius:calc(var(--u)*4);
  background:#05070f;border:calc(var(--u)*.6) solid #fff;box-shadow:0 0 0 calc(var(--u)*.5) #000;font-size:calc(var(--u)*5)}
.rg .dr-need .ic{font-size:1em}
.rg .dr-need .lk{display:inline-flex;width:1.2em;height:1.2em;align-items:center;justify-content:center;border-radius:50%;background:#fff}
.rg .dr-need .lk .ic{color:#05070f;--out:#fff;font-size:.85em}
.rg .dr-need .bar{position:relative;width:calc(var(--u)*14);height:calc(var(--u)*2.4);border-radius:2em;border:calc(var(--u)*.45) solid #fff;background:#1a1f3a;overflow:hidden}
.rg .dr-need .bar .fill{position:absolute;left:0;top:0;bottom:0;width:var(--p);background:#fff}
.rg .dr-need .m{font-size:.8em}
.rg .dr-need.shake{animation:rg-wshake .45s}
.rg .dr-need.chest .ic{font-size:1.3em}
.rg .dr-grid{grid-area:grid;position:relative;min-height:0;overflow-y:auto;overflow-x:hidden;display:grid;align-content:start;
  grid-template-columns:repeat(auto-fill,minmax(calc(var(--u)*18.5),1fr));grid-auto-rows:calc(var(--u)*21);gap:calc(var(--u)*2.2);padding:calc(var(--u)*1.6) calc(var(--u)*1.6) calc(var(--u)*3)}
.rg .dr-tile{padding:calc(var(--u)*1)}
.rg .dr-tile .pv .ic{font-size:calc(var(--u)*9.5)}
.rg .dr-tile .pv .pic{width:100%;height:100%;object-fit:contain}
.rg .dr-tile .price{font-size:calc(var(--u)*3.2)}
.rg .dr-tile.trying{outline:calc(var(--u)*.8) dashed #fff;outline-offset:calc(var(--u)*.5)}
.rg .dr-tile .tryon{position:absolute;left:calc(var(--u)*-1.2);top:calc(var(--u)*-1.2);width:calc(var(--u)*5.2);height:calc(var(--u)*5.2);border-radius:50%;background:#fff;
  border:calc(var(--u)*.45) solid #000;display:flex;align-items:center;justify-content:center}
.rg .dr-tile .tryon .ic{font-size:calc(var(--u)*3.6);color:#000;--out:#fff}
.rg .dress .celebrate{position:absolute;inset:0}
@media (max-aspect-ratio:1/1){
  .rg .dr-room{grid-template-columns:auto minmax(0,1fr);grid-template-rows:auto minmax(0,1fr) minmax(0,1fr);grid-template-areas:"top top" "tabs stage" "tabs grid"}
}

/* ---------- HUD wardrobe button ---------- */
.rg .hud .wbtn{position:absolute;left:calc(var(--u)*2.4);top:calc(var(--u)*19);padding:0;border-radius:50%;
  width:max(56px,calc(var(--u)*11));height:max(56px,calc(var(--u)*11));min-width:0;min-height:0}
.rg .hud .wbtn .wb-ic .ic,.rg .hud .wbtn .wb-ic{font-size:calc(var(--u)*6.8);color:#15110a;--out:#fff;display:inline-flex}
.rg .hud .wbtn .wb-key{position:absolute;right:calc(var(--u)*-1.6);bottom:calc(var(--u)*-1.2);font-size:calc(var(--u)*2.4)}
.rg .hud .wbtn .wb-new{position:absolute;left:calc(var(--u)*-1.4);top:calc(var(--u)*-1.4);display:none;align-items:center;justify-content:center;
  width:calc(var(--u)*5.2);height:calc(var(--u)*5.2);border-radius:50%;background:#fff;border:calc(var(--u)*.5) solid #000;font-size:calc(var(--u)*3.6);color:#000}
.rg .hud .wbtn .wb-new .t{-webkit-text-stroke:0;text-shadow:none;color:#000}
.rg .hud .wbtn .wb-new.on{display:flex;animation:rg-newb .7s ease-in-out infinite alternate}
@keyframes rg-newb{to{transform:translateY(calc(var(--u)*-.8)) scale(1.15)}}
.rg .hud .wbtn.off{filter:grayscale(1) brightness(.55);opacity:.75}
.rg .hud .wbtn.pop{animation:rg-cbought .6s cubic-bezier(.2,1.6,.4,1)}
.rg .hud .wbtn.shake{animation:rg-wshake .45s}

/* ---------- title dress-up button ---------- */
.rg .dressbtn{flex-direction:column;gap:calc(var(--u)*.4);padding:calc(var(--u)*1) calc(var(--u)*2.2);min-width:calc(var(--u)*24);min-height:calc(var(--u)*19);border-radius:calc(var(--u)*3.4)}
.rg .dressbtn .drow{display:flex;align-items:center;gap:calc(var(--u)*1)}
.rg .dressbtn .drow>.ic{font-size:calc(var(--u)*6.6);color:#15110a;--out:#fff}
.rg .dressbtn .tease{position:relative;display:inline-flex;align-items:center;justify-content:center;width:calc(var(--u)*10);height:calc(var(--u)*10);border-radius:50%;
  background:radial-gradient(circle,#ffffff,#fff6c8 60%,#ffe97a00 72%)}
.rg .dressbtn .tease .ic{font-size:calc(var(--u)*7);color:#15110a;--out:#fff}
.rg .dressbtn .tease .pic{width:120%;height:120%;object-fit:contain}
.rg .dressbtn .tease.in{animation:rg-cbought .55s cubic-bezier(.2,1.6,.4,1)}
.rg .dressbtn .lbl{font-size:calc(var(--u)*3.6);letter-spacing:.06em}
.rg .dressbtn .free{position:absolute;right:calc(var(--u)*-1.8);top:calc(var(--u)*-1.8);display:flex;align-items:center;gap:.1em;padding:calc(var(--u)*.3) calc(var(--u)*1);
  border-radius:2em;background:#fff;border:calc(var(--u)*.5) solid #000;font-size:calc(var(--u)*2.8);color:#000;animation:rg-newb .8s ease-in-out infinite alternate}
.rg .dressbtn .free .ic{color:#000;--out:#fff}
`;
