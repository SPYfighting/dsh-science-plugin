export const RESEARCH_RAIL_CSS = `
.sci-rs.sci-quick{display:grid;align-content:start;gap:1rem;min-width:0;padding:12px 12px 24px;font-size:.8125rem}
.sci-rs *{min-width:0}
.sci-rs :is(h2,h3,p){margin:0;overflow-wrap:anywhere}
.sci-rs button,.sci-rs a,.sci-rs summary{font:inherit}
.sci-rs :is(button,a,summary):focus-visible{outline:2px solid var(--sci-accent);outline-offset:2px}
.sci-rs-mast,.sci-rs-head,.sci-rs-kicker,.sci-rs-card-footer,.sci-rs-meta{display:flex;align-items:center;gap:7px}
.sci-rs-mast{justify-content:space-between;flex-wrap:wrap;padding:0 2px}
.sci-rs-mast h2{font-size:1rem;font-weight:700;color:var(--sci-fg)}
.sci-rs-mark,.sci-rs-icon{display:inline-grid;place-items:center;flex:none;width:28px;height:28px;border-radius:9px;color:var(--sci-accent);background:color-mix(in srgb,var(--sci-accent) 13%,transparent)}
.sci-rs-section,.sci-rs-stack{display:grid;gap:8px}
.sci-rs-head{width:100%;border:0;border-radius:7px;background:transparent;color:inherit;cursor:pointer;text-align:left;font-weight:700!important;padding:4px 3px}
.sci-rs-head:hover{background:var(--sci-raised)}
.sci-rs-count{margin-left:auto;background:var(--sci-raised);border-radius:999px;padding:0 7px;color:var(--sci-muted);font-variant-numeric:tabular-nums}
.sci-rs-chevron{color:var(--sci-muted);display:inline-flex;flex:none}
.sci-rs-head[aria-expanded=true] .sci-rs-chevron{transform:rotate(90deg)}
.sci-rs-card{display:grid;gap:8px;padding:11px 12px;border:1px solid var(--sci-border);border-radius:12px;background:var(--sci-card)}
.sci-rs-card[data-variant=project]{gap:10px;padding:13px;border-color:color-mix(in srgb,var(--sci-accent) 30%,var(--sci-border));background:linear-gradient(145deg,color-mix(in srgb,var(--sci-accent) 10%,transparent),transparent 80%),var(--sci-card)}
.sci-rs-card[data-variant=attention]{border-inline-start:3px solid var(--sci-warn)}
.sci-rs-card[data-variant=attention] .sci-rs-icon{color:var(--sci-warn);background:color-mix(in srgb,var(--sci-warn) 14%,transparent)}
.sci-rs-card[data-variant=problem]{border-inline-start:3px solid var(--sci-bad)}
.sci-rs-kicker{color:var(--sci-muted);font-size:.75rem;font-weight:600;flex-wrap:wrap;overflow-wrap:anywhere}
.sci-rs-kicker .sci-rs-pill{margin-inline-start:auto}
.sci-rs-card h3{font-size:.875rem;font-weight:700;line-height:1.4}
.sci-rs-card[data-variant=project] h3{font-size:1.125rem;letter-spacing:-.015em}
.sci-rs-copy,.sci-rs-meta,.sci-rs-empty{color:var(--sci-muted);overflow-wrap:anywhere}
.sci-rs-meta{flex-wrap:wrap;font-size:.75rem;font-variant-numeric:tabular-nums}
.sci-rs-meta span+span::before{content:'·';margin-inline-end:7px}
.sci-rs-pill{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:2px 7px;background:var(--sci-raised);color:var(--sci-fg);font-size:.6875rem;font-weight:650}
.sci-rs-pill::before{content:'';width:6px;height:6px;flex:none;border-radius:50%;background:var(--sci-muted)}
.sci-rs-pill[data-tone=good]::before{background:var(--sci-good)}
.sci-rs-pill[data-tone=warn]::before{background:var(--sci-warn)}
.sci-rs-pill[data-tone=bad]::before{background:var(--sci-bad)}
.sci-rs-pill[data-tone=good]{background:color-mix(in srgb,var(--sci-good) 12%,transparent)}
.sci-rs-pill[data-tone=warn]{background:color-mix(in srgb,var(--sci-warn) 14%,transparent)}
.sci-rs-pill[data-tone=bad]{background:color-mix(in srgb,var(--sci-bad) 12%,transparent)}
.sci-rs-next{padding:7px 9px;border-radius:7px;background:var(--sci-raised);color:var(--sci-fg);overflow-wrap:anywhere}
.sci-rs-next b{display:block;font-size:.6875rem;margin-bottom:2px}
.sci-rs-card-footer{flex-wrap:wrap;padding-top:3px}
.sci-rs .sci-rs-action{display:inline-flex;align-items:center;gap:6px;max-width:100%;border:1px solid var(--sci-border);border-radius:8px;background:transparent;color:var(--sci-fg);padding:5px 8px;min-height:28px;text-align:left;text-decoration:none;overflow-wrap:anywhere;cursor:pointer}
.sci-rs .sci-rs-action[data-primary=true]{background:color-mix(in srgb,var(--sci-accent) 15%,var(--sci-card));border-color:color-mix(in srgb,var(--sci-accent) 40%,var(--sci-border));font-weight:650}
.sci-rs .sci-rs-action:hover:not(:disabled),.sci-rs-more:hover{background:var(--sci-raised)}
.sci-rs .sci-rs-action:disabled{opacity:.55;cursor:default}
.sci-rs-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,3.4rem),1fr));gap:5px;margin:0}
.sci-rs-stats div{display:flex;flex-direction:column-reverse;align-items:flex-start;gap:2px;border-radius:7px;background:color-mix(in srgb,var(--sci-card) 65%,transparent);padding:5px 7px}
.sci-rs-stats dt{font-size:.6875rem;color:var(--sci-muted);overflow-wrap:anywhere}
.sci-rs-stats dd{margin:0;font-size:1rem;font-weight:700;line-height:1.1;font-variant-numeric:tabular-nums}
.sci-rs-empty{border:1px dashed var(--sci-border);border-radius:10px;padding:9px 11px}
.sci-rs-skills{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,6.2rem),1fr));gap:7px}
.sci-rs-skills .sci-rs-action{min-height:35px}
.sci-rs-details{overflow-wrap:anywhere;color:var(--sci-muted)}
.sci-rs-details summary,.sci-rs-more{cursor:pointer;color:var(--sci-fg);border-radius:7px}
.sci-rs-details[open] summary{margin-bottom:5px}
.sci-rs-excerpt{color:var(--sci-muted)}
.sci-rs-expand,.sci-rs-collapse{white-space:nowrap}
.sci-rs-details:not([open]) .sci-rs-collapse,.sci-rs-details[open] :is(.sci-rs-excerpt,.sci-rs-expand){display:none}
.sci-rs-more{padding:5px 8px;background:transparent;border:1px dashed var(--sci-border);text-align:center}
.sci-rs-figure{display:block;width:100%;height:95px;object-fit:contain;background:var(--sci-raised);border-radius:7px}
.sci-rs{--rd-ink:var(--dsw-alias-label-primary,CanvasText);--rd-card:var(--dsw-alias-bg-layer-1,Canvas);--rd-line:color-mix(in srgb,var(--rd-ink) 12%,transparent)}
.sci-rs .sci-rs-card{border-color:var(--rd-line);background:var(--rd-card);border-radius:14px}
.sci-rs .sci-rs-card[data-variant=attention]{border-inline-start-width:1px}
.sci-rs .sci-rs-card[data-variant=project]{background:radial-gradient(ellipse at 100% 10%,color-mix(in srgb,#a899d9 20%,transparent),transparent 74%),radial-gradient(ellipse at 80% 100%,color-mix(in srgb,#92b7b0 18%,transparent),transparent 77%),var(--rd-card);padding:16px}
.sci-rs .sci-rs-hero h3{font-size:1.45rem;font-weight:500;line-height:1.22}
.sci-rs-stage{margin-inline-start:auto;font-weight:500}
.sci-rs-switch{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:3px;padding:4px;border:1px solid var(--rd-line);border-radius:11px;background:var(--rd-card)}
.sci-rs-switch button{border:0;border-radius:7px;padding:5px 2px;background:transparent;color:var(--sci-muted);cursor:pointer;transition:background 160ms,color 160ms;overflow-wrap:anywhere}
.sci-rs-switch button[aria-pressed=true],.sci-rs .sci-rs-action[data-primary=true]{background:var(--rd-ink);color:var(--rd-card);border-color:transparent}
.sci-rs .sci-rs-action[data-primary=true]:hover:not(:disabled){background:color-mix(in srgb,var(--rd-ink) 84%,var(--rd-card))}
.sci-rs .sci-rs-action{border-radius:999px;transition:background 160ms,transform 180ms}
.sci-rs .sci-rs-action:active:not(:disabled){transform:scale(.97)}
.sci-rs-kicker .sci-rs-icon{width:21px;height:21px;color:inherit;background:transparent}
.sci-rs-preview{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.sci-rs-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--sci-muted);font-size:.75rem}
.sci-rs-heading h3{color:var(--rd-ink);font-size:.85rem}
.sci-rs-text-button{display:inline-flex;align-items:center;gap:5px;justify-self:start;border:0;border-radius:6px;color:var(--sci-muted);background:transparent;padding:2px 4px;cursor:pointer;text-align:left}
.sci-rs-text-button:hover{background:var(--sci-raised)}
.sci-rs-stats div{padding:3px 4px;background:none}
.sci-rs-stats dd{font:400 1.28rem/1 Georgia,serif}
.sci-rs-activity .sci-rs-copy{padding:6px 8px;background:color-mix(in srgb,var(--rs-module-color,#3b9b87) 9%,var(--rd-card));border-radius:8px}
.sci-rs .sci-rs-card{transition:border-color 180ms,box-shadow 180ms}
@media(hover:hover){.sci-rs .sci-rs-card:focus-within,.sci-rs .sci-rs-card:hover{border-color:color-mix(in srgb,var(--rd-ink) 22%,transparent);box-shadow:0 3px 12px #0000000b}}
@media(prefers-reduced-motion:reduce){.sci-rs :is(button,a){transition:none;transform:none!important}}
.sci-rs [data-kind=project]{--rs-module-color:#8772ce}
.sci-rs [data-kind=paper]{--rs-module-color:#5a8dcd}
.sci-rs [data-kind=team]{--rs-module-color:#3b9b87}
.sci-rs [data-kind=figure]{--rs-module-color:#bc77a0}
.sci-rs [data-kind=alert]{--rs-module-color:#c48c4d}
.sci-rs [data-kind=explore]{--rs-module-color:#8772ce}
.sci-rs-module-title{display:flex;align-items:center;gap:8px}
.sci-rs-module-mark{position:relative;display:inline-grid;place-items:center;flex:none;width:36px;height:36px;border-radius:13px;background:linear-gradient(145deg,color-mix(in srgb,var(--rs-module-color) 26%,var(--rd-card)),color-mix(in srgb,var(--rs-module-color) 10%,var(--rd-card)));color:color-mix(in srgb,var(--rs-module-color) 70%,var(--rd-ink))}
.sci-rs-module-mark[data-compact=true]{width:29px;height:29px;border-radius:10px}
.sci-rs .sci-rs-switch{border:0;gap:5px;background:transparent;padding:0}
.sci-rs .sci-rs-switch button{display:grid;justify-items:center;align-content:start;gap:4px;padding:5px 2px 6px;border-radius:12px;color:var(--rd-ink);background:var(--rd-card);font-size:.75rem;box-shadow:0 1px 3px #0000000a}
.sci-rs .sci-rs-switch button:hover{background:var(--sci-raised)}
.sci-rs .sci-rs-switch button[aria-pressed=true]{background:var(--rd-ink);color:var(--rd-card)}
.sci-rs .sci-rs-module{padding:8px;border-radius:17px;background:color-mix(in srgb,var(--rs-module-color) 10%,var(--rd-card));gap:8px}
.sci-rs .sci-rs-module .sci-rs-card{border-color:transparent;background:var(--rd-card)}
.sci-rs .sci-rs-module .sci-rs-heading{padding:0 3px}
.sci-rs .sci-rs-head{gap:8px}
.sci-rs .sci-rs-hero h3,.sci-desk .sci-desk-hero h1{letter-spacing:normal}
/* 目录页在右栏也要卡片化：ProjectCatalog 的 sci-catalog* 规则原本只在完整工作台注入。 */
.sci-rs .sci-catalog{display:grid;gap:10px}
.sci-rs .sci-catalog-head h2{margin:2px 0 0;font-size:1.05rem;font-weight:600;color:var(--sci-fg)}
.sci-rs .sci-catalog-head p:last-child{color:var(--sci-muted);font-size:.75rem;line-height:1.6}
.sci-rs .sci-catalog-grid{display:grid;grid-template-columns:1fr;gap:10px}
.sci-rs .sci-catalog-card{display:grid;gap:7px;padding:12px;border:1px solid var(--sci-line);border-radius:14px;background:var(--sci-raised)}
.sci-rs .sci-catalog-card header{display:flex;justify-content:space-between;gap:8px;color:var(--sci-muted);font-size:.7rem}
.sci-rs .sci-catalog-card h3{margin:0;font-size:.9rem;line-height:1.4;color:var(--sci-fg)}
.sci-rs .sci-catalog-card p,.sci-rs .sci-catalog-card dd{margin:0;font-size:.75rem;line-height:1.55}
.sci-rs .sci-catalog-card dl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:0}
.sci-rs .sci-catalog-card dt{color:var(--sci-muted);font-size:.7rem}
.sci-rs .sci-catalog-card dd{font-variant-numeric:tabular-nums;font-weight:600}
.sci-rs .sci-rs-back{display:inline-flex;align-items:center;gap:6px;align-self:flex-start;padding:4px 10px;border-radius:9px;border:1px solid var(--sci-line);background:var(--sci-raised);color:var(--sci-fg);font-size:.75rem;cursor:pointer}
`
