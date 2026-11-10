/** CSS for the compass, controls card and mode hint strips. Injected once by wayfinding.ts. */
export const WAYFINDING_CSS = `
.rg .wf-hud{--u:clamp(6.4px,1.05vmin,24px);position:absolute;inset:0;pointer-events:none;display:none}
.rg[data-phase="playing"] .wf-hud{display:block}
.rg[data-mode="driving"] .tut,.rg[data-mode="external"] .tut{display:none}

/* compass */
.rg .wf-compass{position:absolute;left:50%;top:calc(var(--u)*2.4);transform:translateX(-50%);width:min(calc(var(--u)*76),49vw);height:calc(var(--u)*6.4);
  border-radius:calc(var(--u)*4);background:linear-gradient(180deg,#1d2346b8,#0b0f22b8);border:calc(var(--u)*.5) solid #ffffffd9;
  box-shadow:0 0 0 calc(var(--u)*.4) #000,0 calc(var(--u)*.7) calc(var(--u)*1.8) rgba(0,0,0,.45),inset 0 0 calc(var(--u)*2) rgba(0,0,0,.5)}
.rg .wf-compass::before{content:"";position:absolute;left:50%;top:12%;bottom:12%;width:calc(var(--u)*.35);margin-left:calc(var(--u)*-.17);background:#ffffff40;border-radius:9px}
.rg .wf-m{position:absolute;top:50%;left:50%;width:calc(var(--u)*4.8);height:calc(var(--u)*4.8);margin:calc(var(--u)*-2.4) 0 0 calc(var(--u)*-2.4);border-radius:50%;
  display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,#2b3360,#10142a);border:calc(var(--u)*.45) solid #fff;box-shadow:0 0 0 calc(var(--u)*.35) #000;
  font-size:calc(var(--u)*3);transition:width .15s,height .15s,margin .15s,opacity .2s,left .12s}
.rg .wf-m .ic{color:var(--y)}
.rg .wf-m.hl{width:calc(var(--u)*7.2);height:calc(var(--u)*7.2);margin:calc(var(--u)*-3.6) 0 0 calc(var(--u)*-3.6);font-size:calc(var(--u)*4.6);border-color:var(--y);z-index:2;
  box-shadow:0 0 0 calc(var(--u)*.4) #000,0 0 calc(var(--u)*2) rgba(255,217,59,.75)}
.rg .wf-m.sm{width:calc(var(--u)*3.6);height:calc(var(--u)*3.6);margin:calc(var(--u)*-1.8) 0 0 calc(var(--u)*-1.8);font-size:calc(var(--u)*2.4)}
.rg .wf-m.cl{opacity:.9}
.rg .wf-m.hidden{opacity:0}
.rg .wf-m .arr{position:absolute;top:50%;width:calc(var(--u)*1.7);height:calc(var(--u)*1.9);margin-top:calc(var(--u)*-.95);display:none}
.rg .wf-m .arr svg{width:100%;height:100%;overflow:visible}
.rg .wf-m.cl .arr{display:block}
.rg .wf-m .arr.r{right:calc(var(--u)*-2.1)}
.rg .wf-m .arr.l{left:calc(var(--u)*-2.1);transform:scaleX(-1)}
.rg .wf-m .dots{position:absolute;left:50%;top:calc(100% + var(--u)*.7);transform:translateX(-50%);display:none;gap:calc(var(--u)*.5);padding:calc(var(--u)*.45) calc(var(--u)*.8);
  background:#0b0f22e6;border:calc(var(--u)*.3) solid #fff;border-radius:calc(var(--u)*2);box-shadow:0 0 0 calc(var(--u)*.25) #000}
.rg .wf-m.hl .dots{display:flex}
.rg .wf-m .dots i{width:calc(var(--u)*1.1);height:calc(var(--u)*1.1);border-radius:50%;border:calc(var(--u)*.25) solid #fff;background:transparent}
.rg .wf-m .dots i.f{background:var(--y);border-color:#000;box-shadow:0 0 0 calc(var(--u)*.2) #fff}

/* help button + card */
.rg .wf-help{position:absolute;right:calc(var(--u)*2.4);top:calc(var(--u)*11.6);width:calc(var(--u)*6.4);height:calc(var(--u)*6.4);padding:0;border-radius:50%;
  pointer-events:auto;cursor:pointer;font:inherit;font-size:calc(var(--u)*4.2);font-weight:1000;color:#fff;background:linear-gradient(180deg,#2b3360,#10142a);
  border:calc(var(--u)*.6) solid #fff;box-shadow:0 0 0 calc(var(--u)*.45) #000,0 calc(var(--u)*.8) calc(var(--u)*2) rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center}
.rg .wf-help:hover{filter:brightness(1.2)}
.rg .wf-help[aria-pressed="true"]{background:linear-gradient(180deg,#ffe97a,#ffd93b 55%,#f2b400);color:#15110a}
.rg .wf-card{--u:clamp(3.6px,.9vmin,20px);z-index:30;position:absolute;inset:0;display:none;align-items:center;justify-content:center;pointer-events:none;
  background:radial-gradient(ellipse at center,rgba(6,8,20,.5),rgba(6,8,20,.78))}
.rg .wf-card.on{display:flex}
.rg .wf-card.dim{pointer-events:auto}
.rg .wf-panel{pointer-events:auto;display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*1.6);max-width:96vw;max-height:96vh;overflow:hidden;
  background:linear-gradient(180deg,#171c3a,var(--panel));border:calc(var(--u)*.8) solid #fff;border-radius:calc(var(--u)*3);padding:calc(var(--u)*2) calc(var(--u)*2.4);
  box-shadow:0 0 0 calc(var(--u)*.7) #000,0 calc(var(--u)*2) calc(var(--u)*5) rgba(0,0,0,.6),inset 0 calc(var(--u)*.4) 0 #ffffff30}
.rg .wf-card.on .wf-panel{animation:rg-in .22s ease-out}
.rg .wf-title{display:flex;align-items:center;gap:calc(var(--u)*1.4);font-size:calc(var(--u)*4)}
.rg .wf-title .ic{font-size:1.3em;color:var(--y)}
.rg .wf-cols{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:calc(var(--u)*1.6)}
.rg .wf-col{display:flex;flex-direction:column;gap:calc(var(--u)*1.1);background:#ffffff14;border:calc(var(--u)*.3) solid #ffffff40;border-radius:calc(var(--u)*2);padding:calc(var(--u)*1.2)}
.rg .wf-col .hd{display:flex;align-items:center;justify-content:center;font-size:calc(var(--u)*4);padding-bottom:calc(var(--u)*.6);border-bottom:calc(var(--u)*.35) solid #ffffff55}
.rg .wf-col .hd .ic{font-size:1.7em;color:var(--y)}
.rg .wf-row{display:flex;align-items:center;justify-content:space-between;gap:calc(var(--u)*1.4);min-height:calc(var(--u)*5.6);font-size:calc(var(--u)*2.9)}
.rg .wf-row .keys{display:flex;align-items:center;gap:calc(var(--u)*.5);flex-wrap:wrap}
.rg .wf-row .cap,.rg .wf-row .gp{margin-bottom:calc(var(--u)*.7)}
.rg .wf-row .cap.wide{min-width:3em}
.rg .wf-row>.ic{font-size:calc(var(--u)*4.6);color:var(--y)}
.rg .wf-row .sep{opacity:.85;font-size:.8em}
.rg .wf-close{pointer-events:auto;min-height:max(44px,calc(var(--u)*6.4));font-size:calc(var(--u)*3)}

/* mode hint strip */
.rg .wf-strip{--u:clamp(3.8px,.82vmin,18px);position:absolute;left:calc(var(--u)*3);bottom:calc(var(--u)*3);display:flex;gap:calc(var(--u)*2);align-items:flex-end;padding:calc(var(--u)*1.2) calc(var(--u)*2);
  background:linear-gradient(180deg,#1d2346e6,#0b0f22e6);border:calc(var(--u)*.6) solid #fff;border-radius:calc(var(--u)*2.8);box-shadow:0 0 0 calc(var(--u)*.45) #000,0 calc(var(--u)*.8) calc(var(--u)*2) rgba(0,0,0,.5);
  font-size:calc(var(--u)*3);opacity:0;pointer-events:none;transition:opacity .6s;max-width:48vw}
.rg .wf-strip .tgroup{flex-wrap:nowrap}.rg .wf-strip .keys{display:inline-flex;gap:calc(var(--u)*.4);flex-wrap:nowrap;align-items:center}
.rg .wf-strip.on{opacity:1}
.rg .wf-strip .cap.wide{min-width:2.6em}
.rg .wf-strip .tkeys{display:flex;gap:calc(var(--u)*.4)}
.rg:not([data-phase="playing"]) .wf-strip{display:none}
`;

let injected = false;
export function injectWayfindingCss(): void {
  if (injected) return;
  injected = true;
  const el = document.createElement('style');
  el.textContent = WAYFINDING_CSS;
  document.head.appendChild(el);
}
