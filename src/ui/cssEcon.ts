/**
 * CSS for the economy UI: wallet, combo, missions, moments, Gear Shack, wardrobe, end-screen rows.
 * States differ by brightness and shape (both eyes must read them through red/green lenses).
 */
const RAYS_MASK = 'radial-gradient(circle,#000 18%,transparent 70%)';

export const ECON_CSS = `
/* ---------- wallet chip ---------- */
.rg .wallet{position:relative;display:inline-flex;align-items:center;gap:calc(var(--u)*1);padding:calc(var(--u)*.55) calc(var(--u)*2.6) calc(var(--u)*.55) calc(var(--u)*.7);
  background:linear-gradient(180deg,#262e5cf0,#0b0f22f0);border:calc(var(--u)*.6) solid #fff;border-radius:calc(var(--u)*4);
  box-shadow:0 0 0 calc(var(--u)*.45) #000,0 calc(var(--u)*.8) calc(var(--u)*2) rgba(0,0,0,.5),inset 0 calc(var(--u)*.35) 0 #ffffff30;
  font-size:calc(var(--u)*4.6);font-variant-numeric:tabular-nums;line-height:1}
.rg .wallet .gemic{display:inline-flex;width:1.6em;height:1.6em;align-items:center;justify-content:center;border-radius:50%;
  background:radial-gradient(circle at 40% 32%,#46519e,#121736 72%);border:calc(var(--u)*.4) solid #000;box-shadow:0 0 0 calc(var(--u)*.35) var(--y)}
.rg .wallet .gemic .ic{font-size:1.02em;color:var(--y);filter:drop-shadow(0 0 calc(var(--u)*.5) rgba(255,217,59,.75))}
.rg .wallet .n{display:inline-block;min-width:2ch;transition:transform .12s}
.rg .wallet .n.up{transform:scale(1.14);color:var(--y)}
.rg .wallet .n.down{transform:scale(.92)}
.rg .wallet.bump{animation:rg-wbump .35s cubic-bezier(.2,1.6,.4,1)}
.rg .wallet.bump-big{animation:rg-wbumpb .65s cubic-bezier(.2,1.6,.4,1)}
.rg .wallet.shake{animation:rg-wshake .5s}
@keyframes rg-wbump{40%{transform:scale(1.14)}}
@keyframes rg-wbumpb{30%{transform:scale(1.34) rotate(-4deg)}60%{transform:scale(.95) rotate(2deg)}}
@keyframes rg-wshake{15%{transform:translateX(calc(var(--u)*-1.4)) rotate(-3deg)}35%{transform:translateX(calc(var(--u)*1.4)) rotate(3deg)}55%{transform:translateX(calc(var(--u)*-1)) rotate(-2deg)}75%{transform:translateX(calc(var(--u)*.7))}}
.rg .wallet .pops{position:absolute;left:calc(var(--u)*4);top:100%;width:0;height:0;pointer-events:none;z-index:3}
.rg .pop{position:absolute;left:0;top:calc(var(--u)*.4);display:flex;align-items:center;gap:calc(var(--u)*.5);white-space:nowrap;font-size:calc(var(--u)*4.6);
  transform-origin:15% 50%;animation:rg-popfly 1.3s cubic-bezier(.2,1.3,.4,1) both;isolation:isolate}
.rg .pop .v{color:var(--y);font-size:1.05em}
.rg .pop.neg .v{color:#fff}
.rg .pop>.ic{font-size:1.3em;color:var(--y)}
.rg .pop.neg>.ic{color:#fff}
.rg .pop.k-mega{font-size:calc(var(--u)*6.6);animation-duration:1.7s}
.rg .pop.k-bonus,.rg .pop.k-jackpot{font-size:calc(var(--u)*6.2);animation-duration:1.9s}
.rg .pop.k-free>.ic:first-child{animation:rg-spin .5s ease-in-out infinite alternate}
.rg .pop.again .v{animation:rg-wbump .3s cubic-bezier(.2,1.6,.4,1)}
.rg .pop .rays{position:absolute;left:-40%;top:50%;width:calc(var(--u)*18);height:calc(var(--u)*18);margin-top:calc(var(--u)*-9);z-index:-1;border-radius:50%;
  background:repeating-conic-gradient(rgba(255,255,255,.8) 0 9deg,transparent 9deg 26deg);-webkit-mask:${RAYS_MASK};mask:${RAYS_MASK};animation:rg-raypop 1.4s ease-out both}
@keyframes rg-popfly{0%{opacity:0;transform:translateY(calc(var(--u)*-2)) scale(.3)}14%{opacity:1;transform:translateY(0) scale(1.3)}26%{transform:scale(1)}72%{opacity:1;transform:translateY(calc(var(--u)*1.2))}100%{opacity:0;transform:translateY(calc(var(--u)*3)) scale(.9)}}
@keyframes rg-raypop{0%{transform:scale(0) rotate(0);opacity:0}25%{opacity:1}100%{transform:scale(1.3) rotate(90deg);opacity:0}}

/* ---------- HUD top-left cluster: wallet + combo ---------- */
.rg .econtop{position:absolute;z-index:4;left:calc(var(--u)*2.4);top:calc(var(--u)*2.4);display:flex;align-items:center;gap:calc(var(--u)*1.6)}
.rg .econtop.near .wallet{animation:rg-near 1.2s ease-out}
.rg .hud .pill.stars{top:calc(var(--u)*13.8)}
.rg .combo{--cs:1;position:relative;width:calc(var(--u)*9.4);height:calc(var(--u)*9.4);display:none;align-items:center;justify-content:center;font-size:calc(var(--u)*3.9);transform:scale(var(--cs))}
.rg .combo.on{display:flex}
.rg .combo svg{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg);overflow:visible}
.rg .combo::before{content:'';position:absolute;inset:15%;border-radius:50%;background:radial-gradient(circle at 40% 30%,#46519e,#0d1130 75%);border:calc(var(--u)*.35) solid #000}
.rg .combo .fl{position:absolute;left:50%;top:-34%;transform:translateX(-50%);font-size:1.25em;line-height:0}
.rg .combo .fl .ic{color:var(--y)}
.rg .combo .x{position:relative;letter-spacing:-.04em}
.rg .combo[data-mult="3"]{--cs:1.08}.rg .combo[data-mult="4"]{--cs:1.16}
.rg .combo[data-mult="5"]{--cs:1.26;filter:drop-shadow(0 0 calc(var(--u)*1) #fff)}
.rg .combo[data-mult="5"] .fl .ic{animation:rg-spin .35s ease-in-out infinite alternate}
.rg .combo.step{animation:rg-cstep .5s cubic-bezier(.2,1.8,.4,1)}
.rg .combo.late .x{animation:rg-late .32s ease-in-out infinite alternate}
@keyframes rg-cstep{0%{transform:scale(.3) rotate(-25deg)}55%{transform:scale(calc(var(--cs)*1.4)) rotate(8deg)}100%{transform:scale(var(--cs))}}
@keyframes rg-late{to{opacity:.35}}

/* ---------- mission cards ---------- */
.rg .missions{position:absolute;right:calc(var(--u)*2.4);top:calc(var(--u)*13.4);display:none;flex-direction:column;gap:calc(var(--u)*1.1);align-items:stretch}
.rg .missions.on{display:flex}
.rg .mcard{position:relative;display:flex;align-items:center;gap:calc(var(--u)*.9);padding:calc(var(--u)*.5) calc(var(--u)*.8) calc(var(--u)*1) calc(var(--u)*.5);
  min-width:calc(var(--u)*19);background:linear-gradient(180deg,#1f2650e6,#0b0f22e6);border:calc(var(--u)*.45) solid #fff;border-radius:calc(var(--u)*2);
  box-shadow:0 0 0 calc(var(--u)*.35) #000,0 calc(var(--u)*.5) calc(var(--u)*1.2) rgba(0,0,0,.45);font-size:calc(var(--u)*2.9);font-variant-numeric:tabular-nums}
.rg .mcard .mi{flex:none;width:calc(var(--u)*4.6);height:calc(var(--u)*4.6);display:flex;align-items:center;justify-content:center;border-radius:calc(var(--u)*1.2);background:#ffffff1f}
.rg .mcard .mi .ic{font-size:calc(var(--u)*3.7);color:var(--y)}
.rg .mcard .mt{flex:1}
.rg .mcard .rw{display:inline-flex;align-items:center;gap:.1em;padding:.05em .4em .05em .2em;border-radius:1em;background:linear-gradient(180deg,#ffe97a,var(--y));color:#15110a;
  border:calc(var(--u)*.3) solid #000;font-size:.82em}
.rg .mcard .rw .ic{color:#15110a;--out:#fff;font-size:1.05em}
.rg .mcard .bar{position:absolute;left:calc(var(--u)*1);right:calc(var(--u)*1);bottom:calc(var(--u)*.35);height:calc(var(--u)*.55);border-radius:1em;background:#ffffff2e}
.rg .mcard .bar i{display:block;height:100%;width:var(--p);border-radius:inherit;background:#fff;transition:width .3s}
.rg .mcard .stamp{position:absolute;right:calc(var(--u)*-1.5);top:calc(var(--u)*-1.5);width:calc(var(--u)*4.2);height:calc(var(--u)*4.2);display:none;border-radius:50%;
  background:var(--y);border:calc(var(--u)*.4) solid #000;padding:calc(var(--u)*.45)}
.rg .mcard .stamp .ic{width:100%;height:100%;color:#000;--out:#fff}
.rg .mcard.done{background:linear-gradient(180deg,#fff,#dfe3f5);color:#15110a;border-color:#000;box-shadow:0 0 0 calc(var(--u)*.35) #fff,0 0 calc(var(--u)*2) rgba(255,255,255,.7)}
.rg .mcard.done .t{-webkit-text-stroke:0;text-shadow:none}
.rg .mcard.done .mi{background:#15110a}
.rg .mcard.done .bar{background:#15110a33}
.rg .mcard.done .bar i{background:#15110a}
.rg .mcard.done .stamp{display:block;animation:rg-stamp .55s cubic-bezier(.2,1.8,.4,1) both}
.rg .mcard.tick{animation:rg-mtick .35s ease-out}
.rg .mcard.complete{animation:rg-mdone .85s cubic-bezier(.2,1.6,.4,1)}
@keyframes rg-mtick{40%{transform:scale(1.08)}}
@keyframes rg-mdone{0%{transform:scale(1)}25%{transform:scale(1.28) rotate(-3deg)}50%{transform:scale(.95) rotate(1deg)}100%{transform:scale(1)}}
@keyframes rg-stamp{0%{transform:scale(2.6) rotate(-30deg);opacity:0}100%{transform:scale(1);opacity:1}}

/* ---------- toasts: ticket denied ---------- */
.rg .toast.deny{border-color:#fff}
.rg .toast .need{display:inline-flex;align-items:center;gap:calc(var(--u)*.5);padding:0 calc(var(--u)*1.2) 0 calc(var(--u)*.5);border-radius:2em;background:#ffffff1c;border:calc(var(--u)*.35) dashed #fff}
.rg .toast .need .ic{font-size:1.15em}

/* ---------- moments (HUD, never block play) ---------- */
.rg .moments{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.rg .moment{position:absolute;left:50%;top:36%;width:0;height:0;display:flex;align-items:center;justify-content:center}
.rg .moment .rays{position:absolute;width:calc(var(--u)*40);height:calc(var(--u)*40);border-radius:50%;
  background:repeating-conic-gradient(rgba(255,255,255,.7) 0 8deg,transparent 8deg 22deg);-webkit-mask:${RAYS_MASK};mask:${RAYS_MASK};animation:rg-mrays 2.4s ease-out both}
.rg .moment .badge{position:absolute;width:calc(var(--u)*16);height:calc(var(--u)*16);border-radius:50%;display:flex;align-items:center;justify-content:center;
  background:radial-gradient(circle at 40% 30%,#4654b4,#0d1130 72%);border:calc(var(--u)*.8) solid #fff;
  box-shadow:0 0 0 calc(var(--u)*.6) #000,0 0 calc(var(--u)*4) calc(var(--u)*1) rgba(255,217,59,.8);animation:rg-mbadge 2.4s cubic-bezier(.2,1.5,.4,1) both}
.rg .moment .badge .ic{font-size:calc(var(--u)*10);color:var(--y)}
.rg .moment.unlock{top:34%}
.rg .moment.unlock .badge{width:calc(var(--u)*12);height:calc(var(--u)*12)}
.rg .moment.unlock .badge .ic{font-size:calc(var(--u)*7.4)}
.rg .moment.unlock .rays{width:calc(var(--u)*30);height:calc(var(--u)*30)}
.rg .moment .spk{position:absolute;left:0;top:0;margin:-.5em;font-size:calc(var(--u)*3.4);animation:rg-spk 1.2s ease-out both;animation-delay:var(--dl)}
.rg .moment .spk .ic{color:#fff}
.rg .moment .src{position:absolute;left:calc(var(--u)*3);top:calc(var(--u)*2);font-size:calc(var(--u)*5);animation:rg-mbadge 2.4s cubic-bezier(.2,1.5,.4,1) .12s both}
.rg .moment .src .ic{color:#fff}
.rg .moment .amt{position:absolute;top:calc(var(--u)*8.6);display:flex;align-items:center;gap:calc(var(--u)*.6);font-size:calc(var(--u)*7);white-space:nowrap;animation:rg-mbadge 2.4s cubic-bezier(.2,1.5,.4,1) .2s both}
.rg .moment .amt .ic{color:var(--y);font-size:1.1em}
.rg .moment .amt .t{color:var(--y)}
@keyframes rg-mbadge{0%{transform:scale(0) rotate(-30deg);opacity:0}16%{transform:scale(1.25) rotate(8deg);opacity:1}28%{transform:scale(1) rotate(0)}82%{transform:scale(1);opacity:1}100%{transform:scale(.6) translateY(calc(var(--u)*-6));opacity:0}}
@keyframes rg-mrays{0%{transform:scale(0) rotate(0);opacity:0}20%{opacity:1}100%{transform:scale(1.25) rotate(110deg);opacity:0}}
@keyframes rg-spk{0%{transform:rotate(var(--a)) translateX(calc(var(--u)*4)) scale(0);opacity:1}55%{opacity:1}100%{transform:rotate(var(--a)) translateX(calc(var(--u)*17)) scale(1.1);opacity:0}}
.rg .flygem{position:absolute;font-size:calc(var(--u)*3.6);margin:-.5em 0 0 -.5em;line-height:0;animation:rg-fly .85s cubic-bezier(.55,0,.75,.45) both}
.rg .flygem .ic{color:var(--y);filter:drop-shadow(0 0 calc(var(--u)*.6) #fff)}
@keyframes rg-fly{0%{transform:translate(0,0) scale(.3);opacity:0}15%{transform:translate(0,calc(var(--u)*-3)) scale(1.4);opacity:1}100%{transform:translate(var(--dx),var(--dy)) scale(.7);opacity:.9}}

/* ---------- title wallet ---------- */
.rg .titlew{position:absolute;left:calc(var(--u)*3);top:calc(var(--u)*3);font-size:calc(var(--u)*4.4)}

/* ---------- pause: wardrobe tile ---------- */
.rg .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:calc(var(--u)*2)}
.rg .pausep .grid3 .tile{min-width:calc(var(--u)*18);min-height:calc(var(--u)*14.5)}
.rg .pausep .grid3 .tile.main{grid-column:1/3;min-height:calc(var(--u)*15)}

/* ---------- Gear Shack / wardrobe ---------- */
.rg .shopscr{background:radial-gradient(ellipse at 50% 30%,rgba(30,36,80,.6),rgba(6,8,20,.9))}
.rg .shop{--u:clamp(4.2px,1vmin,20px);width:min(96vw,calc(var(--u)*150));height:min(94vh,calc(var(--u)*92));display:flex;flex-direction:column;
  padding:calc(var(--u)*1.6) calc(var(--u)*2);position:relative;overflow:hidden;font-size:calc(var(--u)*2.8)}
.rg .shop::before{content:'';position:absolute;left:0;right:0;top:0;height:calc(var(--u)*11);pointer-events:none;
  background:repeating-linear-gradient(-45deg,#ffffff0d 0 calc(var(--u)*2),transparent calc(var(--u)*2) calc(var(--u)*4))}
.rg .shop .bar{position:relative;display:flex;align-items:center;gap:calc(var(--u)*1.6);margin-bottom:calc(var(--u)*1.4)}
.rg .shop .bar .head{margin:0;font-size:calc(var(--u)*5)}
.rg .shop .bar .head .ic{font-size:1.6em;color:var(--y);filter:drop-shadow(0 calc(var(--u)*.4) 0 #000)}
.rg .shop .stabs .tab{min-width:max(44px,calc(var(--u)*10))!important;min-height:max(44px,calc(var(--u)*8))!important;font-size:calc(var(--u)*4.2);padding:0 calc(var(--u)*1.4)}
.rg .shop .stabs.one{display:none}
.rg .shop .bar .wallet{margin-left:auto;font-size:calc(var(--u)*4.6)}
.rg .shop .close{min-width:max(44px,calc(var(--u)*8))!important;min-height:max(44px,calc(var(--u)*8))!important;font-size:calc(var(--u)*3.6)}
.rg .sgrid{position:relative;flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;display:grid;grid-template-columns:repeat(auto-fill,minmax(calc(var(--u)*21),1fr));
  grid-auto-rows:minmax(calc(var(--u)*26),calc((100% - var(--u)*2.2) / 2));gap:calc(var(--u)*2.2);padding:calc(var(--u)*1.8);margin:0 calc(var(--u)*-.6);align-content:start;scrollbar-width:thin;scrollbar-color:#fff #0b0f22}
.rg .card{flex-direction:column;justify-content:flex-start;gap:calc(var(--u)*.7);min-width:0!important;min-height:0!important;width:100%;height:100%;
  padding:calc(var(--u)*1.2) calc(var(--u)*1) calc(var(--u)*1.2);color:#fff;--out:#000;border-radius:calc(var(--u)*2.4);
  background:linear-gradient(180deg,#2e3768,#151a38);box-shadow:0 0 0 calc(var(--u)*.45) #fff,0 calc(var(--u)*1) 0 calc(var(--u)*.45) #000,inset 0 calc(var(--u)*.3) 0 rgba(255,255,255,.25)}
.rg .card .pv{position:relative;flex:1;min-height:0;width:100%;display:flex;align-items:center;justify-content:center;border-radius:calc(var(--u)*1.6);
  background:radial-gradient(circle at 50% 45%,#ffffff30,#ffffff00 68%)}
.rg .card .pv .ic{position:relative;font-size:calc(var(--u)*10);color:#fff;filter:drop-shadow(0 calc(var(--u)*.5) 0 #000);transition:transform .15s}
.rg .card:hover .pv .ic,.rg.nav-kb .card:focus .pv .ic{transform:scale(1.12) rotate(-4deg)}
.rg .card .pv .sw{position:absolute;width:calc(var(--u)*12.5);height:calc(var(--u)*12.5);border-radius:50%;background:var(--sw);
  border:calc(var(--u)*.5) solid #000;box-shadow:0 0 0 calc(var(--u)*.4) #fff,inset 0 calc(var(--u)*-1.2) 0 #0005,inset 0 calc(var(--u)*1) 0 #fff6}
.rg .card .price{position:relative;display:inline-flex;align-items:center;gap:.2em;padding:calc(var(--u)*.25) calc(var(--u)*1.5) calc(var(--u)*.25) calc(var(--u)*1);border-radius:2em;
  background:linear-gradient(180deg,#ffe97a,var(--y) 55%,#f2b400);color:#15110a;border:calc(var(--u)*.4) solid #000;font-size:calc(var(--u)*3.4);font-variant-numeric:tabular-nums;overflow:hidden}
.rg .card .price .ic{color:#15110a;--out:#fff;font-size:1.1em}
.rg .card .price.poor{background:#0b0f22;color:#fff;border:calc(var(--u)*.35) dashed #fff}
.rg .card .price.poor .ic{color:#fff;--out:#000}
.rg .card .price .prog{position:absolute;left:0;bottom:0;height:calc(var(--u)*.7);width:var(--p);background:#fff}
.rg .card .price.chest{background:#0b0f22;color:#fff;border:calc(var(--u)*.4) solid #fff;padding:calc(var(--u)*.25) calc(var(--u)*1.6)}
.rg .card .price.chest .ic{color:#fff;--out:#000;font-size:1.25em}
.rg .card.s-poor{background:linear-gradient(180deg,#1b2042,#0e1228)}
.rg .card.s-poor .pv .ic,.rg .card.s-poor .pv .sw{opacity:.42;filter:grayscale(1)}
.rg .card .miss{position:absolute;left:calc(var(--u)*1.2);top:calc(var(--u)*1);display:inline-flex;align-items:center;gap:.1em;font-size:calc(var(--u)*2.8)}
.rg .card .miss .ic{color:#fff;font-size:1.1em}
.rg .card.s-chest .pv .ic{color:#2a3060;--out:#fff;filter:drop-shadow(0 0 calc(var(--u)*1) #ffffff80)}
.rg .card.s-chest .pv .sw{opacity:.25}
.rg .card.s-owned{background:linear-gradient(180deg,#46528e,#222a55)}
.rg .card .own{position:absolute;right:calc(var(--u)*-1.2);top:calc(var(--u)*-1.2);width:calc(var(--u)*5.2);height:calc(var(--u)*5.2);border-radius:50%;background:#fff;
  border:calc(var(--u)*.45) solid #000;padding:calc(var(--u)*.7);line-height:0}
.rg .card .own .ic{width:100%;height:100%;color:#000;--out:#fff}
.rg .card.s-equipped{background:linear-gradient(180deg,#fff3a8,var(--y) 50%,#f2b400);color:#15110a;
  box-shadow:0 0 0 calc(var(--u)*.6) #fff,0 0 0 calc(var(--u)*1.4) #000,0 0 calc(var(--u)*3.4) calc(var(--u)*1.2) rgba(255,236,150,.9)}
.rg .card.s-equipped .pv{background:radial-gradient(circle at 50% 45%,#ffffffb0,#ffffff00 70%)}
.rg .card.s-equipped .pv .ic{color:#15110a;--out:#fff;filter:drop-shadow(0 calc(var(--u)*.5) 0 #0006)}
.rg .card .ribbon{position:absolute;left:50%;bottom:calc(var(--u)*-1.6);transform:translateX(-50%);display:flex;align-items:center;justify-content:center;
  width:calc(var(--u)*9);height:calc(var(--u)*4.6);border-radius:2em;background:#15110a;border:calc(var(--u)*.45) solid #fff;box-shadow:0 0 0 calc(var(--u)*.35) #000}
.rg .card .ribbon .ic{font-size:calc(var(--u)*3.4);color:#fff;--out:#000}
.rg .card.bought{animation:rg-cbought .7s cubic-bezier(.2,1.6,.4,1)}
.rg .card.wear{animation:rg-pop .45s cubic-bezier(.2,1.6,.4,1)}
.rg .card.off{animation:rg-cdip .3s ease-out}
.rg .card.shake{animation:rg-shake .4s}
@keyframes rg-cbought{0%{transform:scale(.6)}50%{transform:scale(1.15) rotate(3deg)}100%{transform:scale(1)}}
@keyframes rg-cdip{40%{transform:scale(.9)}}
.rg .sgrid .empty{grid-column:1/-1;grid-row:span 2;display:flex;gap:calc(var(--u)*3);justify-content:center;align-items:center;font-size:calc(var(--u)*12);opacity:.45}
.rg .sgrid.wardrobe{display:flex;flex-flow:row wrap;align-content:flex-start;gap:calc(var(--u)*2) calc(var(--u)*4)}
.rg .wrow{display:flex;align-items:center;gap:calc(var(--u)*1.6);flex:none;padding:calc(var(--u)*1) calc(var(--u)*1.6) calc(var(--u)*1) calc(var(--u)*1);border-radius:calc(var(--u)*3);background:#ffffff0f;border:calc(var(--u)*.3) solid #ffffff26}
.rg .wrow .slot{flex:none;width:calc(var(--u)*7.4);height:calc(var(--u)*7.4);border-radius:50%;display:flex;align-items:center;justify-content:center;background:#ffffff1a;border:calc(var(--u)*.4) solid #ffffff70}
.rg .wrow .slot .ic{font-size:calc(var(--u)*4.6);color:var(--y)}
.rg .wcards{display:flex;gap:calc(var(--u)*2.2);flex-wrap:wrap;min-width:0;padding:calc(var(--u)*.6) 0 calc(var(--u)*1.8)}
.rg .wcards .card{width:calc(var(--u)*19);height:calc(var(--u)*19)}
.rg .wcards .card .pv .ic{font-size:calc(var(--u)*9)}
.rg .wcards .card .pv .sw{width:calc(var(--u)*11);height:calc(var(--u)*11)}

/* the big unlock moment */
.rg .celebrate{position:absolute;inset:0;display:none;align-items:center;justify-content:center;z-index:5;overflow:hidden;cursor:pointer;pointer-events:auto;
  background:radial-gradient(circle,rgba(20,26,60,.6),rgba(6,8,20,.94) 75%);border-radius:inherit}
.rg .celebrate.on{display:flex;animation:rg-fadein .18s ease-out}
@keyframes rg-fadein{from{opacity:0}}
.rg .celebrate .rays{position:absolute;left:50%;top:50%;width:calc(var(--u)*130);height:calc(var(--u)*130);margin:calc(var(--u)*-65) 0 0 calc(var(--u)*-65);border-radius:50%;
  background:repeating-conic-gradient(rgba(255,255,255,.26) 0 7deg,transparent 7deg 20deg);-webkit-mask:${RAYS_MASK};mask:${RAYS_MASK};animation:rg-rin .5s ease-out both,rg-rspin 9s linear infinite}
.rg .celebrate .rays.r2{background:repeating-conic-gradient(rgba(255,236,150,.3) 0 4deg,transparent 4deg 31deg);animation:rg-rin .6s ease-out both,rg-rspin 14s linear infinite reverse}
@keyframes rg-rin{from{transform:scale(0);opacity:0}}
@keyframes rg-rspin{to{rotate:360deg}}
.rg .celebrate .badge{position:relative;width:calc(var(--u)*34);height:calc(var(--u)*34);border-radius:50%;display:flex;align-items:center;justify-content:center;
  background:radial-gradient(circle at 40% 30%,#4c5ac4,#0d1130 72%);border:calc(var(--u)*1.1) solid #fff;
  box-shadow:0 0 0 calc(var(--u)*.9) #000,0 0 calc(var(--u)*8) calc(var(--u)*2.4) rgba(255,236,150,.85),inset 0 calc(var(--u)*1) 0 #ffffff40;animation:rg-burst .85s cubic-bezier(.2,1.6,.35,1) both}
.rg .celebrate .badge .ic{position:relative;font-size:calc(var(--u)*21);color:var(--y);filter:drop-shadow(0 calc(var(--u)*.8) 0 #000);animation:rg-wig 1.1s ease-in-out .85s infinite}
.rg .celebrate .badge .sw{position:absolute;inset:16%;border-radius:50%;background:var(--sw);border:calc(var(--u)*.7) solid #000;box-shadow:0 0 0 calc(var(--u)*.5) #fff}
@keyframes rg-burst{0%{transform:scale(0) rotate(-200deg)}60%{transform:scale(1.2) rotate(10deg)}100%{transform:scale(1) rotate(0)}}
@keyframes rg-wig{50%{transform:scale(1.08) rotate(-6deg)}}
.rg .celebrate .cf{position:absolute;left:50%;top:50%;width:calc(var(--u)*1.7);height:calc(var(--u)*2.8);margin:calc(var(--u)*-1.4) 0 0 calc(var(--u)*-.85);background:var(--c);border-radius:20%;
  box-shadow:0 0 0 1px #0007;animation:rg-cf 1.5s cubic-bezier(.1,.8,.3,1) both;animation-delay:var(--dl)}
@keyframes rg-cf{0%{transform:rotate(var(--a)) translateY(0) scale(0)}25%{opacity:1}100%{transform:rotate(var(--a)) translateY(calc(var(--r)*-1)) rotate(600deg) scale(var(--s));opacity:0}}
.rg .celebrate .spk{position:absolute;left:50%;top:50%;margin:-.5em;font-size:calc(var(--u)*5.4);line-height:0;animation:rg-spk2 1.2s ease-out both;animation-delay:var(--dl)}
.rg .celebrate .spk .ic{color:#fff}
@keyframes rg-spk2{0%{transform:rotate(var(--a)) translateX(calc(var(--u)*10)) scale(0)}50%{opacity:1;transform:rotate(var(--a)) translateX(calc(var(--u)*26)) scale(1.3)}100%{opacity:0;transform:rotate(var(--a)) translateX(calc(var(--u)*32)) scale(.3)}}
.rg .celebrate .worn{position:absolute;left:calc(50% + var(--u)*8.5);top:calc(50% + var(--u)*8.5);width:calc(var(--u)*10);height:calc(var(--u)*10);border-radius:50%;background:var(--y);
  border:calc(var(--u)*.8) solid #000;box-shadow:0 0 0 calc(var(--u)*.6) #fff;padding:calc(var(--u)*1.4);line-height:0;animation:rg-stamp .5s cubic-bezier(.2,1.8,.4,1) .75s both}
.rg .celebrate .worn .ic{width:100%;height:100%;color:#000;--out:#fff}

/* ---------- end screen: missions, jackpot, unlocked ---------- */
.rg .stickers.econ{display:none;gap:calc(var(--u)*2);flex-wrap:nowrap}
.rg .stickers.econ.on{display:flex}
.rg .stickers.econ .grp{display:flex;gap:calc(var(--u)*1.1);align-items:center;padding:calc(var(--u)*.8) calc(var(--u)*1.1);border-radius:calc(var(--u)*2);background:#ffffff14;border:calc(var(--u)*.3) solid #ffffff30}
.rg .stickers.econ .lbl .ic{font-size:calc(var(--u)*4.2);color:var(--y)}
.rg .stickers.econ .more{font-size:calc(var(--u)*3)}
.rg .stk.mis,.rg .stk.item{position:relative;min-width:calc(var(--u)*8.6);padding:calc(var(--u)*.6) calc(var(--u)*.6);font-size:calc(var(--u)*2.6)}
.rg .stk.mis .ic,.rg .stk.item .ic{font-size:2.1em}
.rg .stk .tick{position:absolute;right:calc(var(--u)*-1.3);top:calc(var(--u)*-1.3);width:calc(var(--u)*3.8);height:calc(var(--u)*3.8);background:var(--y);border-radius:50%;border:calc(var(--u)*.4) solid #000;padding:calc(var(--u)*.45);line-height:0}
.rg .stk .tick .ic{width:100%;height:100%;font-size:inherit;color:#000;--out:#fff}
.rg .stk.jp.earned{background:linear-gradient(180deg,#fff3a8,var(--y))}
.rg .stk .sm.wal{margin-top:calc(var(--u)*.2);padding:0 .4em;border-radius:1em;background:#15110a;color:#fff;--out:#000}
.rg .stk .sm.wal .ic{color:var(--y)}
.rg .endp{gap:calc(var(--u)*1.3);padding:calc(var(--u)*2) calc(var(--u)*2.6)}
.rg .endp .burst{font-size:calc(var(--u)*4.4)}
.rg .endp .stk.big{flex-direction:row;flex-wrap:wrap;gap:0 calc(var(--u)*.8);min-width:calc(var(--u)*17);padding:calc(var(--u)*.8) calc(var(--u)*1.4);font-size:calc(var(--u)*4.4)}
.rg .endp .stk.big>.ic{font-size:1.6em}
.rg .endp .stk .sm.wal{flex-basis:100%;justify-content:center;font-size:.6em}
.rg .endp .stickers.small .stk{padding:calc(var(--u)*.5) calc(var(--u)*.5)}
.rg .endp .stickers.small .stk .ic{font-size:1.9em}
.rg .endp .btnrow{margin-top:0}
.rg .endp .btnrow .play{min-height:calc(var(--u)*11.5);font-size:calc(var(--u)*4.8)}

/* ---------- settings: hold-to-reset profile ---------- */
.rg .holdbar{overflow:hidden;isolation:isolate}
.rg .holdbar .fill{position:absolute;left:0;top:0;bottom:0;width:var(--p,0%);background:linear-gradient(180deg,#ffe97a,var(--y));z-index:-1}
.rg .holdbar .ic{font-size:1.2em}
.rg .holdbar.done{background:linear-gradient(180deg,#fff,#d9dcef)}
.rg .holdbar.done .ic{color:#15110a;--out:#fff}
`;
