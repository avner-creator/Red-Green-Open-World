import { ECON_CSS } from './cssEcon';

/** All UI CSS, injected once. Sizes use --u (about 1vmin, clamped) so 640x360 up to 4K work. */
export const UI_CSS = `
.rg{--u:clamp(5px,1vmin,22px);--y:#ffd93b;--ink:#0a0d1a;--panel:#10142a;--panel2:#1c2240;--out:#000;
  font:800 calc(var(--u)*2.6)/1.1 ui-rounded,"Nunito","Trebuchet MS","Segoe UI",system-ui,sans-serif;color:#fff;
  -webkit-font-smoothing:antialiased;user-select:none;-webkit-user-select:none}
.rg *{box-sizing:border-box}
.rg .ic{display:inline-block;width:1em;height:1em;flex:none;vertical-align:middle;color:#fff}
.rg .ic svg{width:100%;height:100%;overflow:visible;fill:currentColor;stroke:var(--out);stroke-width:1.9;stroke-linejoin:round;stroke-linecap:round;paint-order:stroke fill}
.rg .ic .k{fill:var(--out);stroke:none}
.rg .ic .l{fill:none;stroke:var(--out);stroke-width:1.3}
.rg .ic .o{fill:none;stroke:var(--out);stroke-width:5.4}
.rg .ic .w{fill:none;stroke:currentColor;stroke-width:2.6;paint-order:normal}
.rg .ic.y{color:var(--y)}
.rg .t{-webkit-text-stroke:calc(var(--u)*.7) #000;paint-order:stroke fill;text-shadow:0 calc(var(--u)*.3) 0 #000}
.rg .screen{position:absolute;inset:0;display:none;align-items:center;justify-content:center;pointer-events:none}
.rg .screen.on{display:flex}
.rg .dim{background:radial-gradient(ellipse at center,rgba(6,8,20,.55),rgba(6,8,20,.82));pointer-events:auto}
.rg .shade{background:linear-gradient(180deg,rgba(6,8,20,.72) 0,rgba(6,8,20,.0) 38%,rgba(6,8,20,0) 55%,rgba(6,8,20,.78) 100%)}

/* buttons */
.rg .b{pointer-events:auto;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:calc(var(--u)*1.2);
  min-width:max(56px,calc(var(--u)*8));min-height:max(56px,calc(var(--u)*8));padding:0 calc(var(--u)*2.4);
  font:inherit;color:#15110a;--out:#fff;background:linear-gradient(180deg,#ffe97a,var(--y) 55%,#f2b400);
  border:calc(var(--u)*.6) solid #000;border-radius:calc(var(--u)*2.4);
  box-shadow:0 0 0 calc(var(--u)*.45) #fff,0 calc(var(--u)*1.1) 0 calc(var(--u)*.45) #000,inset 0 calc(var(--u)*.4) 0 rgba(255,255,255,.7);
  transition:transform .12s,filter .12s;position:relative;-webkit-tap-highlight-color:transparent}
.rg .b .ic{color:#15110a;font-size:1.4em}
.rg .b:hover{transform:translateY(calc(var(--u)*-.3)) scale(1.03);filter:brightness(1.07)}
.rg .b:active{transform:translateY(calc(var(--u)*.4)) scale(.97)}
.rg .b.d{background:linear-gradient(180deg,#2a3258,#171c38);color:#fff;--out:#000;
  box-shadow:0 0 0 calc(var(--u)*.45) #fff,0 calc(var(--u)*1.1) 0 calc(var(--u)*.45) #000,inset 0 calc(var(--u)*.3) 0 rgba(255,255,255,.25)}
.rg .b.d .ic{color:#fff}
.rg .b.sm{min-width:max(56px,calc(var(--u)*7));min-height:max(56px,calc(var(--u)*7));font-size:.85em}
.rg .b .chk{position:absolute;right:calc(var(--u)*-1.2);top:calc(var(--u)*-1.4);width:calc(var(--u)*3.4);height:calc(var(--u)*3.4);display:none;
  background:#fff;border:calc(var(--u)*.45) solid #000;border-radius:50%;padding:calc(var(--u)*.2)}
.rg .b .chk .ic{color:#000;width:100%;height:100%;--out:#fff}
.rg .b[aria-pressed="true"] .chk{display:block}
.rg .b.d[aria-pressed="true"]{background:linear-gradient(180deg,#ffe97a,var(--y) 55%,#f2b400);color:#15110a}
.rg .b.d[aria-pressed="true"] .ic{color:#15110a;--out:#fff}
.rg.nav-kb .b:focus,.rg.nav-kb input:focus{outline:calc(var(--u)*.9) solid #fff;outline-offset:calc(var(--u)*.7);
  box-shadow:0 0 0 calc(var(--u)*1.7) #000,0 0 calc(var(--u)*3) calc(var(--u)*1.2) rgba(255,217,59,.9);transform:scale(1.06);animation:rg-focus .9s ease-in-out infinite alternate}
.rg .b:focus-visible{outline:calc(var(--u)*.9) solid #fff;outline-offset:calc(var(--u)*.7)}
@keyframes rg-focus{to{outline-offset:calc(var(--u)*1.1)}}

/* ---------- title ---------- */
.rg .title{flex-direction:column;justify-content:space-between;padding:calc(var(--u)*3) calc(var(--u)*4)}
.rg .logo{margin-top:calc(var(--u)*1);text-align:center;line-height:.88;transform:rotate(-2deg);animation:rg-float 4s ease-in-out infinite}
.rg .logo .l1{display:block;font-size:calc(var(--u)*13);font-weight:1000;letter-spacing:.02em;color:#fff;
  -webkit-text-stroke:calc(var(--u)*1.3) #000;paint-order:stroke fill;
  text-shadow:calc(var(--u)*-.8) 0 0 rgba(255,255,255,.55),calc(var(--u)*.8) 0 0 rgba(255,217,59,.8),0 calc(var(--u)*1.2) 0 #000,0 calc(var(--u)*1.8) calc(var(--u)*2) rgba(0,0,0,.6)}
.rg .logo .l2{display:inline-flex;align-items:center;gap:calc(var(--u)*1.2);margin-top:calc(var(--u)*.6);font-size:calc(var(--u)*5.4);font-weight:1000;letter-spacing:.2em;color:var(--y);
  -webkit-text-stroke:calc(var(--u)*.9) #000;paint-order:stroke fill;text-shadow:0 calc(var(--u)*.8) 0 #000}
.rg .logo .l2 .ic{font-size:1.1em;animation:rg-spin 3s ease-in-out infinite alternate}
.rg .center{display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*2)}
.rg .play{pointer-events:auto;min-height:calc(var(--u)*17);padding:0 calc(var(--u)*7);font-size:calc(var(--u)*7);border-radius:calc(var(--u)*5);gap:calc(var(--u)*2.4);letter-spacing:.05em;isolation:isolate}
.rg .play .ic{font-size:1.1em;animation:rg-bob 1.8s ease-in-out infinite}
.rg .play .glow{position:absolute;inset:calc(var(--u)*-1.4);border-radius:calc(var(--u)*6);pointer-events:none;z-index:-1;background:none;box-shadow:0 0 calc(var(--u)*4) calc(var(--u)*.8) rgba(255,217,59,.8);animation:rg-glowp 1.8s ease-in-out infinite}
.rg .play:hover{transform:none;filter:brightness(1.1)}
.rg .play:active{transform:none;filter:brightness(.95)}
.rg .play:hover .ic{transform:scale(1.15)}
/* title layout: logo top, hero (3D) in the middle with Pip left and the change-hero arrows right, PLAY + tiles at the bottom */
.rg .tscreen{padding:calc(var(--u)*2.4) calc(var(--u)*3) calc(var(--u)*3)}
.rg .tscreen .ttop{display:flex;justify-content:center;width:100%;pointer-events:none}
.rg .tscreen .logo .l1{font-size:calc(var(--u)*9)}
.rg .tscreen .logo .l2{font-size:calc(var(--u)*3.8)}
.rg .tstage{position:absolute;left:34%;right:34%;top:22%;bottom:30%;pointer-events:auto;cursor:pointer}
.rg .tmid{position:relative;flex:1;width:100%;display:flex;align-items:center;justify-content:center;pointer-events:none}
.rg .tmid .tgap{width:max(30vw,calc(var(--u)*30))}
.rg .herobtn{flex-direction:row;gap:calc(var(--u)*.8);padding:calc(var(--u)*.6) calc(var(--u)*1);min-height:calc(var(--u)*12);border-radius:calc(var(--u)*6)}
.rg .herobtn .ar{font-size:calc(var(--u)*5);color:var(--y);--out:#000;animation:rg-nudge 1.4s ease-in-out infinite}
.rg .herobtn .ar:first-child{animation-name:rg-nudgel}
.rg .herobtn .hmid{display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*.4)}
.rg .herobtn .hs .sk{font-size:calc(var(--u)*6.4)}
.rg .herobtn .hn{font-size:calc(var(--u)*3.2);letter-spacing:.06em}
@keyframes rg-nudge{50%{transform:translateX(calc(var(--u)*.7))}}
@keyframes rg-nudgel{50%{transform:translateX(calc(var(--u)*-.7))}}
.rg .tpip{position:relative;width:calc(var(--u)*16);height:calc(var(--u)*14);pointer-events:none}
.rg .tpip .pface{position:absolute;left:0;bottom:0;width:calc(var(--u)*12);height:calc(var(--u)*12);border-radius:50%;display:flex;align-items:center;justify-content:center;
  background:linear-gradient(180deg,#2a3258,#171c38);border:calc(var(--u)*.6) solid #fff;box-shadow:0 0 0 calc(var(--u)*.45) #000;animation:rg-pipbob 2.4s ease-in-out infinite}
.rg .tpip .pface .ic{font-size:calc(var(--u)*9);color:#fff}
.rg .tpip .ppaw{position:absolute;left:calc(var(--u)*9.4);bottom:calc(var(--u)*7.6);transform-origin:20% 90%;animation:rg-wave 1.1s ease-in-out infinite}
.rg .tpip .ppaw .ic{font-size:calc(var(--u)*4.6);color:#fff}
.rg .tpip .pbub{position:absolute;left:calc(var(--u)*12.4);bottom:calc(var(--u)*10);display:flex;gap:calc(var(--u)*.4);align-items:center;padding:calc(var(--u)*.6) calc(var(--u)*1.2);border-radius:calc(var(--u)*3);
  background:#fff;border:calc(var(--u)*.5) solid #000;font-size:calc(var(--u)*3.6);animation:rg-pipbub 2.4s ease-in-out infinite}
.rg .tpip .pbub .ic{color:#15110a;--out:#fff}
.rg .tpip .pbub .ic.y{color:var(--y);--out:#000}
@keyframes rg-pipbob{50%{transform:translateY(calc(var(--u)*-.8)) rotate(-4deg)}}
@keyframes rg-wave{0%,100%{transform:rotate(-18deg)}50%{transform:rotate(22deg)}}
@keyframes rg-pipbub{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
.rg .tbot{display:grid;grid-template-columns:1fr auto 1fr;align-items:end;gap:calc(var(--u)*2);width:100%}
.rg .tbot .play{min-height:calc(var(--u)*16);padding:0 calc(var(--u)*6)}
.rg .tside{display:flex;gap:calc(var(--u)*1.6);align-items:end}
.rg .tside.r{justify-content:flex-end}
.rg .ttile{flex-direction:column;gap:calc(var(--u)*.4);min-width:calc(var(--u)*13);min-height:calc(var(--u)*12);padding:calc(var(--u)*.8) calc(var(--u)*1.4)}
.rg .ttile .pics{display:flex;align-items:center;gap:calc(var(--u)*.6)}
.rg .ttile .pics .ic{font-size:calc(var(--u)*5)}
.rg .ttile .pics .cap,.rg .ttile .pics .gp{font-size:calc(var(--u)*2.6)}
.rg .ttile .lbl{font-size:calc(var(--u)*2.3);letter-spacing:.04em}
@media (max-aspect-ratio:4/3){.rg .tmid .tgap{width:calc(var(--u)*16)}}
.rg .corner{position:absolute;bottom:calc(var(--u)*3)}
.rg .corner.l{left:calc(var(--u)*3)}
.rg .corner.r{right:calc(var(--u)*3)}
@keyframes rg-float{50%{transform:rotate(-2deg) translateY(calc(var(--u)*-.8))}}
@keyframes rg-spin{from{transform:rotate(-12deg) scale(1)}to{transform:rotate(12deg) scale(1.12)}}
@keyframes rg-bob{50%{transform:scale(1.18) rotate(-6deg)}}
@keyframes rg-glowp{0%,100%{opacity:.25;transform:scale(1)}50%{opacity:1;transform:scale(1.04)}}

/* ---------- panels ---------- */
.rg .panel{pointer-events:auto;background:linear-gradient(180deg,#171c3a,var(--panel));border:calc(var(--u)*.8) solid #fff;border-radius:calc(var(--u)*3);
  box-shadow:0 0 0 calc(var(--u)*.7) #000,0 calc(var(--u)*2) calc(var(--u)*5) rgba(0,0,0,.6),inset 0 calc(var(--u)*.4) 0 #ffffff30,inset 0 calc(var(--u)*-2) calc(var(--u)*4) #00000050;padding:calc(var(--u)*3);animation:rg-in .28s cubic-bezier(.2,1.4,.4,1)}
@keyframes rg-in{from{transform:scale(.88) translateY(calc(var(--u)*2));opacity:0}}
.rg .head{display:flex;align-items:center;justify-content:center;gap:calc(var(--u)*1.6);font-size:calc(var(--u)*4.2);margin-bottom:calc(var(--u)*2.2)}
.rg .head .ic{font-size:1.3em}
.rg .grid2{display:grid;grid-template-columns:repeat(2,1fr);gap:calc(var(--u)*2.4)}
.rg .tile{flex-direction:column;min-width:calc(var(--u)*20);min-height:calc(var(--u)*16);gap:calc(var(--u)*.8);font-size:calc(var(--u)*2.8)}
.rg .tile .ic{font-size:calc(var(--u)*7)}
.rg .tile .pair{display:flex;gap:calc(var(--u)*.6);align-items:center}
.rg .pausep{min-width:calc(var(--u)*52)}
.rg .pausep .tile.main{grid-column:1/3;min-height:calc(var(--u)*17)}
.rg .pausep{position:relative}
.rg .pause-what{position:absolute;right:calc(var(--u)*1.6);top:calc(var(--u)*1.6);min-width:max(44px,calc(var(--u)*8));min-height:max(44px,calc(var(--u)*8));padding:0 calc(var(--u)*1);gap:calc(var(--u)*.4);border-radius:calc(var(--u)*4)}
.rg .pause-what .ic{font-size:calc(var(--u)*4)}
.rg .pausep .hudlegend{display:none}
.rg .pausep.legend .grid3{display:none}
.rg .pausep.legend .hudlegend{display:grid;grid-template-columns:repeat(2,auto);gap:calc(var(--u)*1.2) calc(var(--u)*2.4);justify-content:center}
.rg .hudlegend .xline{display:flex;align-items:center;gap:calc(var(--u)*1.2)}
.rg .hudlegend .xchip{display:flex;align-items:center;justify-content:center;width:calc(var(--u)*7);height:calc(var(--u)*7);border-radius:50%;background:#1d2346;border:calc(var(--u)*.45) solid #fff;box-shadow:0 0 0 calc(var(--u)*.35) #000;font-size:calc(var(--u)*4.4)}
.rg .hudlegend .xchip .ic{color:var(--y);--out:#000}
.rg .hudlegend .xcard{display:flex;flex-direction:column;gap:calc(var(--u)*.5);padding:calc(var(--u)*.8) calc(var(--u)*1.4);border-radius:calc(var(--u)*2);background:#fff;color:#15110a;border:calc(var(--u)*.45) solid #000}
.rg .hudlegend .xrow{font-size:calc(var(--u)*3.6)}
.rg .hudlegend .xrow .xt{color:#15110a}

/* ---------- HUD ---------- */
.rg .hud{--u:clamp(6.4px,1.05vmin,24px);position:absolute;inset:0;display:none;pointer-events:none}
.rg .hud.on{display:block}
.rg .pill{position:absolute;display:flex;align-items:center;gap:calc(var(--u)*1.2);padding:calc(var(--u)*.8) calc(var(--u)*2.4) calc(var(--u)*.8) calc(var(--u)*1.2);
  background:linear-gradient(180deg,#1d2346e6,#0b0f22e6);border:calc(var(--u)*.6) solid #fff;border-radius:calc(var(--u)*4);
  box-shadow:0 0 0 calc(var(--u)*.45) #000,0 calc(var(--u)*.8) calc(var(--u)*2) rgba(0,0,0,.5);font-size:calc(var(--u)*4);font-variant-numeric:tabular-nums;backdrop-filter:blur(calc(var(--u)*.6))}
.rg .pill .ic{font-size:1.5em;color:var(--y)}
.rg .pill.gems{left:calc(var(--u)*2.4);top:calc(var(--u)*2.4)}
.rg .pill.stars{left:calc(var(--u)*2.4);top:calc(var(--u)*11.6);font-size:calc(var(--u)*3.6)}
.rg .pill.gems.pop,.rg .pill.stars.pop{animation:rg-pop .5s cubic-bezier(.2,1.6,.4,1)}
.rg .pill.gems.near{animation:rg-near 1.2s ease-out}
@keyframes rg-pop{0%{transform:scale(1)}35%{transform:scale(1.28) rotate(-3deg)}100%{transform:scale(1)}}
@keyframes rg-near{0%,100%{filter:none}30%{filter:brightness(1.7) drop-shadow(0 0 calc(var(--u)*1.5) #ffd93b)}}
.rg .glow{position:absolute;inset:0;pointer-events:none;opacity:0;box-shadow:inset 0 0 calc(var(--u)*14) calc(var(--u)*1) rgba(255,236,150,.55)}
.rg .glow.on{animation:rg-glow 1.4s ease-out}
@keyframes rg-glow{0%{opacity:0}25%{opacity:1}100%{opacity:0}}
.rg .timer{position:absolute;right:calc(var(--u)*2.4);top:calc(var(--u)*2.4);display:flex;align-items:center;gap:calc(var(--u)*1.2);
  padding:calc(var(--u)*.6) calc(var(--u)*2.4) calc(var(--u)*.6) calc(var(--u)*.6);background:linear-gradient(180deg,#1d2346e6,#0b0f22e6);border:calc(var(--u)*.6) solid #fff;border-radius:calc(var(--u)*6);
  box-shadow:0 0 0 calc(var(--u)*.45) #000,0 calc(var(--u)*.8) calc(var(--u)*2) rgba(0,0,0,.5)}
.rg .timer .ring{position:relative;width:calc(var(--u)*8);height:calc(var(--u)*8)}
.rg .timer .ring svg{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg)}
.rg .timer .ring .ic{position:absolute;inset:22%;width:56%;height:56%;color:var(--y)}
.rg .timer .txt{font-size:calc(var(--u)*4.2);font-variant-numeric:tabular-nums;min-width:3.3ch;text-align:left}
.rg .timer.low{animation:rg-lowpulse 1.6s ease-in-out infinite}
@keyframes rg-lowpulse{50%{transform:scale(1.07)}}
.rg .prompt{position:absolute;left:50%;bottom:calc(var(--u)*17);transform:translateX(-50%) scale(.6);opacity:0;display:flex;align-items:center;gap:calc(var(--u)*1.6);
  padding:calc(var(--u)*1.2) calc(var(--u)*2.6);background:linear-gradient(180deg,#1d2346f2,#0b0f22f2);border:calc(var(--u)*.6) solid #fff;border-radius:calc(var(--u)*4);
  box-shadow:0 0 0 calc(var(--u)*.45) #000;font-size:calc(var(--u)*4.6);transition:opacity .15s,transform .2s cubic-bezier(.2,1.6,.4,1)}
.rg .prompt.on{opacity:1;transform:translateX(-50%) scale(1)}
.rg .prompt>.ic{font-size:1.4em;color:var(--y)}
.rg .toasts{position:absolute;left:50%;top:calc(var(--u)*13);transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*1.2)}
.rg .toast{display:flex;align-items:center;gap:calc(var(--u)*1.4);padding:calc(var(--u)*1) calc(var(--u)*2.8);font-size:calc(var(--u)*4);
  background:linear-gradient(180deg,#2b3360f2,#10142af2);border:calc(var(--u)*.6) solid var(--y);border-radius:calc(var(--u)*4);box-shadow:0 0 0 calc(var(--u)*.45) #000,0 calc(var(--u)*.8) calc(var(--u)*2) rgba(0,0,0,.5);
  animation:rg-toast 2.6s both}
.rg .toast .ic{font-size:1.5em;color:var(--y)}
@keyframes rg-toast{0%{transform:translateY(calc(var(--u)*-3)) scale(.6);opacity:0}10%{transform:scale(1.12);opacity:1}18%{transform:scale(1)}85%{opacity:1}100%{opacity:0;transform:translateY(calc(var(--u)*-1))}}

/* only while actually playing */
.rg:not([data-phase="playing"]) .hud,.rg:not([data-phase="playing"]) .tut{display:none}
.rg .corner{font-size:calc(var(--u)*4.4)}

/* keycaps and glyphs */
.rg .cap{display:inline-flex;align-items:center;justify-content:center;min-width:1.5em;height:1.5em;padding:0 .35em;font-size:inherit;font-weight:1000;color:#15110a;background:linear-gradient(180deg,#fff,#d9dcef);
  border:calc(var(--u)*.5) solid #000;border-radius:.3em;box-shadow:0 calc(var(--u)*.7) 0 #000,0 0 0 calc(var(--u)*.35) #fff,0 calc(var(--u)*.7) 0 calc(var(--u)*.35) #fff;margin-bottom:calc(var(--u)*.7)}
.rg .cap.wide{min-width:4.2em}
.rg .cap.press{animation:rg-key 1.1s ease-in-out infinite}
.rg .cap.d1{animation-delay:.15s}.rg .cap.d2{animation-delay:.3s}.rg .cap.d3{animation-delay:.45s}
@keyframes rg-key{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(calc(var(--u)*.7));box-shadow:0 0 0 #000,0 0 0 calc(var(--u)*.35) #fff;background:var(--y)}}
.rg .gp{display:inline-flex;align-items:center;justify-content:center;width:1.5em;height:1.5em;border-radius:50%;font-weight:1000;color:#15110a;background:linear-gradient(180deg,#fff,#d9dcef);
  border:calc(var(--u)*.5) solid #000;box-shadow:0 0 0 calc(var(--u)*.35) #fff}
.rg .gp.pill2{width:auto;padding:0 .5em;border-radius:.6em}
.rg .gp.press{animation:rg-key 1.1s ease-in-out infinite}
.rg .gp.tb{width:1.7em;height:1.7em;background:#1b2142;border-color:#fff;box-shadow:0 0 0 calc(var(--u)*.35) #000}.rg .gp.tb .ic{width:1.05em;height:1.05em}
.rg .tut{--u:clamp(3.8px,.82vmin,18px);position:absolute;left:calc(var(--u)*3);bottom:calc(var(--u)*3);display:flex;gap:calc(var(--u)*2);align-items:flex-end;padding:calc(var(--u)*1.2) calc(var(--u)*2);
  background:linear-gradient(180deg,#1d2346e6,#0b0f22e6);border:calc(var(--u)*.6) solid #fff;border-radius:calc(var(--u)*2.8);box-shadow:0 0 0 calc(var(--u)*.45) #000,0 calc(var(--u)*.8) calc(var(--u)*2) rgba(0,0,0,.5);
  font-size:min(calc(var(--u)*3),1.45vw);opacity:0;pointer-events:none;transition:opacity .6s;max-width:34vw}
.rg .tut .sk{font-size:1.25em}
.rg .tut.on{opacity:1}
.rg .tut .cap.wide{min-width:2.6em}
.rg .tgroup{display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*.8)}
.rg .tkeys{display:flex;flex-direction:column;align-items:center}
.rg .tkeys .row{display:flex;gap:calc(var(--u)*.4)}
.rg .tgroup>.ic{font-size:1.2em;color:var(--y)}
.rg .tgroup .mouse{animation:rg-look 2s ease-in-out infinite}
@keyframes rg-look{25%{transform:translateX(calc(var(--u)*-1))}75%{transform:translateX(calc(var(--u)*1))}}

/* ---------- gate and settings ---------- */
.rg .gate{display:flex;gap:calc(var(--u)*4);align-items:center;max-width:94vw}
.rg .or{font-size:calc(var(--u)*3);opacity:.9}
.rg .hold{flex-direction:column;width:calc(var(--u)*22);height:calc(var(--u)*22);border-radius:50%;padding:0;position:relative}
.rg .hold .ring{position:absolute;inset:calc(var(--u)*-2.2);width:calc(100% + var(--u)*4.4);height:calc(100% + var(--u)*4.4);transform:rotate(-90deg);pointer-events:none}
.rg .hold .ic{font-size:calc(var(--u)*7)}
.rg .hold .row{display:flex;align-items:center;gap:calc(var(--u)*.6)}
.rg .hold .hint{display:flex;align-items:center;gap:calc(var(--u)*.6);font-size:calc(var(--u)*3)}
.rg .quiz{display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*1.8)}
.rg .quiz .q{font-size:calc(var(--u)*6);font-variant-numeric:tabular-nums}
.rg .quiz .opts{display:grid;grid-template-columns:repeat(2,1fr);gap:calc(var(--u)*1.6)}
.rg .quiz .b{font-size:calc(var(--u)*4.4);min-width:calc(var(--u)*11)}
.rg .shake{animation:rg-shake .4s}
@keyframes rg-shake{20%{transform:translateX(calc(var(--u)*-1.2))}40%{transform:translateX(calc(var(--u)*1.2))}60%{transform:translateX(calc(var(--u)*-.8))}80%{transform:translateX(calc(var(--u)*.8))}}
.rg .settings{--u:clamp(4.2px,1vmin,20px);width:min(96vw,calc(var(--u)*118));max-height:96vh;display:flex;flex-direction:column;padding:calc(var(--u)*1.6) calc(var(--u)*2);font-size:calc(var(--u)*2.8)}
.rg .settings .bar{display:flex;align-items:center;justify-content:space-between;gap:calc(var(--u)*2);margin-bottom:calc(var(--u)*1.4)}
.rg .settings .bar .head{margin:0;font-size:calc(var(--u)*3.8)}
.rg .settings .b{min-height:max(44px,calc(var(--u)*6.4));min-width:max(44px,calc(var(--u)*6.4))}
.rg .tabs{display:flex;gap:calc(var(--u)*1.4)}
.rg .tab{font-size:calc(var(--u)*3);min-width:max(44px,calc(var(--u)*14))!important}
.rg .tab[aria-selected="true"]{background:linear-gradient(180deg,#ffe97a,var(--y) 55%,#f2b400);color:#15110a}
.rg .tab[aria-selected="true"] .ic{color:#15110a;--out:#fff}
.rg .panes .pane{display:none}
.rg .panes .pane.on{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:calc(var(--u)*1.6);animation:rg-in .22s ease-out}
.rg .scroll{overflow-y:auto;overflow-x:hidden;padding:calc(var(--u)*1.2);margin:calc(var(--u)*-1.2);scrollbar-width:thin;scrollbar-color:#fff #0b0f22;display:flex;flex-direction:column;gap:calc(var(--u)*2)}
.rg .srow{display:flex;flex-direction:column;align-items:stretch;justify-content:center;gap:calc(var(--u)*.8);background:linear-gradient(180deg,#ffffff1c,#ffffff0d);border:calc(var(--u)*.3) solid #ffffff40;
  box-shadow:inset 0 calc(var(--u)*.3) 0 #ffffff26;border-radius:calc(var(--u)*2);padding:calc(var(--u)*1.2) calc(var(--u)*1.6) calc(var(--u)*1.8)}
.rg .srow>.lab{display:flex;align-items:center;gap:calc(var(--u)*1.2);font-size:calc(var(--u)*2.9)}
.rg .srow>.lab .ic{font-size:1.5em;color:var(--y)}
.rg .srow .sub{font-size:.62em;opacity:.8;font-weight:700}
.rg .choices{display:flex;gap:calc(var(--u)*1.6);flex-wrap:wrap}
.rg .choices .b{flex:1 1 0}
.rg .swatch{width:1.8em;height:1.8em;border-radius:50%;border:calc(var(--u)*.5) solid #000;box-shadow:0 0 0 calc(var(--u)*.35) #fff;display:inline-flex;align-items:center;justify-content:center;font-size:.9em;color:#000;font-weight:1000}
.rg .sl{display:flex;align-items:center;gap:calc(var(--u)*1.4)}
.rg .sl .val{min-width:4ch;text-align:right;font-size:calc(var(--u)*2.9);font-variant-numeric:tabular-nums}
.rg input[type=range]{pointer-events:auto;-webkit-appearance:none;appearance:none;flex:1;min-width:0;height:max(36px,calc(var(--u)*5));background:transparent;cursor:pointer;margin:0}
.rg input[type=range]::-webkit-slider-runnable-track{height:calc(var(--u)*2);border-radius:calc(var(--u)*1.2);border:calc(var(--u)*.5) solid #fff;box-shadow:0 0 0 calc(var(--u)*.35) #000;
  background:linear-gradient(90deg,var(--y) var(--p,50%),#20274a var(--p,50%))}
.rg input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:calc(var(--u)*4.2);height:calc(var(--u)*4.2);margin-top:calc(var(--u)*-1.5);border-radius:50%;background:linear-gradient(180deg,#fff,#d9dcef);border:calc(var(--u)*.7) solid #000;box-shadow:0 0 0 calc(var(--u)*.4) var(--y),0 calc(var(--u)*.5) calc(var(--u)*1) rgba(0,0,0,.5)}
.rg input[type=range]::-moz-range-track{height:calc(var(--u)*2);border-radius:calc(var(--u)*1.2);border:calc(var(--u)*.5) solid #fff;background:linear-gradient(90deg,var(--y) var(--p,50%),#20274a var(--p,50%))}
.rg input[type=range]::-moz-range-thumb{width:calc(var(--u)*4.2);height:calc(var(--u)*4.2);border-radius:50%;background:#fff;border:calc(var(--u)*.7) solid #000}
.rg .fine{text-align:center;font-size:calc(var(--u)*2.2);font-weight:700;opacity:.8;padding:calc(var(--u)*.6)}

/* ---------- end screen ---------- */
.rg .endp{width:min(94vw,calc(var(--u)*100));max-height:94vh;display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*1.8);position:relative;overflow:hidden}
.rg .endp{--u:clamp(4.2px,1vmin,22px)}
.rg .endp .burst{display:flex;align-items:center;gap:calc(var(--u)*1.6);font-size:calc(var(--u)*5.2)}
.rg .endp .burst>.ic{font-size:1.2em;color:var(--y);animation:rg-spin 2s ease-in-out infinite alternate}
.rg .hstar{display:inline-flex;font-size:1.9em}
.rg .hstar .ic{font-size:1em;color:var(--y)}
.rg .hstar.earned{animation:rg-stick .6s cubic-bezier(.2,1.6,.4,1) both;animation-delay:var(--d,0s);filter:drop-shadow(0 0 calc(var(--u)*1) rgba(255,217,59,.8))}
.rg .hstar.empty .ic{color:transparent;--out:#fff;opacity:.75}
.rg .hstar.empty .ic svg{fill:none;stroke:#fff;stroke-width:2.4;stroke-dasharray:2.4 3.2;paint-order:normal}
.rg .stickers.small{gap:calc(var(--u)*1.2)}
.rg .stickers.small{flex-wrap:nowrap}
.rg .stickers.small .stk{min-width:calc(var(--u)*7.4);padding:calc(var(--u)*.7) calc(var(--u)*.6);font-size:calc(var(--u)*2.6)}
.rg .stickers.small .stk .ic{font-size:2.2em}
.rg .stickers{display:flex;flex-wrap:wrap;justify-content:center;gap:calc(var(--u)*1.8);max-width:100%}
.rg .stk{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:calc(var(--u)*.3);min-width:calc(var(--u)*13);padding:calc(var(--u)*1.2) calc(var(--u)*1.6);background:#fff;color:#15110a;
  border:calc(var(--u)*.6) solid #000;border-radius:calc(var(--u)*2.2);box-shadow:0 0 0 calc(var(--u)*.45) #fff,0 calc(var(--u)*.6) 0 calc(var(--u)*.45) #000;--out:#fff;
  font-size:calc(var(--u)*3.6);transform:rotate(var(--r,0deg));animation:rg-stick .55s cubic-bezier(.2,1.5,.4,1) both;animation-delay:var(--d,0s)}
.rg .stk .ic{font-size:2em;color:#15110a}
.rg .stk.big{min-width:calc(var(--u)*19);font-size:calc(var(--u)*5)}
.rg .stk.empty{background:#ffffff0d;color:#fff;border:calc(var(--u)*.5) dotted #fff;box-shadow:none;opacity:.8;animation:none;transform:none}
.rg .stk.empty .ic{color:#fff;--out:#000;opacity:.4}
.rg .stk.earned{background:linear-gradient(180deg,#fff,#e9ebf7)}
.rg .stk .sm{font-size:.6em;display:flex;align-items:center;gap:.2em}
.rg .stk .sm .ic{font-size:1.1em}
@keyframes rg-stick{from{transform:scale(.2) rotate(calc(var(--r,0deg) - 40deg));opacity:0}}
.rg .btnrow{display:flex;gap:calc(var(--u)*3);align-items:center;margin-top:calc(var(--u)*.6)}
.rg .btnrow .play{min-height:calc(var(--u)*13);font-size:calc(var(--u)*5.4)}
.rg .confetti{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.rg .confetti i{position:absolute;top:-6%;width:calc(var(--u)*1.3);height:calc(var(--u)*2.2);border-radius:20%;background:var(--c);left:var(--x);animation:rg-fall var(--t) linear var(--dl) infinite;opacity:.95}
@keyframes rg-fall{to{transform:translateY(120vh) rotate(720deg)}}

/* ---------- credits ---------- */
.rg .credp{width:min(92vw,calc(var(--u)*80));max-height:90vh;display:flex;flex-direction:column;gap:calc(var(--u)*1.6)}
.rg .crow{display:grid;grid-template-columns:1.2fr 1.6fr auto;gap:calc(var(--u)*1.4);align-items:center;background:#ffffff14;border-radius:calc(var(--u)*1.6);padding:calc(var(--u)*1) calc(var(--u)*1.6);font-size:calc(var(--u)*2.6)}
.rg .crow .lic{background:#fff;color:#000;border-radius:calc(var(--u)*1);padding:0 calc(var(--u)*1);font-size:.85em}
.rg .crow .by{opacity:.85;font-weight:700}

/* Short screens (phones in landscape, 640x360): only the newest toast, so the stack never reaches the prompt. */
@media (max-height:480px){.rg .toasts .toast:not(:last-child){display:none}}
@media (prefers-reduced-motion:reduce){.rg *,.rg *::before,.rg *::after{animation:none!important;transition:none!important}.rg .confetti{display:none}}
`;

let injected = false;
export function injectCss(): void {
  if (injected) return;
  injected = true;
  const el = document.createElement('style');
  el.textContent = UI_CSS + ECON_CSS;
  document.head.appendChild(el);
}
