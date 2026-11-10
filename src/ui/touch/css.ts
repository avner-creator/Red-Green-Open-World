/**
 * Touch HUD CSS. Same look as the main HUD (white/yellow on dark, thick black+white outlines) so
 * every control reads by brightness alone through a red or a green lens.
 * Sizes use the short side (vmin) so a phone (375 px tall) and a tablet both get thumb-sized
 * targets; every position adds the safe-area insets (notches, home bar).
 */
export const TOUCH_CSS = `
html,body{overscroll-behavior:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}
body,#game{touch-action:none}
.rg .scroll{touch-action:pan-y;-webkit-overflow-scrolling:touch}
/* short landscape screens: the settings rows scroll inside the panel instead of being cut off */
.rg .settings .panes{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;touch-action:pan-y;overscroll-behavior:contain;
  padding:calc(var(--u)*1.2);margin:calc(var(--u)*-1.2);scrollbar-width:thin;scrollbar-color:#fff #0b0f22}
.rg input[type=range]{touch-action:none}
@media (hover:none){.rg .b:hover{transform:none;filter:none}.rg .b:active{transform:scale(.95);filter:brightness(1.1)}}

.rg .touch{--sl:env(safe-area-inset-left,0px);--sr:env(safe-area-inset-right,0px);--st:env(safe-area-inset-top,0px);--sb:env(safe-area-inset-bottom,0px);
  --tj:clamp(64px,19vmin,108px);--tb:clamp(52px,13.5vmin,84px);--tm:clamp(8px,3vmin,24px);--tl:clamp(3px,.7vmin,6px);
  position:absolute;inset:0;display:none;pointer-events:none}
.rg .touch.on{display:block}
.rg .tprobe{position:absolute;visibility:hidden;pointer-events:none;padding:var(--st) var(--sr) var(--sb) var(--sl)}
.rg .tz{position:absolute;top:0;bottom:0;pointer-events:auto;touch-action:none}
.rg .tz.l{left:0;width:45%}
.rg .tz.r{left:45%;right:0}

/* floating joystick */
.rg .tstick{position:absolute;left:0;top:0;width:calc(var(--r)*2);height:calc(var(--r)*2);margin:calc(var(--r)*-1) 0 0 calc(var(--r)*-1);
  border-radius:50%;pointer-events:none;opacity:.5;transition:opacity .15s;
  background:radial-gradient(circle,rgba(11,15,34,.25) 0,rgba(11,15,34,.55) 68%,rgba(11,15,34,.7) 100%);
  border:var(--tl) solid #fff;box-shadow:0 0 0 calc(var(--tl)*.8) #000,inset 0 0 0 calc(var(--tl)*.8) #000}
.rg .tstick.on{opacity:1}
.rg .tknob{position:absolute;left:0;top:0;width:calc(var(--r)*1.1);height:calc(var(--r)*1.1);margin:calc(var(--r)*-.55) 0 0 calc(var(--r)*-.55);
  border-radius:50%;pointer-events:none;opacity:.6;transition:opacity .15s;
  background:radial-gradient(circle at 50% 35%,#fff 0,#e6e8f5 55%,#b9bdd6 100%);border:var(--tl) solid #000;box-shadow:0 0 0 calc(var(--tl)*.7) #fff,0 calc(var(--tl)*1.2) 0 calc(var(--tl)*.7) #000}
.rg .tknob.on{opacity:1}
.rg .tknob .ic{position:absolute;inset:22%;width:56%;height:56%;color:#15110a;--out:#fff}

/* buttons */
.rg .tbtn{position:absolute;pointer-events:auto;touch-action:none;display:flex;align-items:center;justify-content:center;padding:0;margin:0;
  width:var(--tb);height:var(--tb);border-radius:50%;color:#fff;font:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;
  background:radial-gradient(circle at 50% 30%,#2e3766 0,#171c38 70%,#0b0f22 100%);border:var(--tl) solid #fff;
  box-shadow:0 0 0 calc(var(--tl)*.8) #000,0 calc(var(--tl)*1.3) 0 calc(var(--tl)*.8) #000,inset 0 calc(var(--tl)*.7) 0 rgba(255,255,255,.25);
  transition:transform .08s,filter .08s}
.rg .tbtn .ic{width:58%;height:58%;color:#fff;--out:#000}
.rg .tbtn.down{transform:scale(.9) translateY(calc(var(--tl)*.6));filter:brightness(1.25)}
.rg .tbtn.jump{width:var(--tj);height:var(--tj);right:calc(var(--sr) + var(--tm));bottom:calc(var(--sb) + var(--tm) * 1.4);
  background:radial-gradient(circle at 50% 30%,#ffe97a 0,var(--y) 55%,#f2b400 100%);border-color:#000;
  box-shadow:0 0 0 calc(var(--tl)*.8) #fff,0 calc(var(--tl)*1.3) 0 calc(var(--tl)*.8) #000,inset 0 calc(var(--tl)*.7) 0 rgba(255,255,255,.7)}
.rg .tbtn.jump .ic{color:#15110a;--out:#fff}
.rg .tbtn.use{right:calc(var(--sr) + var(--tm) * 2.2 + var(--tj));bottom:calc(var(--sb) + var(--tm))}
.rg .tbtn.use.idle{opacity:.55}
.rg .tbtn.use.ready{border-color:var(--y);animation:rg-tready 1s ease-in-out infinite}
.rg .tbtn.use.ready .ic{color:var(--y)}
.rg .tbtn.flop{right:calc(var(--sr) + var(--tm) * 2.2 + var(--tj));bottom:calc(var(--sb) + var(--tm) * 2.4 + var(--tb))}
.rg .tbtn.sprint{right:calc(var(--sr) + var(--tm) * 1.2 + (var(--tj) - var(--tb)) / 2);bottom:calc(var(--sb) + var(--tm) * 2.6 + var(--tj))}
.rg .tbtn.sprint[aria-pressed="true"]{background:radial-gradient(circle at 50% 30%,#ffe97a 0,var(--y) 55%,#f2b400 100%);border-color:#000;
  box-shadow:0 0 0 calc(var(--tl)*.8) #fff,0 calc(var(--tl)*1.3) 0 calc(var(--tl)*.8) #000}
.rg .tbtn.sprint[aria-pressed="true"] .ic{color:#15110a;--out:#fff}
.rg .tbtn.pause{width:max(44px,calc(var(--tb)*.78));height:max(44px,calc(var(--tb)*.78));left:50%;top:calc(var(--st) + var(--tm) * .8);transform:translateX(-50%)}
.rg .tbtn.pause.down{transform:translateX(-50%) scale(.9)}
@keyframes rg-tready{50%{transform:scale(1.08)}}

/* first-play hints: a pulsing ring on the stick, a swiping hand on the look side */
.rg .thint{position:absolute;pointer-events:none;opacity:0;transition:opacity .5s;color:#fff;font-size:calc(var(--tb)*.7)}
.rg .thint.on{opacity:1}
.rg .thint .ic{width:1em;height:1em;color:#fff;--out:#000}
.rg .thint.look{right:calc(var(--sr) + var(--tj) * 2.3);top:calc(var(--st) + 36%);display:flex;gap:calc(var(--tm)*.6);align-items:center}
.rg .thint.look .hand{animation:rg-tswipe 1.6s ease-in-out infinite}
.rg .thint.look .ic.eye{color:var(--y)}
.rg .tstick.hint{animation:rg-tpulse 1.2s ease-in-out infinite}
@keyframes rg-tswipe{0%,100%{transform:translateX(calc(var(--tm)*-2.2))}50%{transform:translateX(calc(var(--tm)*2.2))}}
@keyframes rg-tpulse{50%{opacity:1;box-shadow:0 0 0 calc(var(--tl)*.8) #000,0 0 0 calc(var(--tl)*3) var(--y),inset 0 0 0 calc(var(--tl)*.8) #000}}

/* touch mode tweaks for the shared HUD: no key caps, room for the pause button, safe areas */
.rg.touch-on .tut{display:none!important}
.rg.touch-on .prompt .cap,.rg.touch-on .prompt .gp{display:none}
.rg.touch-on .rg-sky-prompt .key{display:none}
.rg .tbtn.jump.cue{animation:rg-tcue .7s ease-in-out infinite alternate}
@keyframes rg-tcue{to{box-shadow:0 0 0 calc(var(--tl)*.8) #fff,0 0 0 calc(var(--tl)*3) #000,0 0 0 calc(var(--tl)*4.4) #fff}}
.rg.touch-on .toasts{top:calc(var(--u)*15 + env(safe-area-inset-top,0px))}
.rg.touch-on .pill.gems,.rg.touch-on .pill.stars{margin-left:env(safe-area-inset-left,0px);margin-top:env(safe-area-inset-top,0px)}
.rg.touch-on .timer{margin-right:env(safe-area-inset-right,0px);margin-top:env(safe-area-inset-top,0px)}
.rg.touch-on .prompt{bottom:calc(var(--u)*6 + env(safe-area-inset-bottom,0px))}
.rg.touch-on .corner.l{left:calc(var(--u)*3 + env(safe-area-inset-left,0px))}
.rg.touch-on .corner.r{right:calc(var(--u)*3 + env(safe-area-inset-right,0px))}

/* rotate to landscape (icon only) */
.rg .rotate{position:absolute;inset:0;display:none;align-items:center;justify-content:center;pointer-events:auto;touch-action:none;
  background:radial-gradient(ellipse at center,#1a2048 0,#0b0f22 75%)}
.rg .rotate.on{display:flex}
.rg .rotate svg{width:min(46vw,46vh);height:min(46vw,46vh);overflow:visible}
.rg .rotate .phone{transform-origin:50% 50%;animation:rg-trot 2.4s cubic-bezier(.6,0,.3,1) infinite}
@keyframes rg-trot{0%,20%{transform:rotate(0)}55%,85%{transform:rotate(90deg)}100%{transform:rotate(0)}}
@media (prefers-reduced-motion:reduce){.rg .touch *,.rg .rotate *{animation:none!important}}
`;
