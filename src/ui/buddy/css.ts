/**
 * Styles for Pip's speech bubble, HUD callouts and the "Pip" button. Near-black panels with thick
 * white + black outlines and white/yellow content: high contrast in the red-only and green-only
 * views. Sizes use the HUD's --u (about 1vmin, clamped), so 640x360 up to 4K work.
 */
const CSS = `
.rg .pipb{position:absolute;left:0;top:0;z-index:30;pointer-events:auto;cursor:pointer;display:flex;align-items:center;gap:calc(var(--u)*1.4);
  max-width:min(calc(var(--u)*56),86vw);padding:calc(var(--u)*1.3) calc(var(--u)*2.4) calc(var(--u)*1.3) calc(var(--u)*1.5);
  background:#120f0c;border:calc(var(--u)*.55) solid #fff;border-radius:calc(var(--u)*3.2);
  box-shadow:0 0 0 calc(var(--u)*.5) #000,0 calc(var(--u)*.9) 0 calc(var(--u)*.5) #000;
  opacity:0;transform:scale(.4);transform-origin:var(--tx,50%) 110%;transition:opacity .14s,transform .22s cubic-bezier(.3,1.6,.5,1);
  visibility:hidden;will-change:left,top}
.rg .pipb.on{opacity:1;transform:scale(1);visibility:visible}
.rg .pipb.below{transform-origin:var(--tx,50%) -10%}
.rg .pipb .pic{flex:none;width:calc(var(--u)*7.2);height:calc(var(--u)*7.2);display:flex;align-items:center;justify-content:center;
  background:#2b2418;border-radius:50%;box-shadow:inset 0 0 0 calc(var(--u)*.35) #ffd93b}
.rg .pipb .pic .ic{width:84%;height:84%;color:#ffd93b}
.rg .pipb.pop .pic .ic{animation:pip-pop .5s cubic-bezier(.3,1.8,.5,1)}
.rg .pipb .say{font-size:calc(var(--u)*2.7);line-height:1.12;letter-spacing:.01em;color:#fff;white-space:normal;overflow-wrap:normal}
.rg .pipb .say .hide{color:transparent;-webkit-text-stroke:0;text-shadow:none}
.rg .pipb .say .hot{color:#ffd93b}
/* the tail: a black-outlined white triangle with a dark core, pointing at Pip */
.rg .pipb::before,.rg .pipb::after{content:"";position:absolute;left:var(--tx,50%);width:0;height:0;border-style:solid;transform:translateX(-50%)}
.rg .pipb::before{bottom:calc(var(--u)*-3.1);border-width:calc(var(--u)*2.9) calc(var(--u)*1.9) 0;border-color:#fff transparent transparent;filter:drop-shadow(0 calc(var(--u)*.45) 0 #000)}
.rg .pipb::after{bottom:calc(var(--u)*-1.9);border-width:calc(var(--u)*2.1) calc(var(--u)*1.25) 0;border-color:#120f0c transparent transparent}
.rg .pipb.below::before{bottom:auto;top:calc(var(--u)*-3.1);border-width:0 calc(var(--u)*1.9) calc(var(--u)*2.9);border-color:transparent transparent #fff;filter:drop-shadow(0 calc(var(--u)*-.45) 0 #000)}
.rg .pipb.below::after{bottom:auto;top:calc(var(--u)*-1.9);border-width:0 calc(var(--u)*1.25) calc(var(--u)*2.1);border-color:transparent transparent #120f0c}
.rg .pipb.story{border-color:#ffd93b}
.rg .pipb.story::before{border-top-color:#ffd93b}
.rg .pipb.story.below::before{border-color:transparent transparent #ffd93b}
/* pictogram-first: big icon, the button to press (per device), the thing; text is secondary */
.rg .pipb .act,.rg .pipb .pic2{display:none;flex:none;align-items:center;justify-content:center}
.rg .pipb .act.on,.rg .pipb .pic2.on{display:flex}
.rg .pipb .pic2{width:calc(var(--u)*6.4);height:calc(var(--u)*6.4)}
.rg .pipb .pic2 .ic{width:100%;height:100%;color:#fff}
.rg .pipb .pipact{display:flex;align-items:center;gap:calc(var(--u)*.6);font-size:calc(var(--u)*3.4)}
.rg .pipb .pipact .ic.tch{width:calc(var(--u)*6);height:calc(var(--u)*6);color:#fff}
.rg .pipb .pipact .cap{animation:rg-key 1.1s ease-in-out infinite}
.rg .pipb .pipact .cap.space{min-width:4.6em}
.rg .pipb .pipact .gp{font-size:calc(var(--u)*3.2)}
.rg .pipb .wasd{display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*.35);font-size:calc(var(--u)*2.4)}
.rg .pipb .wasd .row{display:flex;gap:calc(var(--u)*.35)}
.rg .pipb .wasd .cap:first-child{animation:rg-key 1.1s ease-in-out infinite}
.rg .pipb .wasd .row+.row .cap{animation:none}
@keyframes pip-pop{0%{transform:scale(.3) rotate(-20deg)}100%{transform:scale(1) rotate(0)}}

/* callout: ring + wobbling arrow around a HUD element */
.rg .pipring{position:absolute;left:0;top:0;z-index:29;pointer-events:none;border-radius:calc(var(--u)*2.4);opacity:0;transition:opacity .2s;
  border:calc(var(--u)*.7) solid #ffd93b;box-shadow:0 0 0 calc(var(--u)*.45) #000,inset 0 0 0 calc(var(--u)*.45) #000,0 0 calc(var(--u)*3) rgba(255,217,59,.75);
  animation:pip-ring 1s ease-in-out infinite}
.rg .pipring.on{opacity:1}
.rg .piparrow{position:absolute;left:0;top:0;z-index:29;pointer-events:none;width:calc(var(--u)*10);height:calc(var(--u)*6.6);opacity:0;transition:opacity .2s;transform-origin:0 50%}
.rg .piparrow.on{opacity:1}
.rg .piparrow svg{width:100%;height:100%;overflow:visible;animation:pip-wob .55s ease-in-out infinite alternate}
@keyframes pip-ring{50%{transform:scale(1.06)}}
@keyframes pip-wob{0%{transform:translateX(0) rotate(-4deg)}100%{transform:translateX(calc(var(--u)*-1.6)) rotate(4deg)}}

/* the "Pip" button: bottom-left, above the hint strip */
.rg .pipbtn{position:absolute;left:calc(var(--u)*3 + env(safe-area-inset-left,0px));bottom:calc(var(--u)*20.5 + env(safe-area-inset-bottom,0px));z-index:12;
  pointer-events:auto;cursor:pointer;width:max(44px,calc(var(--u)*7.4));height:max(44px,calc(var(--u)*7.4));padding:0;border-radius:50%;
  display:flex;align-items:center;justify-content:center;font:inherit;color:#fff;-webkit-tap-highlight-color:transparent;
  background:radial-gradient(circle at 50% 30%,#3a3020 0,#1c160e 70%,#0d0a06 100%);border:calc(var(--u)*.55) solid #fff;
  box-shadow:0 0 0 calc(var(--u)*.45) #000,0 calc(var(--u)*.9) 0 calc(var(--u)*.45) #000;transition:transform .1s,filter .1s}
.rg .pipbtn:hover{transform:scale(1.06);filter:brightness(1.15)}
.rg .pipbtn:active,.rg .pipbtn.down{transform:scale(.92)}
.rg .pipbtn>.ic{width:74%;height:74%;color:#fff3dc}
.rg .pipbtn .cap,.rg .pipbtn .gp{position:absolute;right:calc(var(--u)*-1.6);bottom:calc(var(--u)*-1.2);font-size:calc(var(--u)*1.9);margin:0}
.rg .pipbtn.talk>.ic{animation:pip-talk .32s ease-in-out infinite alternate}
@keyframes pip-talk{to{transform:translateY(calc(var(--u)*-.5)) rotate(4deg)}}
.rg:not([data-phase="playing"]) .pipbtn,.rg:not([data-phase="playing"]) .pipb,.rg:not([data-phase="playing"]) .pipring,.rg:not([data-phase="playing"]) .piparrow{display:none}
.rg.touch-on .pipbtn{bottom:auto;top:52%;
  width:max(44px,calc(var(--u)*6.6));height:max(44px,calc(var(--u)*6.6))}
.rg.touch-on .pipbtn .cap,.rg.touch-on .pipbtn .gp{display:none}
`;

let injected = false;
export function injectBuddyCss(): void {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const s = document.createElement('style');
  s.id = 'rg-buddy-css';
  s.textContent = CSS;
  document.head.append(s);
}
