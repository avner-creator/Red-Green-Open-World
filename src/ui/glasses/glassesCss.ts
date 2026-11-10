/** CSS for the grown-up glasses pieces (Auto challenge row, Session summary). Injected once. */
export const GLASSES_CSS = `
.rg .glsum{--u:clamp(4.2px,1vmin,20px);width:min(96vw,calc(var(--u)*118));max-height:96vh;display:flex;flex-direction:column;padding:calc(var(--u)*1.6) calc(var(--u)*2);font-size:calc(var(--u)*2.8)}
.rg .glsum .bar{display:flex;align-items:center;justify-content:space-between;gap:calc(var(--u)*2);margin-bottom:calc(var(--u)*1.4)}
.rg .glsum .bar .head{margin:0;font-size:calc(var(--u)*3.8)}
.rg .glsum .b{min-height:max(44px,calc(var(--u)*6.4));min-width:max(44px,calc(var(--u)*6.4))}
.rg .glsum .info{display:flex;flex-wrap:wrap;gap:calc(var(--u)*1.6);margin-bottom:calc(var(--u)*1.4)}
.rg .glsum .chip{display:flex;align-items:center;gap:calc(var(--u)*1.2);background:#ffffff1c;border:calc(var(--u)*.4) solid #fff;border-radius:calc(var(--u)*2);padding:calc(var(--u)*.8) calc(var(--u)*1.6);font-size:calc(var(--u)*2.8)}
.rg .glsum .chip .ic{font-size:1.4em;color:var(--y)}
.rg .glsum .chip b{color:var(--y);font-weight:1000}
.rg .glsum .gscroll{overflow-y:auto;overflow-x:hidden;min-height:0;scrollbar-width:thin;scrollbar-color:#fff #0b0f22;pointer-events:auto}
.rg .glsum table{width:100%;border-collapse:separate;border-spacing:0 calc(var(--u)*.5);font-variant-numeric:tabular-nums}
.rg .glsum th{font-weight:1000;text-align:center;padding:calc(var(--u)*.6) calc(var(--u)*.8);color:var(--y);font-size:.9em;white-space:nowrap}
.rg .glsum th.n,.rg .glsum td.n{text-align:left}
.rg .glsum td{text-align:center;padding:calc(var(--u)*.9) calc(var(--u)*.8);background:#ffffff14;border-top:calc(var(--u)*.3) solid #ffffff40;border-bottom:calc(var(--u)*.3) solid #ffffff40;line-height:1.15}
.rg .glsum td.n{border-left:calc(var(--u)*.3) solid #ffffff40;border-radius:calc(var(--u)*1.4) 0 0 calc(var(--u)*1.4);font-size:1em}
.rg .glsum td:last-child{border-right:calc(var(--u)*.3) solid #ffffff40;border-radius:0 calc(var(--u)*1.4) calc(var(--u)*1.4) 0}
.rg .glsum td .pc{display:block;font-size:.78em;color:var(--y);font-weight:800}
.rg .glsum tr.kind td{background:#000;border-color:#fff;border-width:calc(var(--u)*.4);color:var(--y);font-weight:1000;text-align:left;border-radius:calc(var(--u)*1.4);font-size:1em;letter-spacing:.02em}
.rg .glsum tr.tot td{background:#2a3258;border-color:#fff;font-weight:1000}
.rg .glsum .dots{letter-spacing:.1em;margin-left:calc(var(--u)*.4)}
.rg .glsum .empty{display:flex;align-items:center;gap:calc(var(--u)*1.6);justify-content:center;padding:calc(var(--u)*4) calc(var(--u)*2);text-align:center;font-size:calc(var(--u)*3.2)}
.rg .glsum .empty .ic{font-size:1.8em;color:var(--y)}
@media (max-height:460px){.rg .settings .panes .pane{gap:calc(var(--u)*1)}.rg .settings .panes .srow{padding:calc(var(--u)*.7) calc(var(--u)*1.4) calc(var(--u)*.9);gap:calc(var(--u)*.3)}.rg .settings .bar{margin-bottom:calc(var(--u)*.8)}.rg .settings .panes .sl input[type=range]{height:max(28px,calc(var(--u)*3.6))}.rg .settings .panes .srow .b{min-height:max(40px,calc(var(--u)*5.6))}}
.rg .srow.gl .sub{margin-top:calc(var(--u)*.5);line-height:1.25;font-size:.6em}
.rg .srow.gl .choices{margin-top:calc(var(--u)*.6)}
.rg .srow .b[aria-pressed] .onoff{min-width:2.4ch;text-align:center}
`;

let injected = false;
export function injectGlassesCss(): void {
  if (injected && document.getElementById('rg-glasses-css')) return;
  injected = true;
  const el = document.createElement('style');
  el.id = 'rg-glasses-css';
  el.textContent = GLASSES_CSS;
  document.head.appendChild(el);
}
