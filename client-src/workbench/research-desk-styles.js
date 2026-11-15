export const RESEARCH_DESK_CSS = `
.sci-desk,.sci-rs{--rd-ink:var(--dsw-alias-label-primary,CanvasText);--rd-muted:var(--dsw-alias-label-secondary,GrayText);--rd-line:color-mix(in srgb,var(--rd-ink) 12%,transparent);--rd-card:var(--dsw-alias-bg-layer-1,Canvas);--rd-ease:cubic-bezier(.2,.75,.24,1)}
.sci-desk .sci-wb-shell{padding:20px clamp(16px,3.3vw,48px) 40px}
.sci-desk .sci-wb-header{max-width:1240px;flex-wrap:wrap;gap:12px;margin-bottom:25px}
.sci-desk .sci-wb-brand{font-weight:650;gap:8px}
.sci-desk .sci-wb-mark{color:var(--rd-ink);background:transparent;width:27px;height:30px}
.sci-desk .sci-wb-nav{margin:0;border-color:var(--rd-line);background:var(--rd-card);border-radius:13px;flex-wrap:wrap;overflow:visible}
.sci-desk .sci-wb-nav button{padding:6px 12px;min-height:32px;font-weight:550}
.sci-desk .sci-wb-nav button[aria-current=page]{background:var(--rd-ink);color:var(--rd-card)}
.sci-desk .sci-wb-content{max-width:1240px}
.sci-desk-page-head{padding:8px 2px 12px;overflow-wrap:anywhere}
.sci-desk-page-head h1{font-size:1.85rem;font-weight:500;letter-spacing:-.025em;margin:0}
.sci-desk-page-head p{color:var(--rd-muted);margin:4px 0 0}
.sci-desk-section-title{font-size:1rem;margin:0;padding:6px 2px 2px}
.sci-desk-section-title small{margin-inline-start:4px;color:var(--rd-muted);font-weight:400}
.sci-desk .sci-desk-scene{animation:sci-desk-arrive 280ms var(--rd-ease) both}
@keyframes sci-desk-arrive{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.sci-desk .sci-panel,.sci-desk .sci-result-card,.sci-desk .sci-member,.sci-desk .sci-expert-card,.sci-desk .sci-figure{border-radius:16px;border-color:var(--rd-line);background:var(--rd-card)}
.sci-desk .sci-button{border-radius:999px;transition:background 150ms,transform 180ms var(--rd-ease);white-space:normal}
.sci-desk .sci-button-primary{background:var(--rd-ink);color:var(--rd-card);border-color:transparent}
.sci-desk .sci-button-primary:hover:not(:disabled){background:color-mix(in srgb,var(--rd-ink) 85%,var(--rd-card))}
.sci-desk .sci-button:active:not(:disabled){transform:scale(.97)}
.sci-desk :is(button,a):focus-visible{outline:2px solid var(--sci-accent);outline-offset:3px}
.sci-desk-overview{display:grid;gap:14px}
.sci-desk-hero{border:1px solid var(--rd-line);border-radius:22px;padding:clamp(22px,4.7vw,62px);background:radial-gradient(ellipse at 100% 15%,color-mix(in srgb,#a899d9 19%,transparent),transparent 61%),radial-gradient(ellipse at 92% 100%,color-mix(in srgb,#92b7b0 20%,transparent),transparent 65%),var(--rd-card);overflow-wrap:anywhere}
.sci-desk-eyebrow,.sci-desk-tile-top{font-size:.75rem;color:var(--rd-muted);font-weight:600}
.sci-desk-hero h1{font-size:clamp(1.7rem,4.25vw,3.15rem);font-weight:500;line-height:1.24;margin:10px 0}
.sci-desk-hero p{max-width:62ch;margin:0;color:var(--rd-muted);line-height:1.7;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}
.sci-desk-hero[data-active=true]{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,.44fr);align-items:end;gap:clamp(18px,4vw,54px)}
.sci-desk-brief{background:color-mix(in srgb,var(--rd-card) 78%,transparent);border:1px solid var(--rd-line);border-radius:16px;padding:16px;box-shadow:0 8px 24px #00000008}
.sci-desk-brief h2{font-size:1.12rem;margin:4px 0;font-weight:600}
.sci-desk-brief .sci-button{margin-top:8px}
.sci-desk-metrics{display:flex;flex-wrap:wrap;gap:14px clamp(18px,4vw,46px);margin:24px 0 0}
.sci-desk-metrics div{display:flex;flex-direction:column-reverse;gap:2px}
.sci-desk-metrics dt{font-size:.75rem;color:var(--rd-muted)}
.sci-desk-metrics dd{font:400 1.85rem/1 Georgia,serif;font-variant-numeric:tabular-nums;margin:0}
.sci-desk-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:21px}
.sci-desk-grid,.sci-catalog-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,235px),1fr));gap:14px}
.sci-catalog{display:grid;gap:16px}
.sci-catalog-head h2{margin:4px 0 0;font-size:1.6rem;font-weight:560}
.sci-catalog-head p:last-child{color:var(--rd-muted);max-width:62ch}
.sci-catalog-card{display:grid;gap:8px;padding:16px;border:1px solid var(--rd-line);border-radius:16px;background:var(--rd-card)}
.sci-catalog-card header{display:flex;justify-content:space-between;color:var(--rd-muted);font-size:.75rem}
.sci-catalog-card h3{margin:0;font-size:1.05rem}
.sci-catalog-card p,.sci-catalog-card dd{margin:0}
.sci-catalog-card dl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.sci-catalog-card dt{color:var(--rd-muted);font-size:.75rem}
.sci-desk-tile{display:flex;flex-direction:column;align-items:stretch;gap:10px;padding:19px;border-radius:17px;border:1px solid var(--rd-line);background:var(--rd-card);overflow-wrap:anywhere;transition:transform 230ms var(--rd-ease),box-shadow 230ms var(--rd-ease)}
.sci-desk-tile-top{display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px}
.sci-desk-tile h2{font-size:1.12rem;line-height:1.35;margin:0;font-weight:620}
.sci-desk-tile p{margin:0;color:var(--rd-muted);display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}
.sci-desk-tile button{align-self:flex-start;margin-top:auto}
.sci-desk-preview{width:100%;height:105px;object-fit:contain;background:var(--sci-raised);border-radius:10px}
.sci-desk-result-preview{margin:0;padding:0;list-style:none}
.sci-desk-result-preview li{display:flex;justify-content:space-between;gap:8px;border-top:1px solid var(--rd-line);padding:6px 0}
.sci-desk-result-preview li span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sci-desk-result-preview small{flex:none;color:var(--rd-muted)}
.sci-desk-progress{display:grid;gap:6px;font-size:.75rem;color:var(--rd-muted)}
.sci-desk-progress progress{width:100%;height:6px;accent-color:var(--sci-accent)}
@media(hover:hover){.sci-desk-tile:hover{transform:translateY(-2px);box-shadow:0 8px 20px #0000000e}}
@media(max-width:760px){.sci-desk-hero[data-active=true]{grid-template-columns:1fr}}
@media(prefers-reduced-motion:reduce){.sci-desk .sci-desk-scene,.sci-desk .sci-button,.sci-desk .sci-desk-tile{animation:none;transition:none;transform:none}}
`
