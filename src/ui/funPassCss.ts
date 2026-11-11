/** Fun Pass CSS: HUD chip, stamp pops, the card overlay and the end-screen card. Brightness cues only. */
const CSS = `
.rg .passwrap{position:absolute;z-index:4;right:calc(var(--u)*10.6);top:calc(var(--u)*13.4)}
.rg .passchip{pointer-events:auto;cursor:pointer;display:flex;align-items:center;gap:calc(var(--u)*.9);padding:calc(var(--u)*.5) calc(var(--u)*1.4) calc(var(--u)*.5) calc(var(--u)*.6);
  font:inherit;font-size:calc(var(--u)*3.4);color:#fff;background:linear-gradient(180deg,#1d2346e6,#0b0f22e6);border:calc(var(--u)*.6) solid #fff;border-radius:calc(var(--u)*3);
  box-shadow:0 0 0 calc(var(--u)*.45) #000,0 calc(var(--u)*.8) calc(var(--u)*2) rgba(0,0,0,.5);-webkit-tap-highlight-color:transparent}
.rg .passchip:hover{filter:brightness(1.15)}
.rg .passchip[aria-pressed="true"]{background:linear-gradient(180deg,#3a4480,#1c2246)}
.rg .passchip .pi{display:flex;align-items:center;justify-content:center;width:calc(var(--u)*6);height:calc(var(--u)*6);border-radius:calc(var(--u)*1.4);background:linear-gradient(180deg,#ffe97a,var(--y));border:calc(var(--u)*.4) solid #000}
.rg .passchip .pi .ic{font-size:calc(var(--u)*4.6);color:#fff;--out:#000}
.rg .passchip .n{font-size:1.15em;min-width:1.2ch;text-align:center;font-variant-numeric:tabular-nums}
.rg .passchip .nx{display:flex;align-items:center;gap:calc(var(--u)*.5);padding-left:calc(var(--u)*.9);border-left:calc(var(--u)*.4) solid #ffffff55;font-size:.8em;font-variant-numeric:tabular-nums}
.rg .passchip .nx .ic{font-size:1.45em;color:var(--y)}
.rg .passchip.stamp{animation:rg-pstamp .7s cubic-bezier(.2,1.6,.4,1)}
@keyframes rg-pstamp{0%{transform:scale(1)}30%{transform:scale(1.25) rotate(-4deg);filter:brightness(1.6)}100%{transform:scale(1)}}
.rg .passpops{position:absolute;right:0;top:100%;width:0;height:0}
.rg .passpop{position:absolute;right:calc(var(--u)*1);top:calc(var(--u)*1.5);width:calc(var(--u)*11);height:calc(var(--u)*11);border-radius:50%;display:flex;align-items:center;justify-content:center;
  background:#fff;border:calc(var(--u)*.8) solid #000;box-shadow:0 0 0 calc(var(--u)*.5) #fff,0 0 calc(var(--u)*4) rgba(255,255,255,.8);animation:rg-ppop 1.8s cubic-bezier(.2,1.5,.4,1) both}
.rg .passpop>.ic,.rg .passpop>.wpic{font-size:calc(var(--u)*7.4);color:#15110a;--out:#fff}
.rg .passpop .ok,.rg .pslot .ok{position:absolute;right:-12%;bottom:-12%;width:44%;height:44%;border-radius:50%;background:var(--y);border:calc(var(--u)*.45) solid #000;display:flex;align-items:center;justify-content:center}
.rg .passpop .ok .ic,.rg .pslot .ok .ic{width:80%;height:80%;color:#000;--out:#fff}
@keyframes rg-ppop{0%{transform:scale(2.6) rotate(-25deg);opacity:0}18%{transform:scale(.9) rotate(6deg);opacity:1}28%{transform:scale(1) rotate(0)}80%{opacity:1;transform:scale(1)}100%{opacity:0;transform:translateY(calc(var(--u)*-6)) scale(.4)}}
.rg .passprize{position:absolute;right:calc(var(--u)*13);top:calc(var(--u)*3);display:flex;align-items:center;gap:calc(var(--u)*1);padding:calc(var(--u)*.8) calc(var(--u)*1.8);border-radius:calc(var(--u)*3);
  background:linear-gradient(180deg,#ffe97a,var(--y));color:#15110a;border:calc(var(--u)*.6) solid #000;box-shadow:0 0 0 calc(var(--u)*.45) #fff;font-size:calc(var(--u)*4);animation:rg-ppop 2.6s cubic-bezier(.2,1.5,.4,1) both;animation-delay:.25s}
.rg .passprize .ic{font-size:1.4em;color:#15110a;--out:#fff}
.rg .passprize .g{display:flex;align-items:center;gap:.1em}
.rg .passprize .t{-webkit-text-stroke:0;text-shadow:none}

/* HUD picture explanations (hover / tap / first time) */
.rg .xbub{position:absolute;z-index:20;display:none;flex-direction:column;gap:calc(var(--u)*.8);padding:calc(var(--u)*1.1) calc(var(--u)*1.6);border-radius:calc(var(--u)*2.4);
  background:#fff;color:#15110a;border:calc(var(--u)*.6) solid #000;box-shadow:0 0 0 calc(var(--u)*.45) #fff,0 calc(var(--u)*1) calc(var(--u)*2.4) rgba(0,0,0,.55);pointer-events:none}
.rg .xbub.on{display:flex;animation:rg-in .2s ease-out}
.rg .xbub::before{content:"";position:absolute;left:var(--tx,50%);top:calc(var(--u)*-2.2);width:0;height:0;transform:translateX(-50%);
  border:calc(var(--u)*1.4) solid transparent;border-bottom:calc(var(--u)*1.6) solid #000}
.rg .xrow{display:flex;align-items:center;gap:calc(var(--u)*.7);font-size:calc(var(--u)*4.4)}
.rg .xrow .ic{color:#15110a;--out:#fff}
.rg .xrow .ic.xar{color:var(--y);--out:#000;font-size:.8em}
.rg .xrow .xt{font-size:.8em;color:#fff}
.rg .hud .xpulse{animation:rg-xpulse 1s ease-in-out 4}
@keyframes rg-xpulse{0%,100%{filter:none}50%{filter:brightness(1.5) drop-shadow(0 0 calc(var(--u)*1.6) #fff)}}

/* the card overlay */
.rg .pass-over{--u:clamp(3.6px,.92vmin,20px);position:absolute;inset:0;z-index:30;display:none;align-items:center;justify-content:center;pointer-events:auto;background:rgba(6,8,20,.55)}
.rg .pass-over.on{display:flex}
.rg .pass-panel{position:relative;display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*1.6);max-width:96vw;max-height:94vh;padding:calc(var(--u)*2.2) calc(var(--u)*3) calc(var(--u)*3);
  background:linear-gradient(180deg,#232a52,#10142a);border:calc(var(--u)*.8) solid #fff;border-radius:calc(var(--u)*3);box-shadow:0 0 0 calc(var(--u)*.7) #000,0 calc(var(--u)*2) calc(var(--u)*5) rgba(0,0,0,.6);animation:rg-in .22s ease-out}
.rg .pass-head,.rg .pass-endhead{display:flex;align-items:center;gap:calc(var(--u)*1.2);font-size:calc(var(--u)*5)}
.rg .pass-head .ic.big,.rg .pass-endhead .ic.big{font-size:1.5em;color:var(--y)}
.rg .pass-head .of{font-size:.7em;opacity:.85}
.rg .pass-panel .missions{position:static;display:flex;flex-direction:row;gap:calc(var(--u)*1.6)}
.rg .pass-panel .missions:not(.on){display:none}
.rg .pass-panel .mcard{font-size:calc(var(--u)*3.2)}
.rg .pass-close{position:absolute;right:calc(var(--u)*-2);top:calc(var(--u)*-2);min-width:max(44px,calc(var(--u)*8));min-height:max(44px,calc(var(--u)*8));padding:0;border-radius:50%}
.rg .pass-track{width:100%}
.rg .ptrack{position:relative;width:100%;min-width:calc(var(--u)*60);height:calc(var(--u)*2.4);margin:calc(var(--u)*3.2) 0 calc(var(--u)*4.2);border-radius:1em;background:#ffffff26;border:calc(var(--u)*.4) solid #000;box-shadow:0 0 0 calc(var(--u)*.3) #fff}
.rg .ptrack .fill{position:absolute;left:0;top:0;bottom:0;width:var(--p);border-radius:inherit;background:#fff;transition:width .4s}
.rg .ptrack .pm{position:absolute;left:var(--x);top:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;width:calc(var(--u)*6.4)}
.rg .ptrack .pm>.ic{font-size:calc(var(--u)*5.6);color:#6b7196;--out:#000;filter:drop-shadow(0 0 0 #000)}
.rg .ptrack .pm.on>.ic{color:var(--y);--out:#000;animation:rg-bob 1.8s ease-in-out infinite}
.rg .ptrack .pm.grand>.ic{font-size:calc(var(--u)*7)}
.rg .ptrack .pm .g{position:absolute;top:100%;display:flex;align-items:center;gap:.1em;font-size:calc(var(--u)*2.6);white-space:nowrap}
.rg .ptrack .pm .g .ic{color:var(--y)}
.rg .pass-grid{display:grid;grid-template-columns:repeat(12,calc(var(--u)*8.4));gap:calc(var(--u)*1.3);justify-content:center}
.rg .pslot .wpic,.rg .passpop .wpic{display:inline-block;width:1em;height:1em}
.rg .pslot .wpic canvas,.rg .passpop .wpic canvas{width:100%;height:100%;display:block;border-radius:50%}
.rg .pslot{position:relative;width:calc(var(--u)*8.4);height:calc(var(--u)*8.4);border-radius:50%;display:flex;align-items:center;justify-content:center;
  border:calc(var(--u)*.45) dashed #ffffffa0;background:#0b0f22;transform:rotate(var(--r))}
.rg .pslot>.ic,.rg .pslot>.wpic{font-size:calc(var(--u)*5.4);opacity:.38;filter:grayscale(1)}
.rg .pslot .ok{display:none}
.rg .pslot.on{border:calc(var(--u)*.6) solid #000;background:#fff;box-shadow:0 0 0 calc(var(--u)*.4) #fff,0 0 calc(var(--u)*2) rgba(255,255,255,.6);animation:rg-pslot .5s cubic-bezier(.2,1.8,.4,1) both}
.rg .pslot.on>.ic,.rg .pslot.on>.wpic{opacity:1;filter:none;color:#15110a;--out:#fff}
.rg .pslot.on .ok{display:flex}
@keyframes rg-pslot{0%{transform:scale(1.8) rotate(-30deg);opacity:0}100%{transform:rotate(var(--r))}}

/* end screen */
.rg .pass-endcard{display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*.6);padding:calc(var(--u)*1) calc(var(--u)*2);border-radius:calc(var(--u)*2);background:#ffffff12}
.rg .pass-endhead{font-size:calc(var(--u)*3.4)}
.rg .pass-endrow{display:flex;align-items:center;gap:calc(var(--u)*3);width:100%}
.rg .pass-endcard .ptrack{flex:1;min-width:calc(var(--u)*40);height:calc(var(--u)*1.6);margin:calc(var(--u)*.6) calc(var(--u)*2) calc(var(--u)*2.6)}
.rg .pass-endcard .ptrack .pm{width:calc(var(--u)*4.4)}
.rg .pass-endcard .ptrack .pm>.ic{font-size:calc(var(--u)*3.8)}
.rg .pass-endcard .ptrack .pm .g{font-size:calc(var(--u)*1.9)}
.rg .pass-grid.mini{grid-template-columns:repeat(12,calc(var(--u)*5));gap:calc(var(--u)*.8)}
.rg .pass-grid.mini .pslot{width:calc(var(--u)*5);height:calc(var(--u)*5);border-width:calc(var(--u)*.35)}
.rg .pass-grid.mini .pslot>.ic,.rg .pass-grid.mini .pslot>.wpic{font-size:calc(var(--u)*3.2)}
`;

let done = false;
export function injectFunPassCss(): void {
  if (done) return;
  done = true;
  const s = document.createElement('style');
  s.dataset.rg = 'funpass';
  s.textContent = CSS;
  document.head.append(s);
}
