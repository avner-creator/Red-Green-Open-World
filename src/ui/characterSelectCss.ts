/**
 * Character select, skill pictograms, HUD skill chip and touch skill/emote button CSS.
 * Light-on-dark with thick black + white outlines: every cue works by brightness, not hue.
 */
export const CHARACTER_CSS = `
/* ---------- skill pictograms ---------- */
.rg .sk{display:inline-block;width:1em;height:1em;flex:none;vertical-align:middle}
.rg .sk svg{width:100%;height:100%;overflow:visible;fill:#fff;stroke:#000;stroke-width:2.2;stroke-linejoin:round;stroke-linecap:round;paint-order:stroke fill}
.rg .sk .k{fill:#000;stroke:none}
.rg .sk .gr{fill:#ffd93b}
.rg .sk .arr{fill:#ffd93b}
.rg .sk .spring{fill:#ffd93b}
.rg .sk .wings path{fill:#ffd93b}
.rg .sk .trail{fill:none;stroke:#fff;stroke-width:2.4;stroke-dasharray:2 4;paint-order:normal}
.rg .sk .lines path{fill:none;stroke:#fff;stroke-width:2.6;paint-order:normal}
.rg .sk .puff,.rg .sk .ring{fill:none;stroke:#ffd93b;stroke-width:2.6;paint-order:normal;opacity:0}
.rg .sk .dot,.rg .sk .puff,.rg .sk .ring,.rg .sk .lines,.rg .sk .wings{transform-box:fill-box;transform-origin:50% 100%}
.rg .sk .puff,.rg .sk .ring{transform-origin:50% 50%}
.rg .sk-doubleJump .dot{animation:sk-dj 2.2s ease-in-out infinite}
.rg .sk-doubleJump .puff{animation:sk-dj-puff 2.2s ease-out infinite}
.rg .sk-glide .dot{animation:sk-gl 2.6s ease-in-out infinite}
.rg .sk-glide .wings{transform-origin:50% 50%;animation:sk-gl-wing .7s ease-in-out infinite alternate}
.rg .sk-dash .dot{animation:sk-da 1.8s cubic-bezier(.5,0,.2,1) infinite}
.rg .sk-dash .lines{animation:sk-da-lines 1.8s linear infinite}
.rg .sk-superBounce .dot{animation:sk-sb 2.2s ease-in-out infinite}
.rg .sk-groundPound .dot{animation:sk-gp 2.2s ease-in infinite}
.rg .sk-groundPound .r1{animation:sk-gp-ring 2.2s ease-out infinite}
.rg .sk-groundPound .r2{animation:sk-gp-ring 2.2s ease-out .12s infinite}
.rg .sk.still *{animation:none!important}
.rg .sk.still .dot{transform:translateY(-12px)}
.rg .sk-glide.still .dot{transform:translate(0,-6px)}
.rg .sk-dash.still .dot{transform:translateX(6px) scaleX(1.3)}
.rg .sk-dash.still .lines{opacity:1}
.rg .sk-superBounce.still .dot{transform:translateY(-14px)}
.rg .sk-groundPound.still .dot{transform:translateY(-8px) scaleY(1.2)}
.rg .sk-groundPound.still .r1{opacity:1;transform:scale(1.8)}
.rg .sk-doubleJump.still .puff{opacity:1}
@keyframes sk-dj{0%,8%{transform:translateY(0)}24%,34%{transform:translateY(-12px)}58%{transform:translateY(-26px)}82%,100%{transform:translateY(0)}}
@keyframes sk-dj-puff{0%,30%{opacity:0;transform:scale(.3)}38%{opacity:1;transform:scale(1)}58%,100%{opacity:0;transform:scale(1.7)}}
@keyframes sk-gl{0%{transform:translate(-12px,-22px)}80%,100%{transform:translate(8px,-1px)}}
@keyframes sk-gl-wing{to{transform:scaleY(.6)}}
@keyframes sk-da{0%,12%{transform:translateX(-14px)}34%{transform:translateX(12px) scaleX(1.4)}60%{transform:translateX(12px)}100%{transform:translateX(-14px)}}
@keyframes sk-da-lines{0%,10%{opacity:0;transform:translateX(-14px)}30%{opacity:1;transform:translateX(0)}50%,100%{opacity:0}}
@keyframes sk-sb{0%,6%{transform:translateY(0) scaleY(1)}16%{transform:translateY(2px) scaleY(.55)}38%{transform:translateY(-28px) scaleY(1.15)}60%{transform:translateY(-28px) scaleY(1)}86%,100%{transform:translateY(0) scaleY(1)}}
@keyframes sk-gp{0%,12%{transform:translateY(-26px)}34%{transform:translateY(0) scaleY(1.3)}40%{transform:translateY(0) scaleY(.55)}52%,64%{transform:translateY(0) scaleY(1)}90%,100%{transform:translateY(-26px)}}
@keyframes sk-gp-ring{0%,34%{opacity:0;transform:scale(.5)}40%{opacity:1;transform:scale(1)}70%,100%{opacity:0;transform:scale(3.4)}}

/* ---------- character select ---------- */
.rg .csel{flex-direction:column;justify-content:space-between;align-items:stretch;padding:calc(var(--u)*2) calc(var(--u)*3);
  background:linear-gradient(180deg,rgba(6,8,20,.6) 0,rgba(6,8,20,0) 20%,rgba(6,8,20,0) 58%,rgba(6,8,20,.88) 100%)}
.rg .csel>*{pointer-events:none}
.rg .csel .b,.rg .csel .cs-card,.rg .csel .cs-chip,.rg .csel .cs-arrow,.rg .csel .cs-pill,.rg .csel .cs-stage{pointer-events:auto}
.rg .cs-top{display:flex;justify-content:space-between;align-items:center}
.rg .cs-pill{display:flex;align-items:center;gap:calc(var(--u)*1.2);padding:calc(var(--u)*.8) calc(var(--u)*2.4) calc(var(--u)*.8) calc(var(--u)*1.2);
  background:linear-gradient(180deg,#1d2346e6,#0b0f22e6);border:calc(var(--u)*.6) solid #fff;border-radius:calc(var(--u)*4);
  box-shadow:0 0 0 calc(var(--u)*.45) #000;font-size:calc(var(--u)*4);font-variant-numeric:tabular-nums}
.rg .cs-pill .ic{font-size:1.5em;color:var(--y)}
.rg .cs-mid{flex:1;display:flex;align-items:flex-end;gap:calc(var(--u)*2);min-height:0;padding:calc(var(--u)*1) 0}
.rg .cs-stage{flex:1;align-self:stretch;display:flex;align-items:center;justify-content:space-between;touch-action:pan-y}
.rg .cs-arrow{align-self:center;flex:none;width:calc(var(--u)*8);height:calc(var(--u)*8);min-width:44px;min-height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;
  background:linear-gradient(180deg,#2a3258,#171c38);border:calc(var(--u)*.6) solid #fff;box-shadow:0 0 0 calc(var(--u)*.45) #000;color:#fff;font-size:calc(var(--u)*5);
  transition:transform .12s,filter .12s;touch-action:manipulation}
.rg .cs-arrow:hover{transform:scale(1.1);filter:brightness(1.2)}
.rg .cs-arrow:active{transform:scale(.94)}
.rg .cs-arrow.r .ic{transform:scaleX(-1)}
.rg .cs-card{--c0:#fff;--c1:#1b2040;flex:0 0 33%;max-width:calc(var(--u)*58);display:flex;flex-direction:column;gap:calc(var(--u)*1.2);padding:calc(var(--u)*2);
  background:linear-gradient(165deg,var(--c1),#0b0f22 85%);border:calc(var(--u)*.7) solid #fff;border-radius:calc(var(--u)*2.6);
  box-shadow:0 0 0 calc(var(--u)*.6) #000,0 calc(var(--u)*1.5) calc(var(--u)*4) rgba(0,0,0,.6),inset 0 calc(var(--u)*.4) 0 #ffffff30}
.rg .cs-card.pop{animation:cs-card .32s cubic-bezier(.2,1.5,.4,1)}
@keyframes cs-card{from{transform:translateY(calc(var(--u)*2)) scale(.93);opacity:.4}}
.rg .cs-name{font-size:calc(var(--u)*8.2);font-weight:1000;line-height:.95;letter-spacing:.02em;color:#fff;-webkit-text-stroke:calc(var(--u)*1) #000;paint-order:stroke fill;
  text-shadow:0 calc(var(--u)*.6) 0 #000,calc(var(--u)*.5) 0 0 var(--c0)}
.rg .cs-bar{height:calc(var(--u)*1.1);border-radius:calc(var(--u)*.6);background:var(--c0);box-shadow:0 0 0 calc(var(--u)*.35) #000}
.rg .cs-story{font-size:calc(var(--u)*2.5);font-weight:800;line-height:1.18;color:#fff;-webkit-text-stroke:calc(var(--u)*.35) #000;paint-order:stroke fill}
.rg .cs-row{display:flex;align-items:center;gap:calc(var(--u)*1.4);flex-wrap:wrap}
.rg .cs-emote{min-width:max(48px,calc(var(--u)*7));min-height:max(48px,calc(var(--u)*7));font-size:calc(var(--u)*2.6)}
.rg .cs-emote .keys{display:inline-flex;gap:.2em;font-size:.9em}
.rg .cs-right{align-items:center;text-align:center;flex:0 0 29%}
.rg .cs-skill{display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*.8)}
.rg .cs-tile{width:calc(var(--u)*17);height:calc(var(--u)*17);display:flex;align-items:center;justify-content:center;font-size:calc(var(--u)*15);
  background:radial-gradient(circle at 50% 30%,#2a3160,#0b0f22 80%);border:calc(var(--u)*.6) solid var(--c0);border-radius:calc(var(--u)*2.4);box-shadow:0 0 0 calc(var(--u)*.45) #000}
.rg .cs-skname{font-size:calc(var(--u)*2.5);letter-spacing:.06em;color:var(--y);-webkit-text-stroke:calc(var(--u)*.4) #000;paint-order:stroke fill}
.rg .cs-skill .keys{display:inline-flex;gap:.25em;font-size:calc(var(--u)*3)}
.rg .cs-act{display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*1);width:100%}
.rg .cs-go{width:100%;min-height:calc(var(--u)*10);font-size:calc(var(--u)*5);letter-spacing:.06em;border-radius:calc(var(--u)*3.4);isolation:isolate}
.rg .cs-go .ic{animation:rg-bob 1.8s ease-in-out infinite}
.rg .cs-go.buy{animation:cs-buy 1s ease-in-out infinite alternate}
@keyframes cs-buy{to{filter:brightness(1.25);box-shadow:0 0 0 calc(var(--u)*.45) #fff,0 0 calc(var(--u)*3) calc(var(--u)*1) rgba(255,217,59,.9)}}
.rg .cs-need{display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*1);width:100%;padding:calc(var(--u)*1.2);border:calc(var(--u)*.5) dashed #fff;border-radius:calc(var(--u)*2.4);background:#0b0f22}
.rg .cs-need .pr{display:flex;align-items:center;gap:calc(var(--u)*1);font-size:calc(var(--u)*4.4)}
.rg .cs-need .ic{font-size:1.2em}
.rg .cs-need .ic.y{color:var(--y)}
.rg .cs-meter{width:100%;height:calc(var(--u)*1.8);background:#000;border:calc(var(--u)*.35) solid #fff;border-radius:calc(var(--u)*1);overflow:hidden}
.rg .cs-meter i{display:block;height:100%;width:var(--p,0%);background:var(--y)}
.rg .cs-hunt{display:flex;align-items:center;gap:calc(var(--u)*.8);font-size:calc(var(--u)*3.6);animation:rg-bob 2s ease-in-out infinite}
.rg .cs-hunt .ic:first-child{color:#fff}
.rg .cs-hunt .ic:last-child{color:var(--y)}
.rg .cs-dock{display:flex;justify-content:center;align-items:flex-end;gap:calc(var(--u)*1.6);padding-top:calc(var(--u)*1.5)}
.rg .cs-chip{--c0:#fff;--c1:#1b2040;position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:calc(var(--u)*.3);
  width:calc(var(--u)*12.5);min-width:48px;height:calc(var(--u)*13.5);min-height:52px;padding:0;margin:0;font:inherit;color:#fff;cursor:pointer;
  background:linear-gradient(165deg,var(--c1),#0b0f22);border:calc(var(--u)*.6) solid #fff;border-radius:calc(var(--u)*2.2);box-shadow:0 0 0 calc(var(--u)*.45) #000;
  transition:transform .15s cubic-bezier(.2,1.6,.4,1),filter .15s;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.rg .cs-chip .sk{font-size:calc(var(--u)*6.6)}
.rg .cs-chip .nm{font-size:calc(var(--u)*2.1);letter-spacing:.03em;-webkit-text-stroke:calc(var(--u)*.35) #000;paint-order:stroke fill}
.rg .cs-chip .lk{position:absolute;right:calc(var(--u)*-1);top:calc(var(--u)*-1.2);width:calc(var(--u)*4.4);height:calc(var(--u)*4.4);border-radius:50%;background:#fff;border:calc(var(--u)*.4) solid #000;
  display:flex;align-items:center;justify-content:center;font-size:calc(var(--u)*3);color:#000}
.rg .cs-chip .lk .ic{color:#000;--out:#fff}
.rg .cs-chip.locked{filter:brightness(.7)}
.rg .cs-chip.sel{transform:translateY(calc(var(--u)*-1.6)) scale(1.14);border-color:var(--y);filter:none;box-shadow:0 0 0 calc(var(--u)*.6) #000,0 0 calc(var(--u)*3) calc(var(--u)*.8) rgba(255,217,59,.85);z-index:2}
.rg .cs-chip:hover{filter:brightness(1.15)}
.rg.nav-kb .cs-chip:focus{outline:calc(var(--u)*.9) solid #fff;outline-offset:calc(var(--u)*.6);transform:translateY(calc(var(--u)*-1.6)) scale(1.14)}

/* unlock celebration */
.rg .cs-cele{position:absolute;inset:0;display:none;flex-direction:column;justify-content:flex-start;gap:calc(var(--u)*1);align-items:center;padding:calc(var(--u)*5) 0 0;pointer-events:none!important;overflow:hidden;
  background:radial-gradient(ellipse at 50% 50%,rgba(255,217,59,0) 25%,rgba(255,217,59,.35) 100%)}
.rg .cs-cele.on{display:flex;animation:cs-flash .5s ease-out}
@keyframes cs-flash{from{background-color:rgba(255,255,255,.85)}}
.rg .cs-cele .big{display:flex;align-items:center;gap:calc(var(--u)*2);font-size:calc(var(--u)*14);font-weight:1000;color:var(--y);
  -webkit-text-stroke:calc(var(--u)*1.4) #000;paint-order:stroke fill;text-shadow:0 calc(var(--u)*1.2) 0 #000;animation:cs-slam .7s cubic-bezier(.2,1.8,.4,1) both}
.rg .cs-cele .big .ic{color:var(--y);font-size:.8em;animation:rg-spin 1.4s ease-in-out infinite alternate}
.rg .cs-cele .nm{font-size:calc(var(--u)*16);font-weight:1000;color:#fff;-webkit-text-stroke:calc(var(--u)*1.6) #000;paint-order:stroke fill;text-shadow:0 calc(var(--u)*1.4) 0 #000;animation:cs-slam .8s .15s cubic-bezier(.2,1.8,.4,1) both}
.rg .cs-cele .confetti{z-index:-1}
@keyframes cs-slam{from{transform:scale(3.2) rotate(-8deg);opacity:0}}

/* ---------- in-game skill chip ---------- */
.rg .skchip{position:absolute;right:calc(var(--u)*3);bottom:calc(var(--u)*3);width:calc(var(--u)*11);height:calc(var(--u)*11);min-width:44px;min-height:44px;border-radius:50%;
  display:flex;align-items:center;justify-content:center;pointer-events:none;
  background:radial-gradient(circle at 50% 30%,#2e3766 0,#171c38 70%,#0b0f22 100%);border:calc(var(--u)*.7) solid #fff;box-shadow:0 0 0 calc(var(--u)*.5) #000,0 calc(var(--u)*1) calc(var(--u)*2) rgba(0,0,0,.5);
  font-size:calc(var(--u)*7.6);transition:opacity .2s,filter .2s}
.rg .skchip .cdring{position:absolute;inset:0;border-radius:50%;background:conic-gradient(var(--y) calc(var(--p,1)*360deg),rgba(0,0,0,.78) 0);opacity:0}
.rg .skchip .sk{position:relative}
.rg .skchip .key{position:absolute;right:calc(var(--u)*-1.6);bottom:calc(var(--u)*-1.4);font-size:calc(var(--u)*3.2);display:flex}
.rg .skchip.ready{animation:rg-ready 1.1s ease-in-out infinite;border-color:var(--y)}
.rg .skchip.cd{opacity:.62;filter:grayscale(1) brightness(.7)}
.rg .skchip.cd .cdring{opacity:.7}
.rg .skchip.act{border-color:var(--y);background:radial-gradient(circle at 50% 30%,#4a4220,#2a2610 80%)}
@keyframes rg-ready{50%{transform:scale(1.1);box-shadow:0 0 0 calc(var(--u)*.5) #000,0 0 calc(var(--u)*2.6) calc(var(--u)*.6) rgba(255,217,59,.9)}}
.rg:not([data-phase="playing"]) .skchip,.rg.touch-on .skchip{display:none}

/* touch skill + emote buttons (the circles share the touch HUD look) */
.rg .tbtn.skill{right:calc(var(--sr) + var(--tm) * 3.4 + var(--tj) + var(--tb));bottom:calc(var(--sb) + var(--tm))}
.rg .tbtn.emote{right:calc(var(--sr) + var(--tm) * 3.4 + var(--tj) + var(--tb));bottom:calc(var(--sb) + var(--tm) * 2.4 + var(--tb))}
.rg .tbtn.skill .sk{font-size:calc(var(--tb)*.72)}
.rg .tbtn.skill.ready{border-color:var(--y);animation:rg-tready 1s ease-in-out infinite}
.rg .tbtn.skill.cd{opacity:.5;filter:grayscale(1)}
.rg .tbtn.skill .cdring{position:absolute;inset:0;border-radius:50%;background:conic-gradient(var(--y) calc(var(--p,1)*360deg),rgba(0,0,0,.75) 0);opacity:0;pointer-events:none}
.rg .tbtn.skill.cd .cdring{opacity:.6}
.rg .tbtn.skill .sk{position:relative}

@media (max-height:420px){
  .rg .cs-story{font-size:calc(var(--u)*2.4)}
  .rg .cs-name{font-size:calc(var(--u)*7.4)}
  .rg .cs-card{padding:calc(var(--u)*1.4);gap:calc(var(--u)*.8)}
  .rg .cs-tile{width:calc(var(--u)*13);height:calc(var(--u)*13);font-size:calc(var(--u)*11.5)}
  .rg .cs-chip{height:calc(var(--u)*11.5);width:calc(var(--u)*11.5)}
  .rg .cs-go{min-height:calc(var(--u)*8)}
}
`;

let done = false;
export function injectCharacterCss(): void {
  if (done) return;
  done = true;
  const el = document.createElement('style');
  el.textContent = CHARACTER_CSS;
  document.head.appendChild(el);
}
