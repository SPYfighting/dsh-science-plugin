window.__ModuleLoader__.load({ id: "dsh-science-plugin", factory: (require) => {
var module = { exports: {} };
var exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// client-src/index.jsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react15 = __toESM(require("react"), 1);

// client-src/workbench/ResearchWorkbench.jsx
var import_react10 = __toESM(require("react"), 1);

// client-src/workbench/workbench-actions.js
function semanticHandoffOf(action, targetId = null) {
  switch (action) {
    case "explore":
      return { kind: "explore" };
    case "import_results":
      return { kind: "results" };
    case "literature":
      return { kind: "literature" };
    case "generate_structure":
      return { kind: "structure" };
    case "structure":
      return { kind: "structure", target: targetId };
    case "optimize_structure":
      return { kind: "structure", target: targetId && targetId !== "core" ? targetId : null };
    case "refine_tasks":
      return { kind: "explore", target: targetId };
    case "draw":
      return { kind: "draw", target: targetId };
    case "write":
      return { kind: "write" };
    case "slides":
      return { kind: "slides" };
    default:
      return null;
  }
}
async function confirmObjectViaAct({ sessionId, objectId, expectedObjectRevision, expectedHash, expectedRevision, fetchImpl } = {}) {
  const _fetch = fetchImpl || ((url, opts) => fetch(url, opts));
  if (!sessionId) return { ok: false, kind: "no-session", reason: "\u5F53\u524D\u6CA1\u6709\u4F1A\u8BDD\u3002" };
  if (expectedObjectRevision == null) return { ok: false, kind: "stale", reason: "\u7F3A\u5C11\u5BF9\u8C61\u4FEE\u8BA2\u53F7\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5\u3002" };
  if (expectedHash == null || String(expectedHash).trim() === "") return { ok: false, kind: "stale", reason: "\u7F3A\u5C11\u5BF9\u8C61\u5185\u5BB9\u54C8\u5E0C\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5\u3002" };
  if (expectedRevision == null) return { ok: false, kind: "stale", reason: "\u7F3A\u5C11\u9879\u76EE\u4FEE\u8BA2\u53F7\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5\u3002" };
  try {
    const res = await _fetch("/plugins/dsh-science/project/act", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        actionId: "paper.confirm-revision",
        // 稳定幂等键（同一对象修订+内容哈希+项目修订的重试返回原回执，不重复确认）
        commandId: `wb-confirm-${objectId}-r${expectedObjectRevision}-h${String(expectedHash).slice(0, 12)}-p${expectedRevision}`,
        payload: { objectId, expectedObjectRevision, expectedHash },
        expectedRevision
      })
    });
    const body = await res.json().catch(() => null);
    if (res.status === 200 && body && (body.kind === "applied" || body.kind === "already-applied")) {
      return { ok: true, receipt: body.receipt || body };
    }
    if (body && body.kind === "conflict") {
      return { ok: false, kind: "conflict", reason: "\u8BE5\u5BF9\u8C61\u5DF2\u88AB\u4FEE\u6539\uFF08\u65E7\u786E\u8BA4\u5931\u6548\uFF09\uFF1B\u8BF7\u5237\u65B0\u5361\u7247\u540E\u57FA\u4E8E\u65B0\u4FEE\u8BA2\u91CD\u65B0\u786E\u8BA4\u3002" };
    }
    if (body && body.kind === "forbidden") {
      return { ok: false, kind: "forbidden", reason: body.reason || "\u5F53\u524D\u4F1A\u8BDD\u6CA1\u6709\u8BBA\u6587\u5199\u6743\u9650\u3002" };
    }
    return { ok: false, kind: "invalid", reason: body && body.reason || `\u786E\u8BA4\u672A\u6267\u884C\uFF08HTTP ${res.status}\uFF09\u3002` };
  } catch (err) {
    return { ok: false, kind: "network", reason: `\u7F51\u7EDC\u9519\u8BEF\uFF1A${err && err.message || "unknown"}` };
  }
}

// client-src/workbench/styles.js
var import_react = __toESM(require("react"), 1);
var WORKBENCH_CSS = `
.sci-workbench:lang(zh){font-family:"PingFang SC","Microsoft YaHei UI","Microsoft YaHei","Noto Sans CJK SC","Noto Sans SC","WenQuanYi Micro Hei",sans-serif}
.sci-workbench:lang(zh) :is(button,input,textarea,select){font-family:inherit}
.sci-workbench{--sci-fg:var(--dsw-alias-label-primary,inherit);--sci-muted:var(--dsw-alias-label-secondary,#737b88);--sci-faint:var(--dsw-alias-label-tertiary,#9299a4);--sci-accent:var(--dsw-alias-state-business-primary,#3568c8);--sci-good:var(--dsw-alias-state-success-primary,#16836b);--sci-warn:var(--dsw-alias-state-warn-primary,#b77912);--sci-bad:var(--dsw-alias-state-error-primary,#c34236);--sci-bg:var(--dsw-alias-bg-layer-0,transparent);--sci-card:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.06));--sci-raised:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.11));--sci-border:var(--dsw-alias-border-l1,rgba(127,127,127,.2));--sci-line:var(--dsw-alias-separator-primary,rgba(127,127,127,.14));box-sizing:border-box;color:var(--sci-fg);font-family:inherit;font-size:14px;line-height:1.55;min-height:100%;background:var(--sci-bg)}
.sci-workbench *{box-sizing:border-box}.sci-wb-shell{min-height:100%;padding:24px clamp(16px,3vw,40px) 40px}.sci-wb-content{max-width:1400px;margin:0 auto}.sci-wb-header{display:flex;align-items:center;justify-content:space-between;gap:20px;margin:0 auto 22px;max-width:1400px}.sci-wb-brand{display:flex;align-items:center;gap:12px;min-width:0}.sci-wb-mark{width:38px;height:38px;display:grid;place-items:center;border-radius:12px;background:color-mix(in srgb,var(--sci-accent) 12%,transparent);color:var(--sci-accent)}.sci-wb-brand h1{font-size:21px;line-height:1.2;margin:0;font-weight:650;letter-spacing:-.02em}.sci-wb-subtitle{font-size:13px;color:var(--sci-muted);margin-top:4px}.sci-wb-head-actions{display:flex;align-items:center;gap:10px}.sci-wb-nav{display:flex;gap:4px;padding:4px;border:1px solid var(--sci-border);border-radius:12px;background:var(--sci-card);margin-bottom:18px;overflow:auto}.sci-wb-nav button{border:0;background:transparent;color:var(--sci-muted);font:inherit;font-weight:550;padding:9px 15px;border-radius:9px;white-space:nowrap;cursor:pointer}.sci-wb-nav button[aria-current=true]{background:var(--sci-raised);color:var(--sci-fg);box-shadow:0 1px 2px rgba(0,0,0,.06)}
.sci-wb-content,.sci-stack,.sci-grid,.sci-grid>*{min-width:0}.sci-stack{grid-template-columns:minmax(0,1fr)}
.sci-panel{border:1px solid var(--sci-border);border-radius:14px;background:var(--sci-card);padding:20px}.sci-panel + .sci-panel{margin-top:16px}.sci-panel-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}.sci-panel-heading h2,.sci-panel-heading h3{margin:0;font-size:17px;line-height:1.3}.sci-panel-heading p{margin:4px 0 0;color:var(--sci-muted);font-size:13px}.sci-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:16px}.sci-col-8{grid-column:span 8}.sci-col-4{grid-column:span 4}.sci-col-6{grid-column:span 6}.sci-col-12{grid-column:span 12}.sci-stack{display:grid;gap:16px}.sci-muted{color:var(--sci-muted)}.sci-small{font-size:12px;color:var(--sci-muted)}.sci-kicker{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--sci-muted);font-weight:650}.sci-title{font-size:24px;line-height:1.25;letter-spacing:-.02em;margin:0 0 6px}.sci-copy{font-size:14px;color:var(--sci-muted);margin:0}.sci-rule{border:0;border-top:1px solid var(--sci-line);margin:16px 0}.sci-button{display:inline-flex;justify-content:center;align-items:center;gap:8px;min-height:38px;padding:8px 13px;border:1px solid var(--sci-border);border-radius:9px;background:transparent;color:var(--sci-fg);font:inherit;font-weight:560;cursor:pointer;transition:background .16s,border-color .16s,transform .16s}.sci-button:hover:not(:disabled){background:var(--sci-raised);border-color:color-mix(in srgb,var(--sci-accent) 35%,var(--sci-border))}.sci-button:focus-visible,.sci-wb-nav button:focus-visible,.sci-field input:focus-visible,.sci-field textarea:focus-visible,.sci-field select:focus-visible{outline:2px solid var(--sci-accent);outline-offset:2px}.sci-button:active:not(:disabled){transform:translateY(1px)}.sci-button:disabled{opacity:.55;cursor:not-allowed}.sci-button-primary{background:var(--sci-accent);border-color:var(--sci-accent);color:white}.sci-button-primary:hover:not(:disabled){background:color-mix(in srgb,var(--sci-accent) 87%,#111);border-color:var(--sci-accent);color:white}.sci-button-quiet{border-color:transparent}.sci-button-small{min-height:32px;padding:5px 9px;font-size:13px}.sci-badge{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--sci-border);border-radius:999px;padding:3px 9px;font-size:12px;white-space:nowrap;color:var(--sci-muted);background:var(--sci-card)}.sci-badge-good{color:var(--sci-good);border-color:color-mix(in srgb,var(--sci-good) 30%,var(--sci-border));background:color-mix(in srgb,var(--sci-good) 8%,transparent)}.sci-badge-warn{color:var(--sci-warn);border-color:color-mix(in srgb,var(--sci-warn) 30%,var(--sci-border));background:color-mix(in srgb,var(--sci-warn) 8%,transparent)}.sci-badge-bad{color:var(--sci-bad);border-color:color-mix(in srgb,var(--sci-bad) 30%,var(--sci-border));background:color-mix(in srgb,var(--sci-bad) 8%,transparent)}.sci-stat-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.sci-stat{padding:14px;border:1px solid var(--sci-border);border-radius:12px;background:var(--sci-card)}.sci-stat strong{display:block;font-size:22px;line-height:1.2;font-weight:650}.sci-stat span{display:block;color:var(--sci-muted);font-size:12px;margin-top:5px}.sci-stage-track{display:grid;grid-template-columns:repeat(6,minmax(135px,1fr));gap:0;overflow:auto;padding:2px 0 6px}.sci-stage{position:relative;min-width:135px;padding:4px 14px 8px 0}.sci-stage:not(:last-child):after{content:"";position:absolute;height:2px;left:26px;right:6px;top:14px;background:var(--sci-border)}.sci-stage[data-state=completed]:after{background:color-mix(in srgb,var(--sci-good) 65%,var(--sci-border))}.sci-stage-dot{position:relative;z-index:1;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;border:1px solid var(--sci-border);background:var(--sci-card);color:var(--sci-muted);font-size:12px}.sci-stage[data-state=current] .sci-stage-dot{background:var(--sci-accent);border-color:var(--sci-accent);color:#fff;box-shadow:0 0 0 4px color-mix(in srgb,var(--sci-accent) 13%,transparent)}.sci-stage[data-state=completed] .sci-stage-dot{color:var(--sci-good);border-color:var(--sci-good)}.sci-stage-label{font-size:12px;margin-top:8px;color:var(--sci-muted)}.sci-stage[data-state=current] .sci-stage-label{font-weight:650;color:var(--sci-fg)}
.sci-hero{padding:24px;border:1px solid color-mix(in srgb,var(--sci-accent) 24%,var(--sci-border));border-radius:16px;background:color-mix(in srgb,var(--sci-accent) 5%,var(--sci-card))}.sci-empty{min-height:180px;display:grid;place-items:center;text-align:center;padding:28px}.sci-empty h2,.sci-empty h3{margin:0 0 8px}.sci-empty p{max-width:620px;margin:0 auto 16px;color:var(--sci-muted)}.sci-step-row{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:20px}.sci-step{border:1px solid var(--sci-border);border-radius:11px;padding:12px;background:var(--sci-card);text-align:left}.sci-step b{display:block;font-size:13px}.sci-step span{font-size:12px;color:var(--sci-muted)}.sci-field{display:grid;gap:6px;margin:12px 0}.sci-field label{font-size:13px;font-weight:600}.sci-field input,.sci-field textarea,.sci-field select{width:100%;padding:10px 11px;border:1px solid var(--sci-border);border-radius:9px;background:var(--sci-bg);color:var(--sci-fg);font:inherit;resize:vertical}.sci-field textarea{min-height:88px}.sci-form-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:18px}.sci-modal-backdrop{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:20px;background:rgba(12,17,27,.46)}.sci-modal{width:min(620px,100%);max-height:min(90vh,900px);overflow:auto;padding:22px;border-radius:16px;border:1px solid var(--sci-border);background:var(--dsw-alias-bg-layer-0,#fff);box-shadow:0 20px 70px rgba(0,0,0,.24)}.sci-modal h2{margin:0;font-size:20px}.sci-error-box{padding:12px;border:1px solid color-mix(in srgb,var(--sci-bad) 35%,var(--sci-border));border-radius:10px;background:color-mix(in srgb,var(--sci-bad) 6%,transparent);color:var(--sci-fg);margin-top:12px}.sci-success-box{padding:12px;border:1px solid color-mix(in srgb,var(--sci-good) 35%,var(--sci-border));border-radius:10px;background:color-mix(in srgb,var(--sci-good) 6%,transparent);margin:12px 0}.sci-result-card{border:1px solid var(--sci-border);border-radius:13px;background:var(--sci-card);padding:17px}.sci-result-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.sci-result-card h3{font-size:16px;margin:0 0 5px}.sci-result-claim{color:var(--sci-muted);margin:8px 0 14px}.sci-readiness{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}.sci-readiness-item{border:1px solid var(--sci-border);border-radius:9px;padding:8px;font-size:12px}.sci-readiness-item b{display:block;font-weight:600}.sci-result-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}.sci-note-list{padding-left:20px;margin:8px 0;color:var(--sci-muted)}.sci-note-list li{margin:4px 0}.sci-members{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}.sci-member{border:1px solid var(--sci-border);border-radius:11px;padding:13px}.sci-member h3{font-size:14px;margin:0}.sci-member p{font-size:12px;color:var(--sci-muted);margin:5px 0 0}.sci-task-graph{position:relative;overflow:auto;min-height:150px}.sci-task-canvas{position:relative;min-height:180px}.sci-task-node{position:absolute;width:188px;min-height:72px;padding:10px;border:1px solid var(--sci-border);border-radius:10px;background:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.08));color:var(--sci-fg);text-align:left;z-index:1}.sci-task-node:hover{border-color:var(--sci-accent)}.sci-task-node strong{display:block;font-size:13px}.sci-task-node span{display:block;font-size:11px;color:var(--sci-muted);margin-top:4px}.sci-task-lines{position:absolute;inset:0;pointer-events:none;overflow:visible}.sci-task-line{stroke:var(--sci-muted);stroke-width:1.5;fill:none;opacity:.7}.sci-task-list{display:grid;gap:8px}.sci-task-row{display:grid;grid-template-columns:minmax(200px,2fr) minmax(100px,1fr) auto;gap:12px;align-items:center;border-bottom:1px solid var(--sci-line);padding:10px 0}.sci-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}.sci-figure{border:1px solid var(--sci-border);border-radius:12px;overflow:hidden;background:var(--sci-card);cursor:pointer}.sci-figure img{width:100%;height:180px;object-fit:contain;background:var(--sci-raised);display:block}.sci-figure-copy{padding:11px}.sci-figure-copy strong{display:block;font-size:13px}.sci-figure-copy span{display:block;color:var(--sci-muted);font-size:12px;margin-top:4px}.sci-group{margin-top:24px}.sci-group h3{font-size:15px;margin:0 0 10px}.sci-file-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:9px}.sci-file{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid var(--sci-border);border-radius:10px;padding:11px}.sci-file strong{font-size:13px;display:block;word-break:break-word}.sci-expert-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}.sci-expert-card{border:1px solid var(--sci-border);border-radius:12px;background:var(--sci-card);padding:16px}.sci-expert-card h3{font-size:15px;margin:0}.sci-expert-card p{font-size:13px;color:var(--sci-muted);margin:8px 0}.sci-risk{font-size:12px;padding:9px;border-radius:9px;background:var(--sci-raised);margin-top:10px}.sci-toast{position:fixed;right:22px;bottom:22px;z-index:9000;max-width:420px;padding:12px 16px;border:1px solid var(--sci-border);border-radius:11px;background:var(--dsw-alias-bg-layer-2,#fff);box-shadow:0 8px 30px rgba(0,0,0,.15)}.sci-quick{padding:16px}.sci-quick .sci-panel{padding:15px}.sci-quick .sci-title{font-size:18px}
.sci-tool-list{display:grid;gap:8px;margin-top:10px}.sci-tool-row{display:grid;gap:3px;border-top:1px solid var(--sci-line);padding:8px 0;font-size:12px;color:var(--sci-muted)}.sci-tool-row b{font-size:13px;color:var(--sci-fg)}
@media(max-width:900px){.sci-col-8,.sci-col-4,.sci-col-6{grid-column:span 12}.sci-wb-header{align-items:flex-start}.sci-stat-row{grid-template-columns:repeat(2,1fr)}}@media(max-width:640px){.sci-wb-shell{padding:16px 12px 28px}.sci-wb-header{flex-direction:column}.sci-wb-head-actions{width:100%;flex-wrap:wrap}.sci-wb-nav button{padding:8px 11px}.sci-panel{padding:15px}.sci-stage-track{grid-template-columns:repeat(6,120px)}.sci-step-row{grid-template-columns:1fr}.sci-readiness{grid-template-columns:repeat(2,1fr)}.sci-task-row{grid-template-columns:1fr}.sci-stat strong{font-size:19px}}
@media(prefers-reduced-motion:reduce){.sci-workbench *, .sci-workbench *:before,.sci-workbench *:after{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
`;
function WorkbenchStyles() {
  return import_react.default.createElement("style", { id: "dsh-science-workbench-styles" }, WORKBENCH_CSS);
}

// client-src/workbench/components/ui.jsx
var import_react2 = __toESM(require("react"), 1);
var import_jsx_runtime = require("react/jsx-runtime");
function Button({ children, primary = false, small = false, quiet = false, ...props }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { ...props, className: ["sci-button", primary && "sci-button-primary", small && "sci-button-small", quiet && "sci-button-quiet", props.className].filter(Boolean).join(" "), children });
}
function Panel({ title, subtitle, action, children, className = "" }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: `sci-panel ${className}`, children: [
    (title || subtitle || action) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { className: "sci-panel-heading", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
        title && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: title }),
        subtitle && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: subtitle })
      ] }),
      action
    ] }),
    children
  ] });
}
function Badge({ children, tone = "default" }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `sci-badge ${tone === "good" ? "sci-badge-good" : tone === "warn" ? "sci-badge-warn" : tone === "bad" ? "sci-badge-bad" : ""}`, children });
}
function EmptyState({ title, children, action, secondary }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "sci-empty", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: title }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "sci-result-actions", style: { justifyContent: "center" }, children: [
      action,
      secondary
    ] })
  ] }) });
}
function StatusMessage({ tone = "default", children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: tone === "error" ? "sci-error-box" : tone === "success" ? "sci-success-box" : "sci-panel", role: tone === "error" ? "alert" : void 0, children });
}

// client-src/workbench/WorkspaceOverview.jsx
var import_react3 = __toESM(require("react"), 1);
var import_jsx_runtime2 = require("react/jsx-runtime");
function Tile({ label, count, title, note, action, children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("article", { className: "sci-desk-tile", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "sci-desk-tile-top", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: label }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: count })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { children: title }),
    note && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: note }),
    children,
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(Button, { quiet: true, small: true, onClick: action, children: [
      "\u67E5\u770B",
      label,
      " ",
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { "aria-hidden": "true", children: "\u2197" })
    ] })
  ] });
}
function WorkspaceOverview({ view, raw, busy, onAction, onNavigate, onOpenConversation, onOpenCatalog }) {
  const { paper, team, artifacts } = view;
  const hasProject = Boolean(raw?.projectId || paper.core.title || paper.core.claim || paper.results.length);
  const pending = paper.results.filter((r) => !r.confirmed && r.manuscriptRole !== "excluded" && r.status !== "dropped");
  const corePending = Boolean(paper.core.claim && !paper.core.confirmed);
  const failed = team.tasks.filter((task) => task.status === "failed" && !task.isBlocked).length;
  const total = team.tasks.length;
  const completed = team.counts.completed;
  const active = team.tasks.find((task) => task.isRunning && !task.isBlocked);
  const figure = artifacts.figures[0];
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "sci-desk-overview", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { className: "sci-desk-hero", "data-active": hasProject || void 0, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "sci-desk-hero-copy", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "sci-desk-eyebrow", children: hasProject ? `\u5F53\u524D\u8BFE\u9898\u3000/\u3000${paper.stageLabel}` : "\u4F60\u7684\u79D1\u7814\u7A7A\u95F4" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h1", { children: hasProject ? paper.title : "\u4F60\u60F3\u7814\u7A76\u4EC0\u4E48\uFF1F" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: paper.question || raw?.blueprint?.question || paper.core.claim || (hasProject ? "\u4ECE\u5BF9\u8BDD\u8865\u5145\u7814\u7A76\u95EE\u9898\uFF0C\u968F\u65F6\u56DE\u6765\u770B\u8BBA\u6587\u548C\u56E2\u961F\u8FDB\u5EA6\u3002" : "\u4ECE\u4E00\u4E2A\u7814\u7A76\u95EE\u9898\uFF0C\u6216\u4E00\u7EC4\u5DF2\u6709\u7ED3\u679C\u5F00\u59CB\u3002\u7814\u7A76\u6750\u6599\u4F1A\u968F\u5BF9\u8BDD\u6574\u7406\u5230\u8FD9\u91CC\u3002") }),
        hasProject && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dl", { className: "sci-desk-metrics", children: [["\u7814\u7A76\u7ED3\u679C", paper.totalResults], ["\u4E3B\u5F20\u5F85\u786E\u8BA4", pending.length + Number(corePending)], ["\u4EFB\u52A1\u8FDB\u884C\u4E2D", team.counts.running], ["\u767B\u8BB0\u56FE\u4EF6", artifacts.figures.length]].map(([label, count]) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dt", { children: label }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dd", { children: count })
        ] }, label)) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "sci-desk-actions", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(Button, { primary: true, disabled: busy, onClick: hasProject ? onOpenConversation : () => onAction("explore"), children: [
            hasProject ? "\u7EE7\u7EED\u7814\u7A76\u5BF9\u8BDD" : "\u5728\u5BF9\u8BDD\u4E2D\u5F00\u59CB\u63A2\u7D22",
            " ",
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { "aria-hidden": "true", children: "\u2197" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Button, { disabled: busy, onClick: () => onAction(hasProject ? "literature" : "import_results"), children: hasProject ? "\u63A2\u7D22\u6587\u732E" : "\u6574\u7406\u5DF2\u6709\u7ED3\u679C" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Button, { onClick: () => onNavigate("experts"), children: "\u914D\u7F6E\u9879\u76EE\u4E13\u5BB6" }),
          onOpenCatalog && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Button, { disabled: busy, onClick: onOpenCatalog, children: "\u67E5\u770B\u5168\u90E8\u9879\u76EE" })
        ] })
      ] }),
      hasProject && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("aside", { className: "sci-desk-brief", "aria-label": "\u73B0\u5728\u503C\u5F97\u5173\u6CE8", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "sci-desk-eyebrow", children: "\u73B0\u5728\u503C\u5F97\u5173\u6CE8" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { children: corePending ? "\u6838\u5BF9\u6838\u5FC3\u4E3B\u5F20" : pending[0] ? "\u6838\u5BF9\u7814\u7A76\u7ED3\u679C" : active ? "\u8DDF\u8FDB\u5F53\u524D\u4EFB\u52A1" : "\u56DE\u770B\u8BBA\u6587\u4E3B\u7EBF" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: corePending ? paper.core.title : pending[0]?.title || active?.subject || "\u67E5\u770B\u5F53\u524D\u4E3B\u5F20\u4E0E\u8BC1\u636E\u7684\u5BF9\u5E94\u5173\u7CFB\u3002" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(Button, { quiet: true, small: true, onClick: () => onNavigate(!corePending && !pending.length && active ? "team" : "paper"), children: [
          "\u67E5\u770B\u8BE6\u60C5 ",
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { "aria-hidden": "true", children: "\u2197" })
        ] })
      ] })
    ] }),
    hasProject && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "sci-desk-grid", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        Tile,
        {
          label: "\u8BBA\u6587",
          count: `${paper.totalResults} \u9879\u7ED3\u679C`,
          title: corePending ? "\u6838\u5FC3\u4E3B\u5F20\u5F85\u786E\u8BA4" : pending.length ? `${pending.length} \u9879\u7ED3\u679C\u5F85\u786E\u8BA4` : "\u8BBA\u6587\u4E3B\u7EBF",
          note: corePending ? paper.core.claim : pending[0]?.title || paper.narrative || paper.core.claim || "\u6574\u7406\u7ED3\u679C\u548C\u652F\u6301\u5B83\u4EEC\u7684\u8BC1\u636E\u3002",
          action: () => onNavigate("paper"),
          children: paper.results.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("ol", { className: "sci-desk-result-preview", children: paper.results.slice(0, 3).map((r) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("li", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: r.title }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("small", { children: r.confirmed ? "\u5DF2\u786E\u8BA4" : "\u5F85\u786E\u8BA4" })
          ] }, r.id)) })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        Tile,
        {
          label: "\u56E2\u961F",
          count: `${team.members.length} \u4F4D\u6210\u5458`,
          title: active?.subject || "\u56E2\u961F\u8FDB\u5C55",
          note: team.counts.blocked || failed ? `${team.counts.blocked} \u9879\u53D7\u963B \xB7 ${failed} \u9879\u5931\u8D25` : active ? "\u4EFB\u52A1\u6B63\u5728\u8FDB\u884C" : "\u5F53\u524D\u6CA1\u6709\u8FD0\u884C\u4E2D\u7684\u4EFB\u52A1\u3002",
          action: () => onNavigate("team"),
          children: total > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "sci-desk-progress", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
              "\u5DF2\u5B8C\u6210 ",
              completed,
              " / ",
              total,
              " \u9879\u4EFB\u52A1"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("progress", { value: completed, max: total, "aria-label": "\u5DF2\u5B8C\u6210\u4EFB\u52A1" })
          ] })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        Tile,
        {
          label: "\u6210\u679C",
          count: `${artifacts.figures.length} \u5F20\u56FE\u4EF6`,
          title: figure?.title || "\u7814\u7A76\u6210\u679C",
          note: figure ? figure.resultId ? `\u5BF9\u5E94 ${figure.resultId}` : "\u5DF2\u767B\u8BB0\u56FE\u4EF6" : "\u767B\u8BB0\u7684\u56FE\u8868\u548C\u7814\u7A76\u6750\u6599\u4F1A\u5728\u6210\u679C\u9875\u6C47\u603B\u3002",
          action: () => onNavigate("artifacts"),
          children: figure?.previewable && figure.url && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(OverviewFigure, { figure }, figure.url)
        }
      )
    ] })
  ] });
}
function OverviewFigure({ figure }) {
  const [failed, setFailed] = import_react3.default.useState(false);
  return failed ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: "\u56FE\u4EF6\u9884\u89C8\u4E0D\u53EF\u7528\uFF0C\u53EF\u5728\u6210\u679C\u9875\u6253\u5F00\u539F\u56FE\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("img", { className: "sci-desk-preview", src: figure.url, alt: figure.title, loading: "lazy", onError: () => setFailed(true) });
}

// client-src/workbench/research-desk-styles.js
var RESEARCH_DESK_CSS = `
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

.sci-project-experts{max-width:960px;margin:auto}.sci-expert-form,.sci-expert-row,.sci-expert-presets{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:10px 0}.sci-expert-row{justify-content:space-between;overflow-wrap:anywhere}.sci-expert-form input,.sci-expert-form select{padding:7px 9px;max-width:100%;color:inherit;background:var(--sci-card);border:1px solid var(--sci-border);border-radius:6px}.sci-expert-form input{flex:1;min-width:12em}.sci-expert-presets button{display:grid;text-align:left}.sci-expert-presets small{font-size:.8em;font-weight:400}
`;

// client-src/workbench/PaperSpinePage.jsx
var import_react4 = __toESM(require("react"), 1);
var import_jsx_runtime3 = require("react/jsx-runtime");
var READINESS_LABELS = [["scientific", "\u79D1\u5B66\u8BC1\u636E"], ["manuscript", "\u7A3F\u4EF6\u5C31\u7EEA"], ["submission", "\u6295\u7A3F\u5C31\u7EEA"]];
function readinessText(value) {
  if (!value) return "\u5F85\u6838\u5BF9";
  if (value.state === "ready" || value.state === "completed") return "\u5DF2\u5177\u5907";
  if (value.state === "in_progress") return "\u8FDB\u884C\u4E2D";
  return "\u5F85\u5B8C\u5584";
}
function ResultCard({ result, onAction, onConfirm, busy = false }) {
  const [expanded, setExpanded] = (0, import_react4.useState)(false);
  const gatesOpen = result.coreConfirmed === true && result.confirmed === true;
  const unconfirmedReason = result.coreConfirmed !== true ? "\u6838\u5FC3\u7814\u7A76\u7ED3\u8BBA\u5C1A\u672A\u786E\u8BA4\uFF1B\u5148\u786E\u8BA4\u6838\u5FC3\u7ED3\u8BBA\u540E\uFF0C\u624D\u80FD\u7EC6\u5316\u6B63\u5F0F\u4EFB\u52A1\u6216\u542F\u52A8\u6B63\u5F0F\u7ED8\u56FE\u3002" : `\u201C${result.title}\u201D\u5C1A\u672A\u786E\u8BA4\uFF1B\u5148\u786E\u8BA4\u8BE5\u7814\u7A76\u7ED3\u679C\u540E\uFF0C\u624D\u80FD\u7EC6\u5316\u6B63\u5F0F\u4EFB\u52A1\u6216\u542F\u52A8\u6B63\u5F0F\u7ED8\u56FE\u3002`;
  const run = (action) => onAction(action, result.id);
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("article", { className: "sci-result-card", children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "sci-result-top", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h3", { children: result.title }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "sci-small", children: [
          result.statusLabel,
          " \xB7 ",
          result.confirmed ? "\u5F53\u524D\u4FEE\u8BA2\u5DF2\u786E\u8BA4" : "\u5F85\u786E\u8BA4"
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: result.confirmed ? "good" : "warn", children: result.confirmed ? "\u5DF2\u786E\u8BA4" : "\u5F85\u786E\u8BA4" })
    ] }),
    result.claim && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "sci-result-claim", children: result.claim }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "sci-readiness", style: { gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))" }, children: READINESS_LABELS.map(([key, label]) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "sci-readiness-item", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("b", { children: label }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: readinessText(result.readiness?.[key]) })
    ] }, key)) }),
    result.requiredItems.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("b", { className: "sci-small", children: "\u5FC5\u987B\u5904\u7406" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("ul", { className: "sci-note-list", children: result.requiredItems.map((item) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("li", { children: item }, item)) })
    ] }),
    result.recommendedItems.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("b", { className: "sci-small", children: "\u5EFA\u8BAE\u5904\u7406" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("ul", { className: "sci-note-list", children: result.recommendedItems.map((item) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("li", { children: item }, item)) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "sci-result-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Button, { small: true, onClick: () => setExpanded((value) => !value), "aria-expanded": expanded, children: expanded ? "\u6536\u8D77\u8BE6\u60C5" : "\u67E5\u770B\u8BE6\u60C5" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Button, { small: true, onClick: () => run("optimize_structure"), children: "\u5728\u5BF9\u8BDD\u4E2D\u4F18\u5316" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Button, { small: true, disabled: !gatesOpen, title: !gatesOpen ? unconfirmedReason : void 0, onClick: () => run("refine_tasks"), children: "\u7EC6\u5316\u4EFB\u52A1" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Button, { small: true, disabled: !gatesOpen, title: !gatesOpen ? unconfirmedReason : void 0, onClick: () => run("draw"), children: "\u5F00\u59CB\u7ED8\u56FE" }),
      !result.confirmed && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Button, { small: true, primary: true, disabled: busy, onClick: () => onConfirm(result.id, result.revision, result.contentHash), children: "\u786E\u8BA4\u5F53\u524D\u4FEE\u8BA2" })
    ] }),
    !gatesOpen && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "sci-small", role: "note", style: { marginTop: 8 }, children: unconfirmedReason }),
    expanded && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "sci-small", style: { marginTop: 14 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("b", { children: "Result \u7F16\u53F7\uFF1A" }),
        result.id,
        "\u3000",
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("b", { children: "\u4FEE\u8BA2\uFF1A" }),
        result.revision || 1
      ] }),
      result.purpose && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("b", { children: "\u76EE\u7684\uFF1A" }),
        result.purpose
      ] }),
      result.direction && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("b", { children: "\u7ED3\u679C\u65B9\u5411\uFF1A" }),
        result.direction
      ] }),
      ["data", "code", "figure", "manuscript"].map((kind) => {
        const rows = (result.materials || []).filter((item) => item.kind === kind);
        if (rows.length === 0) return null;
        const label = { data: "\u76F8\u5173\u6570\u636E", code: "\u751F\u6210\u4EE3\u7801", figure: "\u56FE\u4EF6", manuscript: "\u7A3F\u6BB5" }[kind];
        return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("b", { children: [
            label,
            "\uFF1A"
          ] }),
          rows.map((item) => `${item.summary || item.id}\uFF08${item.status === "missing" ? "\u5DF2\u5931\u8054" : item.verified ? "\u5DF2\u6838\u9A8C\u8BC1\u636E" : "\u5DF2\u767B\u8BB0\uFF0C\u5C1A\u672A\u6838\u9A8C"}\uFF09`).join("\uFF1B")
        ] }, kind);
      }),
      result.notes && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("b", { children: "\u5907\u6CE8\uFF1A" }),
        result.notes
      ] }),
      result.evidence?.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("b", { children: "\u8BC1\u636E\u8BB0\u5F55\uFF1A" }),
        result.evidence.map((row, index) => {
          if (!row) return `\u8BC1\u636E ${index + 1}`;
          const flag = row.state === "verified" ? "\u2713" : row.state === "disputed" || row.state === "invalidated" ? "\u2717" : "\u2026";
          return `${flag} ${row.sourceLocator || row.title || `\u8BC1\u636E ${index + 1}`}`;
        }).join("\uFF1B")
      ] }),
      result.references?.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("b", { children: "\u53C2\u8003\u6587\u732E\uFF08\u6309\u7528\u9014\uFF09\uFF1A" }),
        ["method", "concept", "background", "evidence"].map((usedAs) => {
          const rows = (result.references || []).filter((row) => row && row.usedAs === usedAs);
          if (rows.length === 0) return null;
          const label = { method: "\u65B9\u6CD5", concept: "\u6982\u5FF5", background: "\u80CC\u666F", evidence: "\u8BC1\u636E" }[usedAs];
          return `${label}\uFF1A${rows.map((row) => `${row.title || row.doi || "\u672A\u547D\u540D\u6587\u732E"}${row.verified ? "\u2713" : "\uFF08\u672A\u6838\u5BF9\uFF09"}`).join("\u3001")}`;
        }).filter(Boolean).join("\uFF1B")
      ] })
    ] })
  ] });
}
function PaperSpinePage({ view, raw, onAction, onConfirm, busy = false, onOpenConversation, onNavigate }) {
  const paper = view.paper;
  const hasSpine = Boolean(paper.core.claim || paper.results.length || paper.core.title);
  const [showAllResults, setShowAllResults] = (0, import_react4.useState)(false);
  const previewLimit = 5;
  const visibleResults = showAllResults ? paper.results : paper.results.slice(0, previewLimit);
  const nextStep = paper.nextStep;
  const nextAction = () => nextStep.action ? onAction(nextStep.action, nextStep.targetId || null) : nextStep.page && onNavigate(nextStep.page);
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "sci-stack", children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("header", { className: "sci-desk-page-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h1", { children: "\u8BBA\u6587\u4E3B\u7EBF" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("p", { children: [
        paper.stageLabel,
        paper.venue ? ` \xB7 \u76EE\u6807\u671F\u520A\uFF1A${paper.venue}` : "",
        " \xB7 ",
        paper.totalResults,
        " \u9879\u7ED3\u679C"
      ] })
    ] }),
    !hasSpine ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(Panel, { className: "sci-hero", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(EmptyState, { title: "\u5F00\u59CB\u4E00\u9879\u7814\u7A76", children: "\u4ECE\u4E00\u4E2A\u7814\u7A76\u95EE\u9898\u5F00\u59CB\uFF0C\u4E5F\u53EF\u4EE5\u5148\u6574\u7406\u5DF2\u7ECF\u5B8C\u6210\u7684\u7ED3\u679C\u3002" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "sci-button sci-button-primary", onClick: () => onAction("explore"), children: "\u5F00\u59CB\u63A2\u7D22" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Button, { onClick: () => onAction("import_results"), children: "\u5BFC\u5165\u5DF2\u6709\u7ED3\u679C" })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "sci-grid", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "sci-col-8 sci-stack", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(Panel, { title: "\u6838\u5FC3\u7814\u7A76\u7ED3\u8BBA", subtitle: paper.core.confirmed ? "\u5F53\u524D\u4FEE\u8BA2\u5DF2\u786E\u8BA4" : "\u5019\u9009\u7ED3\u8BBA\u4ECD\u5F85\u786E\u8BA4", action: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: paper.core.confirmed ? "good" : "warn", children: paper.core.confirmed ? "\u5DF2\u786E\u8BA4" : "\u5F85\u786E\u8BA4" }), children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h2", { className: "sci-title", children: paper.core.title || "\u5C1A\u672A\u547D\u540D" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "sci-copy", children: paper.core.claim || "\u5F53\u524D\u8FD8\u6CA1\u6709\u6838\u5FC3\u7ED3\u8BBA\u5019\u9009\u3002\u4F60\u53EF\u4EE5\u5148\u751F\u6210\u6587\u7AE0\u7ED3\u6784\u3002" }),
          paper.core.innovation && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("p", { className: "sci-small", style: { marginTop: 10 }, children: [
            "\u521B\u65B0\u70B9\uFF1A",
            paper.core.innovation
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "sci-result-actions", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Button, { primary: true, onClick: () => onAction(paper.results.length ? "optimize_structure" : "generate_structure", "core"), children: paper.results.length ? "\u5728\u5BF9\u8BDD\u4E2D\u4F18\u5316\u7ED3\u6784" : "\u751F\u6210\u6587\u7AE0\u7ED3\u6784" }),
            !paper.core.confirmed && paper.core.claim && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Button, { onClick: () => onConfirm("core", paper.core.revision, paper.core.contentHash), disabled: busy, children: "\u786E\u8BA4\u5F53\u524D\u4FEE\u8BA2" })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("section", { className: "sci-stack", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("h2", { className: "sci-desk-section-title", children: [
            "\u7814\u7A76\u7ED3\u679C ",
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("small", { children: paper.totalResults })
          ] }),
          paper.results.length ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "sci-stack", children: [
            visibleResults.map((result) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ResultCard, { result: { ...result, coreConfirmed: paper.core.confirmed }, onAction, onConfirm, busy }, result.id)),
            paper.results.length > previewLimit && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "sci-result-actions", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Button, { small: true, onClick: () => setShowAllResults((value) => !value), children: showAllResults ? "\u6536\u8D77\u7ED3\u679C\u5217\u8868" : `\u663E\u793A\u5168\u90E8 ${paper.results.length} \u9879` }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "sci-small", children: showAllResults ? "\u5DF2\u5C55\u5F00\u5168\u90E8 Result\uFF1B\u53EF\u7528\u5BF9\u8BDD\u5408\u5E76\u6216\u6392\u9664\u5F31\u7ED3\u679C\u3002" : `\u9ED8\u8BA4\u663E\u793A\u524D ${previewLimit} \u9879\uFF08\u5F53\u524D ${paper.results.length} \u9879\uFF09\uFF1B\u8D85\u8FC7 5 \u4E2A\u662F\u8F6F\u63D0\u9192\uFF0C\u4E0D\u5F71\u54CD\u7EE7\u7EED\u5DE5\u4F5C\u3002` })
            ] })
          ] }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "sci-small", children: "\u8FD8\u6CA1\u6709\u7814\u7A76\u7ED3\u679C\u8349\u6848\u3002\u751F\u6210\u6587\u7AE0\u7ED3\u6784\u540E\uFF0C\u5019\u9009\u7ED3\u679C\u4F1A\u663E\u793A\u5728\u8FD9\u91CC\u3002" })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("aside", { className: "sci-col-4 sci-stack", style: { alignSelf: "start" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(Panel, { title: "\u5EFA\u8BAE\u65B9\u5411", subtitle: "\u9636\u6BB5\u662F\u63CF\u8FF0\uFF0C\u4E0D\u662F\u5F3A\u5236\u6D41\u7A0B\uFF1B\u968F\u65F6\u53EF\u4EE5\u5728\u5BF9\u8BDD\u4E2D\u8DF3\u8DC3\u3001\u56DE\u9000\u6216\u5E76\u884C\u3002", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h3", { style: { fontSize: 16, margin: "0 0 8px" }, children: nextStep.label }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Button, { primary: true, onClick: nextAction, children: nextStep.action ? "\u5728\u5BF9\u8BDD\u4E2D\u7EE7\u7EED" : "\u67E5\u770B" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Panel, { title: "\u8FD1\u671F\u6D3B\u52A8", children: view.team.activity.length ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "sci-stack", children: view.team.activity.slice(0, 4).map((row) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "sci-small", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("b", { children: row.summary }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
            row.at ? new Date(row.at).toLocaleString() : "\u65F6\u95F4\u672A\u8BB0\u5F55",
            " \xB7 ",
            row.status
          ] })
        ] }, row.id)) }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "sci-small", children: "\u6682\u65E0\u4EFB\u52A1\u56DE\u62A5\u8BB0\u5F55\u3002" }) }),
        view.team.blockedTasks.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(Panel, { title: "\u5F53\u524D\u963B\u585E", subtitle: `${view.team.blockedTasks.length} \u9879\u4EFB\u52A1\u6709\u672A\u5B8C\u6210\u4F9D\u8D56`, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("ul", { className: "sci-note-list", children: view.team.blockedTasks.slice(0, 5).map((task) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("li", { children: [
            task.subject || task.id,
            "\uFF1A",
            task.blockers.join("\uFF1B")
          ] }, task.id)) }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Button, { small: true, onClick: () => onNavigate("team"), children: "\u67E5\u770B\u56E2\u961F\u8FDB\u5C55" })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "sci-result-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Button, { small: true, onClick: () => onAction("literature"), children: "\u6269\u5C55\u6587\u732E\u63A2\u7D22" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Button, { small: true, onClick: () => onAction("write"), children: "\u64B0\u5199\u8BBA\u6587" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Button, { small: true, onClick: () => onNavigate("artifacts"), children: "\u67E5\u770B\u56FE\u8868\u4E0E\u6210\u679C" })
    ] })
  ] });
}

// client-src/workbench/TeamProgressPage.jsx
var import_react5 = __toESM(require("react"), 1);
var import_jsx_runtime4 = require("react/jsx-runtime");
function graphLayout(tasks) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const depthCache = /* @__PURE__ */ new Map();
  const depthOf = (task, visiting = /* @__PURE__ */ new Set()) => {
    if (depthCache.has(task.id)) return depthCache.get(task.id);
    if (visiting.has(task.id)) return 0;
    const nextVisiting = new Set(visiting).add(task.id);
    const dependencies = Array.isArray(task.blockedBy) ? task.blockedBy.map((id) => byId.get(id)).filter(Boolean) : [];
    const depth = dependencies.length ? Math.min(6, 1 + Math.max(...dependencies.map((dep) => depthOf(dep, nextVisiting)))) : 0;
    depthCache.set(task.id, depth);
    return depth;
  };
  const columns = [];
  for (const task of tasks) {
    const depth = depthOf(task);
    columns[depth] ||= [];
    columns[depth].push(task);
  }
  columns.forEach((column) => column?.sort((a, b) => String(a.id).localeCompare(String(b.id), void 0, { numeric: true })));
  const position = /* @__PURE__ */ new Map();
  columns.forEach((column, col) => column?.forEach((task, row) => position.set(task.id, { x: col * 228, y: row * 96 })));
  const width = Math.max(228, columns.length * 228);
  const height = Math.max(180, ...columns.map((col) => col?.length * 96 || 0));
  return { columns, position, width, height, byId };
}
var STATE_TONE = { completed: "good", failed: "bad", blocked: "warn", in_progress: "default", claimed: "default", pending: "default" };
function TeamProgressPage({ view, openMemberSession, memberOpenAvailable }) {
  const [mode, setMode] = (0, import_react5.useState)("graph");
  const [memberError, setMemberError] = (0, import_react5.useState)(null);
  const tasks = view.team.tasks;
  const layout = (0, import_react5.useMemo)(() => graphLayout(tasks), [tasks]);
  const openMember = async (member) => {
    try {
      await openMemberSession(member);
      setMemberError(null);
    } catch (error) {
      setMemberError({ member, message: error?.message || "\u65E0\u6CD5\u6253\u5F00\u8BE5\u6210\u5458\u4F1A\u8BDD\u3002" });
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "sci-stack", children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "sci-stat-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "sci-stat", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("strong", { children: view.team.counts.running }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: "\u8FD0\u884C\u4E2D" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "sci-stat", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("strong", { children: view.team.counts.waiting }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: "\u7B49\u5F85\u4E2D" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "sci-stat", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("strong", { children: view.team.counts.completed }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: "\u5DF2\u5B8C\u6210" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "sci-stat", "data-tone": view.team.counts.blocked > 0 ? "warn" : "default", style: view.team.counts.blocked > 0 ? { color: "var(--dsh-warning, #b7791f)" } : void 0, children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("strong", { children: view.team.counts.blocked }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: "\u53D7\u963B" })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(Panel, { title: "\u7814\u7A76\u56E2\u961F", subtitle: "\u6210\u5458\u72B6\u6001\u548C\u5F53\u524D\u8D1F\u8D23\u7684\u4EFB\u52A1\u3002\u70B9\u51FB\u6210\u5458\u53EF\u67E5\u770B\u5BF9\u5E94\u4F1A\u8BDD\u3002", children: [
      memberError && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(StatusMessage, { tone: "error", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("b", { children: [
          memberError.member.name || "\u6210\u5458",
          "\u4F1A\u8BDD\u672A\u80FD\u6253\u5F00\u3002"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { children: memberError.message }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "sci-result-actions", children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Button, { small: true, onClick: () => openMember(memberError.member), children: "\u91CD\u8BD5" }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Button, { small: true, onClick: () => setMemberError(null), children: "\u5173\u95ED\u63D0\u793A" })
        ] })
      ] }),
      view.team.members.length ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "sci-members", children: view.team.members.map((member) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "sci-member", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "sci-result-top", children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h3", { children: view.experts.roles?.[member.role]?.label || member.role || member.name }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Badge, { tone: member.liveStatusTone, children: member.liveStatusLabel })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { children: member.currentTasks.length ? member.currentTasks.map((task) => task.subject || task.id).join("\uFF1B") : "\u5F53\u524D\u6CA1\u6709\u8FDB\u884C\u4E2D\u7684\u4EFB\u52A1" }),
        member.lastReport && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("p", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("b", { children: "\u6700\u8FD1\u56DE\u62A5\uFF1A" }),
          member.lastReport
        ] }),
        memberOpenAvailable && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "sci-result-actions", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Button, { small: true, onClick: () => openMember(member), children: "\u6253\u5F00\u6210\u5458\u4F1A\u8BDD" }) })
      ] }, member.name)) }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(EmptyState, { title: "\u56E2\u961F\u5C1A\u672A\u542F\u52A8", children: "\u5F00\u59CB\u7EC6\u5316\u5DF2\u786E\u8BA4\u7684\u7814\u7A76\u7ED3\u679C\u540E\uFF0C\u56E2\u961F\u4EFB\u52A1\u4F1A\u663E\u793A\u5728\u8FD9\u91CC\u3002" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Panel, { title: "\u6267\u884C\u4EFB\u52A1", subtitle: "\u4F9D\u8D56\u7EBF\u4ECE\u4E0A\u6E38\u4EFB\u52A1\u6307\u5411\u7B49\u5F85\u5B83\u5B8C\u6210\u7684\u4EFB\u52A1\u3002", action: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "sci-result-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Button, { small: true, primary: mode === "graph", "aria-pressed": mode === "graph", onClick: () => setMode("graph"), children: "\u4F9D\u8D56\u56FE" }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Button, { small: true, primary: mode === "list", "aria-pressed": mode === "list", onClick: () => setMode("list"), children: "\u5217\u8868" })
    ] }), children: tasks.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "sci-small", children: "\u8FD8\u6CA1\u6709\u8BB0\u5F55\u7684\u6267\u884C\u4EFB\u52A1\u3002" }) : mode === "list" ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "sci-task-list", children: tasks.map((task) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "sci-task-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("b", { children: task.subject || task.id }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "sci-small", children: task.description || task.resultIds.join("\u3001") || "\u672A\u5173\u8054\u7814\u7A76\u7ED3\u679C" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { children: task.assignee || "\u672A\u5206\u914D" }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Badge, { tone: STATE_TONE[task.status], children: task.label }),
      task.blockers.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "sci-small", children: [
        "\u963B\u585E\uFF1A",
        task.blockers.join("\uFF1B")
      ] })
    ] }, task.id)) }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "sci-task-graph", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "sci-task-canvas", style: { width: layout.width, height: layout.height }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("svg", { className: "sci-task-lines", width: layout.width, height: layout.height, viewBox: `0 0 ${layout.width} ${layout.height}`, "aria-hidden": "true", children: [
        tasks.flatMap((task) => (task.blockedBy || []).map((id) => {
          const from = layout.position.get(id), to = layout.position.get(task.id);
          if (!from || !to) return null;
          const startX = from.x + 188, startY = from.y + 36, endX = to.x, endY = to.y + 36, bend = Math.max(22, (endX - startX) / 2);
          return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { className: "sci-task-line", d: `M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`, markerEnd: "url(#sci-arrow)" }, `${id}-${task.id}`);
        })),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("defs", { children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("marker", { id: "sci-arrow", markerWidth: "7", markerHeight: "7", refX: "6", refY: "3.5", orient: "auto", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { d: "M0,0 L7,3.5 L0,7", fill: "none", stroke: "currentColor" }) }) })
      ] }),
      tasks.map((task) => {
        const point = layout.position.get(task.id);
        return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "sci-task-node", style: { left: point.x, top: point.y }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("strong", { children: task.subject || task.id }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { children: [
            task.assignee || "\u672A\u5206\u914D",
            " \xB7 ",
            task.label
          ] }),
          task.resultIds.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: task.resultIds.join("\u3001") })
        ] }, task.id);
      })
    ] }) }) }),
    view.team.blockedTasks.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Panel, { title: "\u53D7\u963B\u4E8B\u9879", subtitle: "\u53EA\u5217\u51FA\u660E\u786E\u7684\u672A\u5B8C\u6210\u4F9D\u8D56\u6216\u88AB\u6807\u8BB0\u4E3A\u963B\u585E\u7684\u4EFB\u52A1\u3002", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "sci-task-list", children: view.team.blockedTasks.map((task) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "sci-task-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("b", { children: task.subject || task.id }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "sci-small", children: task.blockers.join("\uFF1B") }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Badge, { tone: "warn", children: "\u53D7\u963B" })
    ] }, task.id)) }) }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Panel, { title: "\u6700\u8FD1\u56DE\u62A5", children: view.team.activity.length ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "sci-task-list", children: view.team.activity.map((item) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "sci-task-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("b", { children: item.summary }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "sci-small", children: item.resultIds.length ? `\u5173\u8054\u7ED3\u679C\uFF1A${item.resultIds.join("\u3001")}` : "\u672A\u5173\u8054\u7ED3\u679C" }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "sci-small", children: item.at ? new Date(item.at).toLocaleString() : "\u65F6\u95F4\u672A\u8BB0\u5F55" })
    ] }, item.id)) }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "sci-small", children: "\u6682\u65E0\u6210\u5458\u56DE\u62A5\u3002" }) })
  ] });
}

// client-src/workbench/ArtifactsPage.jsx
var import_react6 = __toESM(require("react"), 1);

// client-src/workbench/bounded-list.js
function visibleItems(items, expanded = false, limit = 5) {
  const rows = Array.isArray(items) ? items : [];
  const safeLimit = Number.isFinite(limit) && limit >= 0 ? Math.floor(limit) : 5;
  return expanded ? rows : rows.slice(0, safeLimit);
}

// client-src/workbench/ArtifactsPage.jsx
var import_jsx_runtime5 = require("react/jsx-runtime");
var ARTIFACT_PREVIEW_LIMIT = 5;
function timestampLabel(value) {
  const time = Number(value || 0);
  return Number.isFinite(time) && time > 0 ? new Date(time).toLocaleString() : "\u65F6\u95F4\u672A\u8BB0\u5F55";
}
function retryUrl(url, attempt) {
  if (!url || !attempt) return url;
  return `${url}${url.includes("?") ? "&" : "?"}previewAttempt=${attempt}`;
}
function ImagePreview({ figure, compact = false }) {
  const [failed, setFailed] = (0, import_react6.useState)(false);
  const [loaded, setLoaded] = (0, import_react6.useState)(false);
  const [attempt, setAttempt] = (0, import_react6.useState)(0);
  const retry = () => {
    setFailed(false);
    setLoaded(false);
    setAttempt((value) => value + 1);
  };
  const frameStyle = {
    width: "100%",
    minHeight: compact ? 180 : 260,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "repeating-conic-gradient(rgba(127,127,127,.10) 0% 25%, transparent 0% 50%) 50% / 22px 22px",
    border: "1px solid var(--dsh-border, rgba(127,127,127,.3))",
    borderRadius: 6,
    overflow: "hidden",
    position: "relative"
  };
  if (!figure.previewable || !figure.url || failed) {
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "sci-image-fallback sci-empty", role: failed ? "alert" : "status", style: { ...frameStyle, flexDirection: "column", gap: 6 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("b", { children: failed ? "\u56FE\u7247\u672A\u80FD\u52A0\u8F7D" : "\u6B64\u6587\u4EF6\u4E0D\u9002\u5408\u5185\u5D4C\u9884\u89C8" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "sci-small", children: failed ? "\u6587\u4EF6\u53EF\u80FD\u4E0D\u5B58\u5728\u3001\u683C\u5F0F\u4E0D\u53D7\u6D4F\u89C8\u5668\u652F\u6301\uFF0C\u6216\u5F53\u524D\u5DE5\u4F5C\u533A\u65E0\u6CD5\u8BFB\u53D6\u3002" : figure.path?.split(".").pop()?.toUpperCase() || "\u6587\u4EF6" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "sci-result-actions", children: [
        figure.previewable && figure.url && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Button, { small: true, onClick: retry, children: "\u91CD\u65B0\u52A0\u8F7D" }),
        figure.url && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("a", { className: "sci-button sci-button-small", href: figure.url, target: "_blank", rel: "noreferrer", children: "\u6253\u5F00\u539F\u6587\u4EF6" })
      ] })
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: frameStyle, "data-loaded": loaded ? "true" : "false", children: [
    !loaded && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "sci-small", style: { position: "absolute", top: 6, left: 8, opacity: 0.7 }, children: "\u52A0\u8F7D\u4E2D\u2026" }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      "img",
      {
        className: compact ? "sci-figure-image-compact" : "sci-figure-image-large",
        src: retryUrl(figure.url, attempt),
        alt: figure.title,
        loading: compact ? "lazy" : void 0,
        onLoad: () => setLoaded(true),
        onError: () => setFailed(true),
        style: { maxWidth: "100%", maxHeight: compact ? 180 : "70vh", display: "block", objectFit: "contain" }
      },
      attempt
    )
  ] });
}
function FigureCard({ figure, previous, onOpen, onCompare }) {
  const audit2 = figure.audit?.overallStatus || figure.audit?.status;
  const manual = audit2 === "approved" ? "\u4EBA\u5DE5\u7EC8\u5BA1\u5DF2\u6279\u51C6" : audit2 === "ready-for-manual-review" ? "\u7B49\u5F85\u4EBA\u5DE5\u7EC8\u5BA1" : audit2 ? `\u6295\u7A3F\u524D\u68C0\uFF1A${audit2}` : "\u5C1A\u65E0\u6295\u7A3F\u524D\u68C0\u8BB0\u5F55";
  const dimensions = figure.width && figure.height ? `${figure.width} \xD7 ${figure.height}${figure.unit ? ` ${figure.unit}` : ""}` : figure.dimensions || "\u5C3A\u5BF8\u672A\u8BB0\u5F55";
  const previousLabel = figure.previousVersionRelation === "recorded" ? "\u4E0A\u4E00\u767B\u8BB0\u7248\u672C" : "\u53EF\u80FD\u7684\u4E0A\u4E00\u6761\u540C\u540D\u8BB0\u5F55\uFF08\u63A8\u6D4B\uFF09";
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("article", { className: "sci-figure", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "sci-figure-preview", role: "group", "aria-label": `\u56FE\u4EF6\u9884\u89C8\uFF1A${figure.title}`, style: { width: "100%", padding: 0, color: "inherit", textAlign: "left", font: "inherit" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(ImagePreview, { figure, compact: true }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "sci-figure-copy", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("strong", { children: figure.title }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { children: [
          figure.resultId || "\u672A\u5173\u8054\u7814\u7A76\u7ED3\u679C",
          " \xB7 ",
          figure.version ? `\u7248\u672C ${figure.version}` : "\u7248\u672C\u672A\u8BB0\u5F55",
          figure.path ? ` \xB7 ${figure.path.split(/[\/]/).pop()}` : ""
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { children: [
          dimensions,
          " \xB7 ",
          manual
        ] })
      ] })
    ] }),
    previous && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "sci-figure-history", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { children: [
        previousLabel,
        "\uFF1A",
        previous.version ? `\u7248\u672C ${previous.version}` : previous.title
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { "aria-hidden": "true", children: " \xB7 " }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: timestampLabel(previous.registeredAt || previous.createdAt) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "sci-result-actions sci-figure-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Button, { small: true, disabled: !figure.previewable, title: figure.previewable ? void 0 : "\u8BE5\u6587\u4EF6\u4E0D\u652F\u6301\u5185\u5D4C\u9884\u89C8\uFF0C\u8BF7\u76F4\u63A5\u6253\u5F00\u6587\u4EF6", onClick: () => onOpen(figure), children: "\u653E\u5927\u67E5\u770B" }),
      previous && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Button, { small: true, onClick: () => onCompare({ current: figure, previous }), children: figure.previousVersionRelation === "recorded" ? "\u5BF9\u6BD4\u4E0A\u4E00\u7248\u672C" : "\u5BF9\u6BD4\u4E0A\u4E00\u6761\u8BB0\u5F55" }),
      figure.url && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("a", { className: "sci-button sci-button-small", href: figure.url, target: "_blank", rel: "noreferrer", children: "\u6253\u5F00\u6587\u4EF6" })
    ] })
  ] });
}
function FileGroup({ group }) {
  const [expanded, setExpanded] = (0, import_react6.useState)(false);
  const items = visibleItems(group.items, expanded, ARTIFACT_PREVIEW_LIMIT);
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "sci-group", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("h3", { children: [
      group.label,
      " ",
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "sci-small", children: [
        "\u5171 ",
        group.items.length,
        " \u9879"
      ] })
    ] }),
    group.items.length ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "sci-file-list", children: items.map((file) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "sci-file", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("strong", { children: file.path.split(/[\\/]/).pop() || file.path }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "sci-small", children: file.path })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("a", { className: "sci-button sci-button-small", href: file.url, target: "_blank", rel: "noreferrer", children: "\u6253\u5F00" })
      ] }, file.path)) }),
      group.items.length > ARTIFACT_PREVIEW_LIMIT && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", className: "sci-button sci-button-small", "aria-expanded": expanded, onClick: () => setExpanded((value) => !value), children: expanded ? "\u6536\u8D77" : `\u67E5\u770B\u5168\u90E8 ${group.items.length} \u9879` })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "sci-small", children: [
      "\u6682\u65E0",
      group.label,
      "\u3002"
    ] })
  ] });
}
function ReviewGroup({ reviews }) {
  const [expanded, setExpanded] = (0, import_react6.useState)(false);
  const items = visibleItems(reviews, expanded, ARTIFACT_PREVIEW_LIMIT);
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "sci-group", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("h3", { children: [
      "\u5BA1\u67E5\u8BB0\u5F55 ",
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "sci-small", children: [
        "\u5171 ",
        reviews.length,
        " \u6761"
      ] })
    ] }),
    reviews.length ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "sci-task-list", children: items.map((review) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "sci-task-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("b", { children: review.resultTitle || review.scope || review.runId || "\u4E3B\u5F20\u5BA1\u67E5" }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "sci-small", children: review.message || review.summary || "\u6458\u8981\u672A\u63D0\u4F9B" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Badge, { tone: review.severity === "fail" ? "bad" : review.severity === "warn" ? "warn" : "default", children: review.severity || "\u72B6\u6001\u5F85\u6838\u5BF9" })
      ] }, review.runId || review.id || JSON.stringify(review))) }),
      reviews.length > ARTIFACT_PREVIEW_LIMIT && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", className: "sci-button sci-button-small", "aria-expanded": expanded, onClick: () => setExpanded((value) => !value), children: expanded ? "\u6536\u8D77" : `\u67E5\u770B\u5168\u90E8 ${reviews.length} \u6761` })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "sci-small", children: "\u6682\u65E0\u5BA1\u67E5\u8BB0\u5F55\u3002" })
  ] });
}
function FigureDialog({ figure, onClose }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "sci-modal-backdrop", role: "presentation", onMouseDown: (event) => {
    if (event.target === event.currentTarget) onClose();
  }, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("section", { className: "sci-modal", role: "dialog", "aria-modal": "true", "aria-label": `\u56FE\u4EF6\u9884\u89C8\uFF1A${figure.title}`, children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "sci-panel-heading", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h2", { children: figure.title }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { children: figure.resultId || "\u672A\u5173\u8054\u7814\u7A76\u7ED3\u679C" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Button, { onClick: onClose, children: "\u5173\u95ED" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(ImagePreview, { figure }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "sci-small", style: { marginTop: 12 }, children: [
      figure.version ? `\u767B\u8BB0\u7248\u672C ${figure.version}` : "\u767B\u8BB0\u7248\u672C\u672A\u8BB0\u5F55",
      " \xB7 ",
      timestampLabel(figure.registeredAt || figure.createdAt),
      " \xB7 ",
      figure.path || "\u6587\u4EF6\u8DEF\u5F84\u672A\u8BB0\u5F55"
    ] })
  ] }) });
}
function FigureCompareDialog({ comparison, onClose }) {
  const { current, previous } = comparison;
  const inferred = current.previousVersionRelation !== "recorded";
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "sci-modal-backdrop", role: "presentation", onMouseDown: (event) => {
    if (event.target === event.currentTarget) onClose();
  }, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("section", { className: "sci-modal sci-modal-wide", role: "dialog", "aria-modal": "true", "aria-label": `\u56FE\u4EF6\u7248\u672C\u5BF9\u6BD4\uFF1A${current.title}`, children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "sci-panel-heading", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h2", { children: "\u56FE\u4EF6\u7248\u672C\u5BF9\u6BD4" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { children: inferred ? "\u4E0A\u4E00\u6761\u8BB0\u5F55\u6309\u540C\u4E00\u7814\u7A76\u7ED3\u679C\u3001\u540C\u540D\u6587\u4EF6\u548C\u65F6\u95F4\u987A\u5E8F\u63A8\u6D4B\uFF1B\u540E\u7AEF\u672A\u8BB0\u5F55\u7248\u672C\u5173\u7CFB\u3002" : "\u4E0A\u4E00\u7248\u672C\u6765\u81EA\u540E\u7AEF\u767B\u8BB0\u7684 prevId \u7248\u672C\u94FE\u3002" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Button, { onClick: onClose, children: "\u5173\u95ED" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "sci-compare-grid", style: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 18 }, children: [previous, current].map((figure, index) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("article", { className: "sci-compare-item", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h3", { children: index === 0 ? inferred ? "\u8F83\u65E9\u7684\u540C\u540D\u8BB0\u5F55\uFF08\u63A8\u6D4B\uFF09" : "\u4E0A\u4E00\u767B\u8BB0\u7248\u672C" : "\u5F53\u524D\u8BB0\u5F55" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "sci-small", children: [
        figure.version ? `\u7248\u672C ${figure.version}` : "\u7248\u672C\u672A\u8BB0\u5F55",
        " \xB7 ",
        timestampLabel(figure.registeredAt || figure.createdAt)
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(ImagePreview, { figure }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "sci-small", children: figure.path || "\u6587\u4EF6\u8DEF\u5F84\u672A\u8BB0\u5F55" })
    ] }, figure.id || figure.path)) })
  ] }) });
}
function ArtifactsPage({ view, onAction }) {
  const [preview, setPreview] = (0, import_react6.useState)(null);
  const [comparison, setComparison] = (0, import_react6.useState)(null);
  const [kind, setKind] = (0, import_react6.useState)("all");
  const [resultId, setResultId] = (0, import_react6.useState)("all");
  const indexed = (view.artifacts.index || []).filter((item) => (kind === "all" || item.kind === kind) && (resultId === "all" || item.resultIds.includes(resultId)));
  const figures = view.artifacts.figures;
  const figureById = new Map(figures.filter((figure) => figure.id).map((figure) => [figure.id, figure]));
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "sci-stack", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Panel, { title: "\u56FE\u8868", subtitle: "\u56FE\u4EF6\u4F1A\u5728\u6D4F\u89C8\u5668\u5B9E\u9645\u52A0\u8F7D\u6210\u529F\u540E\u663E\u793A\uFF1B\u52A0\u8F7D\u5931\u8D25\u65F6\u53EF\u91CD\u8BD5\u6216\u76F4\u63A5\u6253\u5F00\u6587\u4EF6\u3002\u767B\u8BB0\u8FC7\u7248\u672C\u5173\u7CFB\u7684\u56FE\u4EF6\u53EF\u5E76\u6392\u6BD4\u8F83\u3002", action: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Button, { primary: true, onClick: () => onAction("draw", view.paper.results.find((item) => item.confirmed)?.id || null), disabled: !view.paper.results.some((item) => item.confirmed && view.paper.core.confirmed), title: !view.paper.results.some((item) => item.confirmed && view.paper.core.confirmed) ? "\u5148\u786E\u8BA4\u6838\u5FC3\u7ED3\u8BBA\u548C\u4E00\u9879\u7814\u7A76\u7ED3\u679C\uFF0C\u518D\u5EFA\u7ACB\u6B63\u5F0F\u7ED8\u56FE\u8BA1\u5212\u3002" : void 0, children: "\u57FA\u4E8E\u73B0\u6709\u7ED3\u679C\u5F00\u59CB\u7ED8\u56FE" }), children: figures.length ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "sci-gallery", children: figures.map((figure) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(FigureCard, { figure, previous: figureById.get(figure.previousVersionId), onOpen: setPreview, onCompare: setComparison }, figure.id || figure.path)) }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(EmptyState, { title: "\u8FD8\u6CA1\u6709\u767B\u8BB0\u56FE\u4EF6", children: "\u57FA\u4E8E\u5DF2\u786E\u8BA4\u7684\u6838\u5FC3\u7ED3\u8BBA\u548C\u7814\u7A76\u7ED3\u679C\u5EFA\u7ACB\u7ED8\u56FE\u8BA1\u5212\u540E\uFF0C\u56FE\u4EF6\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002" }) }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(Panel, { title: "\u9879\u76EE\u7D22\u5F15", subtitle: "\u53EA\u663E\u793A\u5F53\u524D\u9879\u76EE\u5DF2\u767B\u8BB0\u7684\u6587\u4EF6\u3002\u5B58\u5728\u6587\u4EF6\u4E0D\u7B49\u4E8E\u8BC1\u636E\u5DF2\u6838\u9A8C\u3002", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "sci-result-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("select", { "aria-label": "\u6309\u7C7B\u578B\u7B5B\u9009", value: kind, onChange: (event) => setKind(event.target.value), children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: "all", children: "\u5168\u90E8\u7C7B\u578B" }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: "data", children: "\u6570\u636E" }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: "code", children: "\u4EE3\u7801" }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: "figure", children: "\u56FE\u4EF6" }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: "manuscript", children: "\u7A3F\u6BB5" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("select", { "aria-label": "\u6309 Result \u7B5B\u9009", value: resultId, onChange: (event) => setResultId(event.target.value), children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: "all", children: "\u5168\u90E8 Result" }),
          view.paper.results.map((result) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: result.id, children: result.title }, result.id))
        ] })
      ] }),
      indexed.length ? indexed.map((item) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "sci-file", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("strong", { children: item.summary || item.id }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "sci-small", children: [
            item.kind,
            " \xB7 ",
            item.source,
            " \xB7 ",
            item.status === "missing" ? "\u5DF2\u5931\u8054" : "\u53EF\u5B9A\u4F4D"
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Button, { small: true, onClick: () => onAction("structure", { objectId: item.resultIds[0] || "core", revision: view.paper.results.find((result) => result.id === item.resultIds[0])?.revision }), children: "\u5728\u5BF9\u8BDD\u4E2D\u5F15\u7528" })
      ] }, item.id)) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "sci-small", children: "\u5F53\u524D\u7B5B\u9009\u4E0B\u6CA1\u6709\u767B\u8BB0\u6210\u679C\u3002" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(Panel, { title: "\u5176\u4ED6\u6210\u679C", subtitle: "\u6309\u7528\u9014\u5206\u7EC4\u6D4F\u89C8\u5DE5\u4F5C\u533A\u6587\u4EF6\u3002", children: [
      view.artifacts.groups.filter((group) => group.id !== "figures").map((group) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(FileGroup, { group }, group.id)),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(ReviewGroup, { reviews: view.artifacts.reviews })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "sci-result-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Button, { onClick: () => onAction("write"), children: "\u64B0\u5199\u8BBA\u6587" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Button, { onClick: () => onAction("slides"), children: "\u5236\u4F5C\u6C47\u62A5 PPT" })
    ] }),
    preview && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(FigureDialog, { figure: preview, onClose: () => setPreview(null) }, preview.id || preview.path),
    comparison && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(FigureCompareDialog, { comparison, onClose: () => setComparison(null) }, `${comparison.previous.id}:${comparison.current.id}`)
  ] });
}

// client-src/workbench/ExpertSetupPage.jsx
var import_react7 = __toESM(require("react"), 1);
var import_jsx_runtime6 = require("react/jsx-runtime");
async function request(binding, payload, signal) {
  const response = await fetch("/plugins/dsh-science/skill-manage", {
    method: "POST",
    credentials: "same-origin",
    signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: binding.sessionId, expectedProjectId: binding.projectId, ...payload })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "\u65E0\u6CD5\u8BFB\u53D6\u9879\u76EE\u4E13\u5BB6");
  return data;
}
function Expert({ role: role2, data, act, busy, openManager }) {
  const [kind, setKind] = (0, import_react7.useState)("global");
  const [value, setValue] = (0, import_react7.useState)("");
  const links = data.config.links[role2] || [];
  const local = data.installed[role2] || [];
  const options = kind === "global" ? data.global.map((s) => s.name) : data.legacy[role2] || [];
  const typeLabel = { global: "\u5168\u5C40 Skill", legacy: "\u65E7\u7248\u6280\u80FD", local: "\u9879\u76EE Skill", plugin: "DSH \u63D2\u4EF6" };
  const choose = kind === "global" || kind === "legacy";
  const submit = async (event) => {
    event.preventDefault();
    const ok = await act(kind === "local" ? { action: "install", role: role2, repoUrl: value.trim() } : { action: "link", role: role2, kind, value: value.trim() });
    if (ok) setValue("");
  };
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(Panel, { title: data.roles[role2]?.label || role2, action: data.writable && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Button, { small: true, quiet: true, disabled: busy, onClick: () => act({ action: "hide", role: role2 }), children: "\u79FB\u51FA\u9879\u76EE\u4E13\u5BB6" }), children: [
    links.map((l) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "sci-expert-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { children: [
        typeLabel[l.kind],
        " \xB7 ",
        l.kind === "plugin" ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("a", { href: l.value, target: "_blank", rel: "noreferrer", children: l.value }) : l.value
      ] }),
      data.writable && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Button, { small: true, quiet: true, disabled: busy, onClick: () => act({ action: "unlink", role: role2, kind: l.kind, value: l.value }), children: "\u53D6\u6D88\u5173\u8054" })
    ] }, l.kind + "/" + l.value)),
    local.map((s) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "sci-expert-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { children: [
        "\u9879\u76EE Skill \xB7 ",
        s.name,
        s.warn ? "\uFF08\u4ED3\u5E93\u4E2D\u672A\u53D1\u73B0 SKILL.md\uFF09" : ""
      ] }),
      data.writable && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Button, { small: true, quiet: true, disabled: busy, onClick: () => act({ action: "remove", role: role2, name: s.name }), children: "\u4ECE\u672C\u9879\u76EE\u5378\u8F7D" })
    ] }, s.name)),
    data.writable && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("form", { className: "sci-expert-form", onSubmit: submit, children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("select", { "aria-label": "\u6269\u5C55\u7C7B\u578B", value: kind, onChange: (e) => {
        setKind(e.target.value);
        setValue("");
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: "global", children: "\u5F15\u7528\u5168\u5C40 Skill" }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: "local", children: "\u5B89\u88C5\u9879\u76EE Skill" }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: "plugin", children: "\u5173\u8054 DSH \u63D2\u4EF6" }),
        !!data.legacy[role2]?.length && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: "legacy", children: "\u5F15\u7528\u65E7\u7248\u89D2\u8272\u6280\u80FD" })
      ] }),
      choose ? /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("select", { "aria-label": "\u9009\u62E9\u6280\u80FD", value, onChange: (e) => setValue(e.target.value), children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: "", children: options.length ? "\u9009\u62E9\u5DF2\u5B89\u88C5\u7684\u6280\u80FD" : "\u6682\u65E0\u53EF\u5F15\u7528\u7684\u6280\u80FD" }),
        options.map((n) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { children: n }, n))
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("input", { "aria-label": "\u6269\u5C55\u6765\u6E90\u94FE\u63A5", type: "url", required: true, value, placeholder: kind === "plugin" ? "npm \u5305\u6216 GitHub / GitLab \u4ED3\u5E93\u94FE\u63A5" : "GitHub / GitLab \u4ED3\u5E93\u9996\u9875\u94FE\u63A5", onChange: (e) => setValue(e.target.value) }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Button, { small: true, type: "submit", disabled: busy || !value.trim(), children: kind === "local" ? "\u5B89\u88C5\u5230\u9879\u76EE" : "\u5173\u8054" })
    ] }),
    (kind === "plugin" || links.some((l) => l.kind === "plugin")) && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("p", { className: "sci-small", children: [
      "\u9879\u76EE\u4FDD\u5B58\u63D2\u4EF6\u6765\u6E90\u3002\u5B89\u88C5\u548C\u542F\u7528\u4F1A\u4F5C\u7528\u4E8E\u5F53\u524D DSH \u914D\u7F6E\u3002 ",
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Button, { quiet: true, small: true, onClick: openManager, children: "\u6253\u5F00 DSH \u63D2\u4EF6\u7BA1\u7406\u5668" })
    ] })
  ] });
}
function ExpertSetupPage({ binding, services }) {
  const [data, setData] = (0, import_react7.useState)(null);
  const [busy, setBusy] = (0, import_react7.useState)(false);
  const [error, setError] = (0, import_react7.useState)("");
  const [role2, setRole] = (0, import_react7.useState)("");
  const [retry, setRetry] = (0, import_react7.useState)(0);
  (0, import_react7.useEffect)(() => {
    if (!binding.projectId) return;
    const abort = new AbortController();
    request(binding, { action: "inspect" }, abort.signal).then(setData).catch((e) => {
      if (!abort.signal.aborted) setError(e.message);
    });
    return () => abort.abort();
  }, [binding.sessionId, binding.projectId, retry]);
  const act = async (payload) => {
    setBusy(true);
    setError("");
    try {
      await request(binding, payload);
      setData(await request(binding, { action: "inspect" }));
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const bind = async () => {
    setBusy(true);
    try {
      const r = await binding.act({ actionId: "project.ensure-binding", commandId: crypto.randomUUID(), payload: {} });
      if (r.status !== 200) throw new Error(r.body?.reason || "\u521B\u5EFA\u9879\u76EE\u5931\u8D25");
      await binding.refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const openManager = () => {
    if (!services.openPluginManager?.()) setError("\u8BF7\u4ECE DSH \u8BBE\u7F6E\u6253\u5F00\u300C\u63D2\u4EF6\u300D\u7BA1\u7406\u9875\u9762\u3002");
  };
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "sci-project-experts", children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("h1", { children: "\u9879\u76EE\u4E13\u5BB6" }),
    error && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(StatusMessage, { tone: "error", children: [
      error,
      " ",
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Button, { small: true, onClick: () => {
        setError("");
        setRetry(retry + 1);
      }, children: "\u91CD\u65B0\u8BFB\u53D6" })
    ] }),
    !binding.projectId ? /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(Panel, { title: "\u4E3A\u5F53\u524D\u8BFE\u9898\u914D\u7F6E\u4E13\u5BB6", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { children: "\u5148\u5C06\u6B64\u4F1A\u8BDD\u7ED1\u5B9A\u5230\u79D1\u7814\u9879\u76EE\uFF0C\u518D\u9009\u62E9\u9700\u8981\u7684\u4E13\u5BB6\u548C\u6269\u5C55\u3002" }),
      binding.ref?.relationship === "unbound" && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Button, { primary: true, disabled: busy, onClick: bind, children: "\u521B\u5EFA\u5F53\u524D\u79D1\u7814\u9879\u76EE" })
    ] }) : !data ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { role: "status", children: "\u6B63\u5728\u8BFB\u53D6\u4E13\u5BB6\u914D\u7F6E\u2026" }) : /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Panel, { title: "\u9009\u62E9\u4E13\u5BB6", subtitle: "\u9009\u62E9\u53EA\u4FDD\u5B58\u5728\u5F53\u524D\u9879\u76EE\u3002\u6D3E\u53D1\u4EFB\u52A1\u65F6\u624D\u4F1A\u542F\u52A8\u4E13\u5BB6\u3002", children: data.writable ? /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "sci-expert-presets", children: Object.entries(data.presets).map(([id, p]) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(Button, { disabled: busy || p.roles.every((r) => data.config.roles.includes(r)), onClick: () => act({ action: "preset", value: id }), children: [
          p.label,
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("small", { children: p.roles.map((r) => data.roles[r].label).join(" \xB7 ") })
        ] }, id)) }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "sci-expert-form", children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("select", { "aria-label": "\u6DFB\u52A0\u5355\u4E2A\u4E13\u5BB6", value: role2, onChange: (e) => setRole(e.target.value), children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: "", children: "\u9009\u62E9\u5176\u4ED6\u4E13\u5BB6" }),
            Object.entries(data.roles).filter(([id]) => !data.config.roles.includes(id)).map(([id, d]) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: id, children: d.label }, id))
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Button, { small: true, disabled: busy || !role2, onClick: async () => {
            if (await act({ action: "add", role: role2 })) setRole("");
          }, children: "\u6DFB\u52A0\u4E13\u5BB6" })
        ] })
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { children: "\u8BF7\u5728\u9879\u76EE\u7684\u4E3B\u4F1A\u8BDD\u4FEE\u6539\u4E13\u5BB6\u914D\u7F6E\u3002" }) }),
      data.config.roles.map((r) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Expert, { role: r, data, act, busy, openManager }, r))
    ] })
  ] });
}

// client-src/project/use-project-binding.js
var import_react8 = require("react");

// client-src/project/project-binding.js
function createProjectBinding({ getSessionId, fetchImpl, eventSourceImpl, onLog } = {}) {
  const fetchJson = fetchImpl || ((url, opts) => fetch(url, { credentials: "same-origin", ...opts }).then(async (r) => ({ ok: r.ok, status: r.status, body: await r.json().catch(() => null) })));
  const fetchImplFallback = fetchJson;
  const _fetch = fetchJson;
  const ES = eventSourceImpl || (typeof EventSource !== "undefined" ? EventSource : null);
  let generation = 0;
  let disposed = false;
  let observe = null;
  let state = { status: "loading", project: null, ref: null, revision: null, error: null, stale: false, updatedAt: 0 };
  const listeners = /* @__PURE__ */ new Set();
  function emit(patch) {
    state = { ...state, ...patch };
    for (const listener of listeners) {
      try {
        listener(state);
      } catch {
      }
    }
  }
  function closeObserve() {
    if (observe) {
      try {
        observe.es.close();
      } catch {
      }
      observe = null;
    }
  }
  function startObserve(sid, gen) {
    if (disposed || !ES) return;
    if (observe && observe.sid === sid && observe.gen === gen) return;
    closeObserve();
    let es;
    try {
      es = new ES(`/plugins/dsh-science/project/observe?sessionId=${encodeURIComponent(sid)}`);
    } catch (err) {
      emit({ stale: true, error: `observe \u5EFA\u7ACB\u5931\u8D25\uFF1A${err && err.message}` });
      return;
    }
    observe = { es, sid, gen };
    const guarded = (fn) => (...args) => {
      if (disposed || gen !== generation || !observe || observe.es !== es) return;
      fn(...args);
    };
    es.addEventListener("baseline", guarded((ev) => {
      const data = safeParse(ev.data);
      if (!data) return;
      if (data.revision != null && data.revision !== state.revision) {
        void refetch(sid, gen);
      } else if (data.revision == null && state.status === "ready") {
        emit({ status: "empty", project: null, revision: null, stale: false });
      }
    }));
    es.addEventListener("change", guarded((ev) => {
      const frame = safeParse(ev.data);
      if (!frame) return;
      const rev = frame.projectRevision;
      if (rev == null) return;
      if (state.revision != null && rev <= state.revision) return;
      if (rev > (state.revision ?? -1) + 1) {
        void refetch(sid, gen);
        return;
      }
      void refetch(sid, gen);
    }));
    es.addEventListener("reset", guarded((ev) => {
      const data = safeParse(ev.data);
      if (!data) return;
      emit({ stale: false });
      void refetch(sid, gen);
    }));
    es.addEventListener("streamFailure", guarded((ev) => {
      const data = safeParse(ev.data) || {};
      emit({ stale: true, error: `\u6D41\u5931\u8D25\uFF1A${data.reason || "unknown"}` });
      closeObserve();
      scheduleReconnect(sid, gen);
    }));
    es.onerror = guarded(() => {
      emit({ stale: true, error: "\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u72B6\u6001\u53EF\u80FD\u8FC7\u671F" });
    });
  }
  let reconnectTimer = null;
  function scheduleReconnect(sid, gen) {
    if (disposed || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (disposed || gen !== generation) return;
      void refresh();
    }, 2e3);
  }
  async function refetch(sid, gen) {
    try {
      const res = await _fetch(`/plugins/dsh-science/project/get?sessionId=${encodeURIComponent(sid)}`);
      if (disposed || gen !== generation) return;
      if (!res.ok || !res.body) {
        emit({ stale: true, error: `\u8BFB\u53D6\u5931\u8D25\uFF08HTTP ${res.status}\uFF09` });
        return;
      }
      const body = res.body;
      if (!body.project) {
        emit({ status: "empty", project: null, ref: body.ref || state.ref, revision: null, stale: false, error: null, updatedAt: Date.now() });
        return;
      }
      emit({
        status: "ready",
        project: body.project,
        team: body.team || { members: [], tasks: [] },
        ref: body.ref || state.ref,
        revision: body.project.revision,
        stale: false,
        error: null,
        updatedAt: Date.now()
      });
    } catch (err) {
      if (disposed || gen !== generation) return;
      emit({ stale: true, error: `\u8BFB\u53D6\u5931\u8D25\uFF1A${err && err.message || "network"}` });
    }
  }
  async function refresh() {
    if (disposed) return state;
    const gen = ++generation;
    closeObserve();
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    const sid = getSessionId();
    if (!sid) {
      emit({ status: "loading", project: null, ref: null, revision: null, stale: false, error: null });
      return state;
    }
    try {
      const res = await _fetch(`/plugins/dsh-science/project/get?sessionId=${encodeURIComponent(sid)}`);
      if (disposed || gen !== generation) return state;
      if (res.status === 404) {
        emit({ status: "unauthorized", project: null, ref: null, revision: null, stale: false, error: "unknown-session" });
        return state;
      }
      if (!res.ok || !res.body) {
        emit({ status: "offline", stale: true, error: `HTTP ${res.status}` });
        scheduleReconnect(sid, gen);
        return state;
      }
      const body = res.body;
      if (!body.project) {
        emit({ status: "empty", project: null, ref: body.ref || null, revision: null, stale: false, error: null, updatedAt: Date.now() });
        startObserve(sid, gen);
        return state;
      }
      emit({ status: "ready", project: body.project, team: body.team || { members: [], tasks: [] }, ref: body.ref || null, revision: body.project.revision, stale: false, error: null, updatedAt: Date.now() });
      startObserve(sid, gen);
      return state;
    } catch (err) {
      if (disposed || gen !== generation) return state;
      emit({ status: "offline", stale: true, error: err && err.message || "network" });
      scheduleReconnect(sid, gen);
      return state;
    }
  }
  async function act({ actionId, commandId, payload, expectedRevision }) {
    const sid = getSessionId();
    if (!sid) return { status: 400, body: { kind: "invalid", reason: "\u65E0\u5F53\u524D\u4F1A\u8BDD" } };
    try {
      const raw = await fetchImplFallback(`/plugins/dsh-science/project/act`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: sid, actionId, commandId, payload, expectedRevision })
      });
      let status = 0;
      let body = null;
      if (typeof raw.json === "function") {
        status = raw.status;
        body = await raw.json().catch(() => null);
      } else {
        status = raw.status;
        body = raw.body;
      }
      return { status, body };
    } catch (err) {
      return { status: 0, body: { kind: "invalid", reason: err && err.message || "network" } };
    }
  }
  function subscribe(listener) {
    listeners.add(listener);
    listener(state);
    return () => listeners.delete(listener);
  }
  function getState() {
    return state;
  }
  function dispose() {
    disposed = true;
    closeObserve();
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    listeners.clear();
  }
  return { refresh, act, subscribe, getState, dispose };
}
function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// client-src/project/object-hash.js
var EXCLUDED = /* @__PURE__ */ new Set(["revision", "confirmed", "confirmation", "contentHash", "updatedAt", "history"]);
function contentOf(value) {
  if (!value || typeof value !== "object") return {};
  const out = {};
  for (const [key, inner] of Object.entries(value)) {
    if (!EXCLUDED.has(key)) out[key] = inner;
  }
  return out;
}
async function hashOf(value) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle || typeof subtle.digest !== "function") return "";
  const data = new TextEncoder().encode(JSON.stringify(contentOf(value)));
  const digest = await subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function objectContentHashesOf(project) {
  const paper = project && project.snapshot && project.snapshot.paper;
  if (!paper || typeof paper !== "object") return { core: "", results: {} };
  try {
    const results = {};
    for (const result of Array.isArray(paper.results) ? paper.results : []) {
      if (result && result.id) results[result.id] = await hashOf(result);
    }
    return { core: await hashOf(paper.core), results };
  } catch {
    return { core: "", results: {} };
  }
}

// client-src/workbench/state-view.js
var STAGES = Object.freeze([
  { id: "explore", label: "\u7814\u7A76\u63A2\u7D22" },
  { id: "frame", label: "\u6587\u7AE0\u7ED3\u6784" },
  { id: "execute", label: "\u4EFB\u52A1\u7EC6\u5316" },
  { id: "synthesize", label: "\u5206\u6790\u4E0E\u7ED8\u56FE" },
  { id: "draft", label: "\u8BBA\u6587\u5199\u4F5C" },
  { id: "audit", label: "\u6C47\u62A5\u4E0E\u6295\u7A3F" }
]);
var LIVE_STATUSES = /* @__PURE__ */ new Set(["claimed", "in_progress", "running", "working"]);
var DONE_STATUSES = /* @__PURE__ */ new Set(["completed", "done"]);
var HIDDEN_STATUSES = /* @__PURE__ */ new Set(["deleted", "cancelled"]);
var IMAGE_EXTENSIONS = /* @__PURE__ */ new Set(["png", "jpg", "jpeg", "webp", "svg"]);
var asArray = (value) => Array.isArray(value) ? value : [];
var asText = (value) => typeof value === "string" ? value : "";
var nonEmpty = (value) => asText(value).trim();
function listOf(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value);
  return [];
}
function stageStateOf(stage, currentStage) {
  const stageIndex = STAGES.findIndex((item) => item.id === stage.id);
  const currentIndex = Math.max(0, STAGES.findIndex((item) => item.id === currentStage));
  if (stageIndex < currentIndex) return "completed";
  if (stageIndex === currentIndex) return "current";
  return "upcoming";
}
function statusLabel(status) {
  const labels = {
    pending: "\u7B49\u5F85\u4E2D",
    claimed: "\u5DF2\u9886\u53D6",
    in_progress: "\u8FDB\u884C\u4E2D",
    working: "\u5DE5\u4F5C\u4E2D",
    running: "\u8FD0\u884C\u4E2D",
    completed: "\u5DF2\u5B8C\u6210",
    failed: "\u5931\u8D25",
    blocked: "\u53D7\u963B",
    cancelled: "\u5DF2\u53D6\u6D88"
  };
  return labels[status] || "\u72B6\u6001\u5F85\u66F4\u65B0";
}
function taskResultIds(task) {
  const ids = [];
  if (typeof task?.resultId === "string" && task.resultId) ids.push(task.resultId);
  for (const id of asArray(task?.resultIds)) if (typeof id === "string" && id && !ids.includes(id)) ids.push(id);
  return ids;
}
function readinessForResult(blueprint, result) {
  const row = asArray(blueprint?.paperSpine?.results).find((item) => item && item.id === result.id);
  if (row?.readiness && typeof row.readiness === "object") return row.readiness;
  const evidence2 = asArray(result.evidence).filter((item) => item && item.state === "verified").length;
  const claims = asArray(result.claims).length;
  const manuscript = nonEmpty(result.manuscriptRole) && result.manuscriptRole !== "excluded";
  return {
    scientific: { state: evidence2 > 0 ? "in_progress" : "blocked", blockers: evidence2 > 0 ? [] : ["\u5C1A\u65E0\u53EF\u6838\u9A8C\u8BC1\u636E"] },
    manuscript: { state: manuscript && claims > 0 ? "in_progress" : "blocked", blockers: manuscript && claims > 0 ? [] : ["\u5C1A\u65E0\u5199\u4F5C\u6750\u6599"] },
    submission: { state: "blocked", blockers: ["\u6295\u7A3F\u51C6\u5907\u4FE1\u606F\u5C1A\u672A\u6838\u5BF9"] }
  };
}
function memberLiveLabel(status) {
  const labels = {
    claimed: "\u5DF2\u9886\u53D6",
    working: "\u5DE5\u4F5C\u4E2D",
    running: "\u6B63\u5728\u8FD0\u884C",
    idle: "\u7A7A\u95F2",
    offline: "\u79BB\u7EBF",
    unknown: "\u72B6\u6001\u5F85\u786E\u8BA4",
    "claimed/working": "\u5DF2\u9886\u53D6 \xB7 \u5DE5\u4F5C\u72B6\u6001\u5F85\u786E\u8BA4"
  };
  return labels[status] || "\u72B6\u6001\u5F85\u66F4\u65B0";
}
function memberLiveTone(status) {
  if (status === "running" || status === "working") return "good";
  if (status === "claimed" || status === "claimed/working") return "warn";
  if (status === "offline") return "bad";
  return "default";
}
function taskBlockers(task, taskById) {
  const blockers = [];
  if (task.status === "blocked") blockers.push(nonEmpty(task.blockedReason) || "\u4EFB\u52A1\u5DF2\u6807\u8BB0\u4E3A\u53D7\u963B");
  for (const id of asArray(task.blockedBy)) {
    const dependency = taskById.get(id);
    if (!dependency || !DONE_STATUSES.has(dependency.status)) {
      blockers.push(dependency ? `\u7B49\u5F85\u201C${dependency.subject || dependency.id}\u201D\u5B8C\u6210` : `\u4F9D\u8D56\u4EFB\u52A1 ${id} \u4E0D\u5728\u5F53\u524D\u4EFB\u52A1\u677F`);
    }
  }
  return [...new Set(blockers)];
}
function nextStepOf(paper, team) {
  if (!paper.core.claim && paper.results.length === 0) return { label: "\u5F00\u59CB\u63A2\u7D22\u7814\u7A76\u95EE\u9898", action: "explore" };
  if (paper.core.claim && !paper.core.confirmed) return { label: "\u786E\u8BA4\u6838\u5FC3\u7814\u7A76\u7ED3\u8BBA", action: "confirm", targetId: "core" };
  const unconfirmed = paper.results.find((result) => !result.confirmed);
  if (unconfirmed) return { label: "\u68C0\u67E5\u5E76\u786E\u8BA4\u6587\u7AE0\u7ED3\u6784", action: "confirm", targetId: unconfirmed.id };
  const withoutTasks = paper.results.find((result) => result.confirmed && result.taskCount === 0 && !["dropped"].includes(result.status));
  if (withoutTasks) return { label: "\u7EC6\u5316\u6267\u884C\u4EFB\u52A1", action: "refine_tasks", targetId: withoutTasks.id };
  if (team.counts.running > 0 || team.counts.waiting > 0 || team.counts.blocked > 0) return { label: "\u67E5\u770B\u56E2\u961F\u6267\u884C\u8FDB\u5C55", page: "team" };
  if (paper.results.length > 0) return { label: "\u6839\u636E\u5DF2\u786E\u8BA4\u7ED3\u679C\u7EE7\u7EED\u5199\u4F5C", action: "write" };
  return { label: "\u751F\u6210\u6587\u7AE0\u7ED3\u6784\u8349\u6848", action: "generate_structure" };
}
function fileCategory(path) {
  const text = asText(path).toLowerCase();
  const ext = text.split(".").pop() || "";
  if (IMAGE_EXTENSIONS.has(ext) || ["pdf", "tif", "tiff", "eps"].includes(ext) || /figure|plot|chart|图/.test(text)) return "figures";
  if (["doc", "docx", "md", "tex", "rtf"].includes(ext) || /manuscript|paper|draft|论文/.test(text)) return "manuscript";
  if (["ppt", "pptx", "key"].includes(ext) || /slide|presentation|汇报|答辩/.test(text)) return "presentation";
  if (["csv", "tsv", "parquet", "rds", "rdata", "ipynb", "py", "r", "m", "jl", "json"].includes(ext) || /data|code|analysis|result|数据|代码/.test(text)) return "data-code";
  return "other";
}
function fileUrl(path) {
  return `/plugins/dsh-science/file?path=${encodeURIComponent(path)}`;
}
var ARTIFACT_KIND_LABELS = Object.freeze({
  data: "\u6570\u636E",
  code: "\u4EE3\u7801",
  figure: "\u56FE\u4EF6",
  manuscript: "\u7A3F\u6BB5",
  reference: "\u53C2\u8003\u6587\u732E",
  other: "\u5176\u4ED6\u6210\u679C"
});
function railFiguresOf(snapshot) {
  const legacy = listOf(snapshot.figures);
  if (legacy.length > 0) return legacy;
  const projectId = nonEmpty(snapshot.projectId);
  return asArray(snapshot.artifactIndex?.items).filter((item) => item && item.kind === "figure" && (!projectId || !item.projectId || item.projectId === projectId)).slice().sort((a, b) => Number(b.registeredAt || b.updatedAt || 0) - Number(a.registeredAt || a.updatedAt || 0)).slice(0, 8).map((item) => ({
    id: item.id,
    title: nonEmpty(item.summary) || ARTIFACT_KIND_LABELS.figure,
    resultId: asArray(item.resultIds)[0] || "",
    version: nonEmpty(item.versionToken),
    status: nonEmpty(item.status) || "available",
    source: nonEmpty(item.source),
    verified: item.verified === true,
    registeredAt: item.registeredAt || item.updatedAt || null,
    previewable: false,
    url: null
  }));
}
function stateViewOf(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || snapshot.error) {
    return { available: false, error: asText(snapshot?.error) || "\u5F53\u524D\u65E0\u6CD5\u8BFB\u53D6\u79D1\u7814\u5DE5\u4F5C\u53F0\u72B6\u6001\u3002" };
  }
  const blueprint = snapshot.blueprint && typeof snapshot.blueprint === "object" ? snapshot.blueprint : {};
  const teamState = snapshot.team && typeof snapshot.team === "object" ? snapshot.team : {};
  const rawResults = asArray(blueprint.results);
  const rawTasks = asArray(teamState.tasks).filter((task) => task && !HIDDEN_STATUSES.has(task.status));
  const taskById = new Map(rawTasks.filter((task) => task.id).map((task) => [task.id, task]));
  const figures = railFiguresOf(snapshot);
  const files = asArray(snapshot.files);
  const tasks = rawTasks.map((task) => {
    const blockers = taskBlockers(task, taskById);
    return {
      ...task,
      // 术语统一：有未满足依赖/被标记受阻的任务一律显示「受阻」，不再与「等待中」双口径
      label: blockers.length > 0 ? "\u53D7\u963B" : statusLabel(task.status),
      resultIds: taskResultIds(task),
      blockers,
      isBlocked: blockers.length > 0,
      isRunning: LIVE_STATUSES.has(task.status),
      isComplete: DONE_STATUSES.has(task.status)
    };
  });
  const resultRows = rawResults.filter((result) => result && typeof result === "object").map((result) => {
    const linkedTasks = tasks.filter((task) => taskResultIds(task).includes(result.id) || asArray(result.tasks).includes(task.id));
    const linkedFigures = figures.filter((figure) => figure && (figure.resultId === result.id || asArray(figure.resultIds).includes(result.id) || asArray(result.figures).includes(figure.id)));
    const readiness = readinessForResult(blueprint, result);
    const required = Object.values(readiness).filter((item) => item && item.state === "blocked").flatMap((item) => asArray(item.blockers));
    const recommended = Object.values(readiness).filter((item) => item && item.state === "in_progress").flatMap((item) => asArray(item.blockers));
    return {
      ...result,
      title: nonEmpty(result.title) || nonEmpty(result.claim) || "\u672A\u547D\u540D\u7814\u7A76\u7ED3\u679C",
      statusLabel: { planned: "\u8BA1\u5212\u4E2D", in_progress: "\u8FDB\u884C\u4E2D", supported: "\u5DF2\u83B7\u5F97\u652F\u6301", negative: "\u4E0E\u9884\u671F\u4E0D\u7B26", dropped: "\u4E0D\u7EB3\u5165\u6B63\u6587" }[result.status] || "\u72B6\u6001\u5F85\u6838\u5BF9",
      confirmed: result.confirmed === true,
      readiness,
      taskCount: linkedTasks.length,
      completedTaskCount: linkedTasks.filter((task) => task.isComplete).length,
      runningTaskCount: linkedTasks.filter((task) => task.isRunning).length,
      figures: linkedFigures,
      materials: (snapshot.artifactIndex && snapshot.artifactIndex.items || []).filter((item) => item.resultIds && item.resultIds.includes(result.id)),
      requiredItems: [...new Set(required)],
      recommendedItems: [...new Set(recommended)],
      tasks: linkedTasks
    };
  });
  const activeTasks = tasks.filter((task) => !task.isComplete);
  const counts = {
    running: tasks.filter((task) => task.isRunning && !task.isBlocked).length,
    waiting: tasks.filter((task) => task.status === "pending" && !task.isBlocked).length,
    completed: tasks.filter((task) => task.isComplete).length,
    blocked: tasks.filter((task) => task.isBlocked).length
  };
  const members = asArray(teamState.members).map((member) => {
    const liveStatus = snapshot.memberLive?.[member.name] || "unknown";
    return {
      ...member,
      liveStatus,
      liveStatusLabel: memberLiveLabel(liveStatus),
      liveStatusTone: memberLiveTone(liveStatus),
      currentTasks: tasks.filter((task) => task.assignee === member.name && !task.isComplete),
      lastReport: nonEmpty(member.lastReport) || nonEmpty(member.lastSummary) || ""
    };
  });
  const blockedTasks = tasks.filter((task) => task.isBlocked);
  const activity = tasks.filter((task) => nonEmpty(task.report) || nonEmpty(task.resultSummary) || nonEmpty(task.updatedAt) || nonEmpty(task.completedAt)).sort((a, b) => Number(b.updatedAt || b.completedAt || 0) - Number(a.updatedAt || a.completedAt || 0)).slice(0, 8).map((task) => ({
    id: task.id,
    summary: nonEmpty(task.report) || nonEmpty(task.resultSummary) || task.subject || task.id,
    resultIds: task.resultIds,
    at: task.updatedAt || task.completedAt || task.createdAt || null,
    status: task.status
  }));
  const paper = {
    // T6：只写研究问题时，项目卡/右栏用问题作为可读标题，而不是“未命名研究项目”。
    title: nonEmpty(blueprint.core?.title) || nonEmpty(blueprint.question) || "\u672A\u547D\u540D\u7814\u7A76\u9879\u76EE",
    stage: STAGES.some((stage) => stage.id === blueprint.stage) ? blueprint.stage : "explore",
    stageLabel: STAGES.find((stage) => stage.id === blueprint.stage)?.label || "\u7814\u7A76\u63A2\u7D22",
    stageUpdatedAt: Number(blueprint.stageUpdatedAt || 0),
    stages: STAGES.map((stage) => ({ ...stage, state: stageStateOf(stage, blueprint.stage || "explore") })),
    venue: nonEmpty(blueprint.core?.venue),
    core: {
      title: nonEmpty(blueprint.core?.title),
      claim: nonEmpty(blueprint.core?.claim),
      innovation: nonEmpty(blueprint.core?.innovation),
      confirmed: blueprint.core?.confirmed === true,
      revision: blueprint.core?.revision || 1,
      // T4：确认按钮必须携带对象内容哈希
      contentHash: asText(blueprint.core?.contentHash)
    },
    narrative: nonEmpty(blueprint.narrative),
    question: nonEmpty(blueprint.question),
    scope: nonEmpty(blueprint.scope),
    sourceSummary: nonEmpty(blueprint.sourceSummary),
    questionUpdatedAt: Number(blueprint.questionUpdatedAt || 0),
    results: resultRows,
    supportedResults: resultRows.filter((result) => result.status === "supported").length,
    totalResults: resultRows.length,
    updatedAt: blueprint.updatedAt || snapshot.ts || null,
    error: nonEmpty(snapshot.blueprintError)
  };
  const pendingCore = (paper.core.claim || paper.core.title) && !paper.core.confirmed ? 1 : 0;
  paper.pendingConfirmationCount = pendingCore + resultRows.filter((result) => !result.confirmed && result.status !== "dropped" && result.manuscriptRole !== "excluded").length;
  const artifacts = files.map((file) => {
    const path = asText(file.path);
    const category = fileCategory(path);
    const ext = path.split(".").pop()?.toLowerCase() || "";
    return {
      ...file,
      path,
      category,
      url: path ? fileUrl(path) : null,
      previewable: category === "figures" && IMAGE_EXTENSIONS.has(ext)
    };
  });
  const figureRecords = figures.map((figure) => {
    const path = nonEmpty(figure.file) || nonEmpty(figure.path) || nonEmpty(figure.filePath) || nonEmpty(figure.outputPath);
    const ext = path.split(".").pop()?.toLowerCase() || "";
    return {
      ...figure,
      path,
      url: path ? fileUrl(path) : null,
      previewable: IMAGE_EXTENSIONS.has(ext),
      title: nonEmpty(figure.title) || nonEmpty(figure.name) || nonEmpty(path.split(/[\\/]/).pop()) || figure.id || "\u672A\u547D\u540D\u56FE\u4EF6"
    };
  });
  const figureById = new Map(figureRecords.filter((figure) => figure.id).map((figure) => [figure.id, figure]));
  const figureFamilyKey = (figure) => {
    const familyId = nonEmpty(figure.figureId) || nonEmpty(figure.familyId);
    if (familyId) return `id:${familyId}`;
    const stem = figure.path.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "").trim().toLowerCase();
    const resultId = nonEmpty(figure.resultId);
    return stem && resultId ? `result:${resultId}:stem:${stem}` : "";
  };
  for (const figure of figureRecords) {
    const explicitPreviousId = nonEmpty(figure.prevId) || nonEmpty(figure.previousVersionId);
    if (explicitPreviousId && figureById.has(explicitPreviousId)) {
      figure.previousVersionId = explicitPreviousId;
      figure.previousVersionRelation = "recorded";
      continue;
    }
    const timestamp = Number(figure.registeredAt || figure.createdAt || 0);
    const family = figureFamilyKey(figure);
    if (!family || !Number.isFinite(timestamp) || timestamp <= 0) continue;
    const previous = figureRecords.filter((candidate) => candidate !== figure && figureFamilyKey(candidate) === family).filter((candidate) => {
      const candidateTime = Number(candidate.registeredAt || candidate.createdAt || 0);
      return Number.isFinite(candidateTime) && candidateTime > 0 && candidateTime < timestamp;
    }).sort((a, b) => Number(b.registeredAt || b.createdAt || 0) - Number(a.registeredAt || a.createdAt || 0))[0];
    if (previous?.id) {
      figure.previousVersionId = previous.id;
      figure.previousVersionRelation = "inferred";
    }
  }
  const team = {
    members,
    tasks,
    activeTasks,
    counts,
    blockedTasks,
    activity,
    updatedAt: snapshot.ts || null
  };
  paper.nextStep = nextStepOf(paper, team);
  return {
    available: true,
    generatedAt: snapshot.generatedAt || null,
    paper,
    team,
    artifacts: {
      figures: figureRecords,
      plans: asArray(snapshot.figurePlans),
      files: artifacts,
      reviews: asArray(snapshot.reviews),
      workspaceRoot: asText(snapshot.workspaceRoot),
      index: snapshot.artifactIndex && snapshot.artifactIndex.items || [],
      recent: (snapshot.artifactIndex && snapshot.artifactIndex.items || []).slice(-3).reverse(),
      groups: [
        { id: "figures", label: "\u56FE\u8868", items: artifacts.filter((item) => item.category === "figures") },
        { id: "manuscript", label: "\u8BBA\u6587\u6587\u7A3F", items: artifacts.filter((item) => item.category === "manuscript") },
        { id: "presentation", label: "\u6C47\u62A5\u6750\u6599", items: artifacts.filter((item) => item.category === "presentation") },
        { id: "data-code", label: "\u6570\u636E\u4E0E\u4EE3\u7801", items: artifacts.filter((item) => item.category === "data-code") },
        { id: "other", label: "\u5176\u4ED6\u6587\u4EF6", items: artifacts.filter((item) => item.category === "other") }
      ]
    },
    experts: {
      roles: snapshot.roles && typeof snapshot.roles === "object" ? snapshot.roles : {},
      skillMenu: snapshot.skillMenu && typeof snapshot.skillMenu === "object" ? snapshot.skillMenu : { catalog: {}, installed: {}, integrations: [] }
    }
  };
}
function scopedTeamOf(team, projectId, rootSessionId) {
  const source = team && typeof team === "object" ? team : { members: [], tasks: [] };
  const matches = (record) => {
    if (!record || typeof record !== "object") return false;
    if (record.projectId) return Boolean(projectId) && String(record.projectId) === String(projectId);
    if (record.rootSessionId) return Boolean(rootSessionId) && String(record.rootSessionId) === String(rootSessionId);
    return false;
  };
  return {
    members: asArray(source.members).filter(matches).map((member) => ({
      name: asText(member.name),
      role: asText(member.role),
      label: asText(member.label) || asText(member.role) || asText(member.name),
      childId: asText(member.childId),
      parentSessionId: asText(member.parentSessionId)
    })),
    tasks: asArray(source.tasks).filter(matches).slice(-20).map((task) => ({
      id: asText(task.id),
      subject: asText(task.subject),
      status: asText(task.status) || "pending",
      assignee: asText(task.assignee),
      blockedBy: asArray(task.blockedBy).map(asText).filter(Boolean),
      resultIds: taskResultIds(task)
    }))
  };
}
function projectRawOf(project, { hashes = null, ref = null, team = null, now = null } = {}) {
  const snapshot = project && project.snapshot && typeof project.snapshot === "object" ? project.snapshot : {};
  const paper = snapshot.paper && typeof snapshot.paper === "object" ? snapshot.paper : { core: {}, results: [] };
  const core = { ...paper.core || {}, contentHash: hashes && hashes.core || asText(paper.core?.contentHash) };
  const results = asArray(paper.results).map((result) => ({
    ...result,
    contentHash: hashes && hashes.results && hashes.results[result.id] || asText(result?.contentHash)
  }));
  return {
    ts: now || Date.now(),
    projectId: project?.projectId || null,
    projectRevision: project?.revision ?? null,
    relationship: ref?.relationship || null,
    capabilities: ref?.capabilities || null,
    focus: snapshot.focus || null,
    blueprint: { ...paper, core, results },
    team: scopedTeamOf(team, project?.projectId || ref?.projectId || null, ref?.rootSessionId || null),
    figures: [],
    artifactIndex: snapshot.artifactIndex || { items: [] },
    figurePlans: [],
    reviews: [],
    files: [],
    roles: {},
    skillMenu: { catalog: {}, installed: {}, integrations: [] },
    memberLive: {},
    workspaceRoot: ""
  };
}

// client-src/project/use-project-binding.js
var SESSION_POLL_MS = 1e3;
var registry = /* @__PURE__ */ new Map();
function sessionOf(services) {
  try {
    return services?.getSessionId?.() || null;
  } catch {
    return null;
  }
}
function acquire(sessionId) {
  const existing = registry.get(sessionId);
  if (existing) {
    existing.refs += 1;
    return { entry: existing, created: false };
  }
  const entry = { binding: createProjectBinding({ getSessionId: () => sessionId }), refs: 1 };
  registry.set(sessionId, entry);
  return { entry, created: true };
}
function release(sessionId) {
  const entry = registry.get(sessionId);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs > 0) return;
  try {
    entry.binding.dispose();
  } catch {
  }
  registry.delete(sessionId);
}
var LOADING = Object.freeze({ status: "loading", project: null, ref: null, revision: null, stale: false, error: null, updatedAt: 0 });
function useProjectBinding(services) {
  const readSession = (0, import_react8.useCallback)(() => sessionOf(services), [services]);
  const [sessionId, setSessionId] = (0, import_react8.useState)(readSession);
  const [snap, setSnap] = (0, import_react8.useState)(LOADING);
  const [derived, setDerived] = (0, import_react8.useState)({ projectId: null, revision: null, raw: null, view: null, hashes: null, hashesReady: false });
  (0, import_react8.useEffect)(() => {
    const current = readSession();
    if (current !== sessionId) setSessionId(current);
  });
  (0, import_react8.useEffect)(() => {
    let disposed = false;
    const check = () => {
      if (disposed) return;
      if (readSession() !== sessionId) setSessionId(readSession());
    };
    const timer = setInterval(check, SESSION_POLL_MS);
    let unsubscribe = null;
    try {
      const maybe = services?.subscribeSession?.(check);
      if (typeof maybe === "function") unsubscribe = maybe;
    } catch {
    }
    return () => {
      disposed = true;
      clearInterval(timer);
      if (unsubscribe) {
        try {
          unsubscribe();
        } catch {
        }
      }
    };
  }, [readSession, services, sessionId]);
  (0, import_react8.useEffect)(() => {
    let active = true;
    setSnap(LOADING);
    setDerived({ projectId: null, revision: null, raw: null, view: null, hashes: null, hashesReady: false });
    if (!sessionId) {
      setSnap({ ...LOADING, status: "empty" });
      return void 0;
    }
    const { entry, created } = acquire(sessionId);
    const { binding } = entry;
    setSnap(binding.getState());
    const unsubscribe = binding.subscribe((next) => {
      if (active) setSnap(next);
    });
    if (created) void binding.refresh();
    return () => {
      active = false;
      try {
        unsubscribe();
      } catch {
      }
      release(sessionId);
    };
  }, [sessionId]);
  (0, import_react8.useEffect)(() => {
    let active = true;
    const status = snap.status;
    if (status === "ready" && snap.project) {
      const project = snap.project;
      const base = projectRawOf(project, { hashes: null, ref: snap.ref, team: snap.team });
      setDerived({ projectId: project.projectId || null, revision: project.revision ?? null, raw: base, view: stateViewOf(base), hashes: null, hashesReady: false });
      objectContentHashesOf(project).then((hashes) => {
        if (!active) return;
        const raw = projectRawOf(project, { hashes, ref: snap.ref, team: snap.team });
        setDerived({ projectId: project.projectId || null, revision: project.revision ?? null, raw, view: stateViewOf(raw), hashes, hashesReady: true });
      }).catch(() => {
        if (active) setDerived((current) => ({ ...current, hashesReady: true }));
      });
      return () => {
        active = false;
      };
    }
    if (status === "empty") {
      const raw = projectRawOf(null, { ref: snap.ref });
      setDerived({ projectId: null, revision: null, raw, view: stateViewOf(raw), hashes: null, hashesReady: true });
    }
    return () => {
      active = false;
    };
  }, [snap.status, snap.project, snap.revision, snap.ref, snap.team]);
  const refresh = (0, import_react8.useCallback)(async () => {
    const sid = readSession();
    const entry = sid ? registry.get(sid) : null;
    if (!entry) return null;
    return entry.binding.refresh();
  }, [readSession]);
  const act = (0, import_react8.useCallback)(async (action) => {
    const sid = readSession();
    const entry = sid ? registry.get(sid) : null;
    if (!entry) return { status: 0, body: { kind: "invalid", reason: "\u5F53\u524D\u6CA1\u6709\u4F1A\u8BDD" } };
    return entry.binding.act(action);
  }, [readSession]);
  return {
    sessionId,
    status: snap.status,
    stale: snap.stale === true,
    error: snap.error,
    project: snap.project,
    ref: snap.ref,
    revision: snap.revision,
    projectId: derived.projectId || snap.project?.projectId || null,
    raw: derived.raw,
    view: derived.view,
    hashes: derived.hashes,
    hashesReady: derived.hashesReady,
    loading: snap.status === "loading" || snap.status === "ready" && !derived.view,
    refresh,
    act
  };
}

// client-src/workbench/ProjectCatalog.jsx
var import_react9 = __toESM(require("react"), 1);
var import_jsx_runtime7 = require("react/jsx-runtime");
var EMPTY = Object.freeze({ status: "loading", assignment: "unbound", projects: [], stale: false, error: null });
async function readJson(res) {
  if (typeof res.json === "function") return res.json().catch(() => null);
  return res.body || null;
}
function ProjectCatalog({ services }) {
  const sessionId = services?.getSessionId?.() || "";
  const [state, setState] = (0, import_react9.useState)(EMPTY);
  const [notice, setNotice] = (0, import_react9.useState)(null);
  const [busyHandle, setBusyHandle] = (0, import_react9.useState)("");
  (0, import_react9.useEffect)(() => {
    let active = true;
    const generation = sessionId;
    setState(EMPTY);
    setNotice(null);
    if (!sessionId) {
      setState({ ...EMPTY, status: "empty", assignment: "unbound" });
      return void 0;
    }
    ;
    (async () => {
      try {
        const res = await fetch(`/plugins/dsh-science/project/catalog?sessionId=${encodeURIComponent(sessionId)}`, { credentials: "same-origin" });
        if (!active || generation !== sessionId) return;
        const body = await readJson(res);
        if (res.status === 404) {
          setState({ status: "unauthorized", assignment: "unbound", projects: [], stale: false, error: "\u5F53\u524D\u4F1A\u8BDD\u65E0\u6548\uFF0C\u65E0\u6CD5\u5217\u51FA\u8BFE\u9898\u3002" });
          return;
        }
        if (!res.ok || !body) {
          setState((current) => ({ ...current, status: current.projects.length ? "ready" : "offline", stale: true, error: `\u8BFB\u53D6\u8BFE\u9898\u76EE\u5F55\u5931\u8D25\uFF08HTTP ${res.status}\uFF09` }));
          return;
        }
        setState({ status: "ready", assignment: body.assignment || "unbound", projects: Array.isArray(body.projects) ? body.projects : [], stale: false, error: null });
      } catch (err) {
        if (!active) return;
        setState((current) => ({ ...current, status: current.projects.length ? "ready" : "offline", stale: true, error: err && err.message || "\u8BFB\u53D6\u8BFE\u9898\u76EE\u5F55\u5931\u8D25" }));
      }
    })();
    return () => {
      active = false;
    };
  }, [sessionId]);
  const openProject = async (item) => {
    if (!item?.openHandle || !sessionId) return;
    setBusyHandle(item.openHandle);
    setNotice(null);
    try {
      const res = await fetch("/plugins/dsh-science/project/open", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, openHandle: item.openHandle })
      });
      const body = await readJson(res);
      if (body?.kind === "unavailable") {
        setNotice(body.message);
        return;
      }
      if (!res.ok || body?.kind !== "open" || !body.sessionId) {
        setNotice("\u65E0\u6CD5\u6253\u5F00\u8BE5\u8BFE\u9898\u3002\u53E5\u67C4\u65E0\u6548\uFF0C\u6216\u5B83\u4E0D\u5C5E\u4E8E\u5F53\u524D\u5DE5\u4F5C\u533A\u3002\u5F53\u524D\u4F1A\u8BDD\u6CA1\u6709\u88AB\u6539\u7ED1\u3002");
        return;
      }
      await services.openRootSession(body.sessionId);
    } catch (err) {
      setNotice(err && err.message || "\u65E0\u6CD5\u6253\u5F00\u8BE5\u8BFE\u9898\u7684\u539F\u4F1A\u8BDD\u3002");
    } finally {
      setBusyHandle("");
    }
  };
  const projects = state.projects || [];
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("section", { className: "sci-catalog", "aria-label": "\u9879\u76EE\u603B\u89C8", children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("header", { className: "sci-catalog-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "sci-desk-eyebrow", children: "\u540C\u4E00\u5DE5\u4F5C\u533A" }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("h2", { children: "\u9879\u76EE\u603B\u89C8" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { children: "\u8FD9\u91CC\u53EA\u663E\u793A\u8BFE\u9898\u3001\u9636\u6BB5\u548C\u5F85\u5904\u7406\u6570\u91CF\u3002\u6253\u5F00\u540E\u8FDB\u5165\u8BE5\u8BFE\u9898\u81EA\u5DF1\u7684\u4F1A\u8BDD\uFF0C\u4E0D\u4F1A\u628A\u5F53\u524D\u4F1A\u8BDD\u6539\u7ED1\u8FC7\u53BB\u3002" })
    ] }),
    state.stale && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { role: "status", children: [
      "\u8BFE\u9898\u76EE\u5F55\u53EF\u80FD\u5DF2\u8FC7\u671F\u3002",
      state.error
    ] }),
    state.error && !state.stale && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { role: "alert", children: state.error }),
    notice && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { role: "status", children: notice }),
    state.assignment === "legacy-unassigned" && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { children: "\u5F53\u524D\u8BFE\u9898\u8FD8\u4E0D\u80FD\u552F\u4E00\u5F52\u5165\u8FD9\u4E2A\u5DE5\u4F5C\u533A\uFF0C\u56E0\u6B64\u4E0D\u4F1A\u6DF7\u8FDB\u4E0B\u9762\u7684\u76EE\u5F55\u3002\u5B83\u4ECD\u7559\u5728\u539F\u6765\u7684\u4F1A\u8BDD\u91CC\u3002" }),
    state.assignment === "workspace-unknown" && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { children: "\u5F53\u524D\u4F1A\u8BDD\u6CA1\u6709\u53EF\u786E\u8BA4\u7684\u5DE5\u4F5C\u533A\uFF0C\u6240\u4EE5\u4E0D\u80FD\u5217\u51FA\u5176\u4ED6\u8BFE\u9898\u3002" }),
    state.assignment === "ambiguous" && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { children: "\u5F53\u524D\u4F1A\u8BDD\u7684\u5DE5\u4F5C\u533A\u4E8B\u5B9E\u4E0D\u4E00\u81F4\uFF0C\u76EE\u5F55\u5DF2\u5173\u95ED\uFF0C\u907F\u514D\u628A\u8BFE\u9898\u5F52\u9519\u3002" }),
    state.status === "loading" && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { role: "status", children: "\u6B63\u5728\u8BFB\u53D6\u8BFE\u9898\u76EE\u5F55\u2026" }),
    state.status !== "loading" && projects.length === 0 && !state.error && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { children: "\u8FD9\u4E2A\u5DE5\u4F5C\u533A\u8FD8\u6CA1\u6709\u53EF\u5217\u51FA\u7684\u8BFE\u9898\u3002" }),
    projects.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "sci-catalog-grid", children: projects.map((item) => /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("article", { className: "sci-catalog-card", "data-current": item.current || void 0, children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("header", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { children: item.stageLabel || "\u7814\u7A76\u63A2\u7D22" }),
        item.current && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("strong", { children: "\u5F53\u524D" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("h3", { children: item.title || "\u672A\u547D\u540D\u8BFE\u9898" }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { children: item.questionExcerpt || "\u8FD8\u6CA1\u6709\u7814\u7A76\u95EE\u9898\u6458\u8981\u3002" }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("dl", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dt", { children: "\u5F85\u5904\u7406" }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dd", { children: item.attentionCount || 0 })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dt", { children: "\u8FDB\u884C\u4E2D" }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dd", { children: item.runningCount || 0 })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dt", { children: "\u53D7\u963B" }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("dd", { children: item.blockedCount || 0 })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Button, { primary: item.current, disabled: !item.openable || busyHandle === item.openHandle, onClick: () => openProject(item), children: item.openable ? item.current ? "\u56DE\u5230\u8FD9\u4E2A\u8BFE\u9898" : "\u6253\u5F00\u8BFE\u9898" : "\u539F\u4F1A\u8BDD\u4E0D\u5728\u7EBF" })
    ] }, item.openHandle)) })
  ] });
}

// client-src/workbench/ResearchWorkbench.jsx
var import_jsx_runtime8 = require("react/jsx-runtime");
var NAV = [
  { id: "overview", label: "\u6982\u89C8" },
  { id: "experts", label: "\u9879\u76EE\u4E13\u5BB6" },
  { id: "catalog", label: "\u9879\u76EE\u603B\u89C8" },
  { id: "paper", label: "\u8BBA\u6587\u4E3B\u7EBF" },
  { id: "team", label: "\u56E2\u961F\u8FDB\u5C55" },
  { id: "artifacts", label: "\u56FE\u8868\u4E0E\u6210\u679C" }
];
function WorkbenchMark() {
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "sci-wb-mark", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("path", { d: "M9 3h6M10 3v6.2l-5.3 9.1A2.5 2.5 0 0 0 6.9 22h10.2a2.5 2.5 0 0 0 2.2-3.7L14 9.2V3" }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("path", { d: "M8 15h8M9.4 12.5h5.2" })
  ] }) });
}
function ResearchWorkbench({ services }) {
  const state = useProjectBinding(services);
  const [page, setPage] = (0, import_react10.useState)("overview");
  (0, import_react10.useEffect)(() => {
    try {
      if (window.__DSH_SCIENCE_OPEN_PAGE__ === "catalog") {
        setPage("catalog");
        window.__DSH_SCIENCE_OPEN_PAGE__ = "";
      }
    } catch {
    }
  }, []);
  const [busy, setBusy] = (0, import_react10.useState)(false);
  const [notice, setNotice] = (0, import_react10.useState)(null);
  const openAction = async (action, targetId = null) => {
    const handoff = semanticHandoffOf(action, targetId);
    if (!handoff) {
      setNotice({ tone: "error", text: "\u65E0\u6CD5\u8BC6\u522B\u8FD9\u4E2A\u52A8\u4F5C\u3002" });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const r = await services?.prepareHandoff?.(handoff.kind, handoff.target);
      if (r && r.ok) {
        setNotice({ tone: "success", text: "\u5DF2\u5728\u5BF9\u8BDD\u8F93\u5165\u6846\u51C6\u5907\u8BF7\u6C42\uFF1B\u8BF7\u8865\u5145\u8BF4\u660E\u540E\u53D1\u9001\u3002" });
      } else {
        const reason = r && (r.reason || r.code) || "\u5F53\u524D\u4F1A\u8BDD\u4E0D\u652F\u6301\u9884\u586B\u3002";
        setNotice({ tone: "error", text: `\u672A\u80FD\u51C6\u5907\u5230\u8F93\u5165\u6846\uFF08${reason}\uFF09\u3002\u8BF7\u6253\u5F00\u5BF9\u8BDD\u624B\u52A8\u63CF\u8FF0\u3002` });
        try {
          services?.openConversation?.();
        } catch {
        }
      }
    } finally {
      setBusy(false);
    }
  };
  const confirmResult = async (objectId, expectedObjectRevision, expectedHash) => {
    setBusy(true);
    setNotice(null);
    try {
      const r = await confirmObjectViaAct({
        sessionId: state.sessionId,
        objectId,
        expectedObjectRevision,
        expectedHash,
        expectedRevision: state.revision
      });
      if (r.ok) {
        setNotice({ tone: "success", text: "\u5DF2\u786E\u8BA4\u5F53\u524D\u4FEE\u8BA2\uFF1B\u786E\u8BA4\u540E\u624D\u80FD\u636E\u6B64\u6D3E\u53D1\u6267\u884C\u4EFB\u52A1\u3002" });
        await state.refresh();
      } else {
        setNotice({ tone: "error", text: r.reason || "\u786E\u8BA4\u672A\u6267\u884C\u3002" });
      }
    } finally {
      setBusy(false);
    }
  };
  const openConversation = () => services?.openConversation?.();
  const currentView = state.view;
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "sci-workbench sci-desk", lang: "zh-CN", children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(WorkbenchStyles, {}),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("style", { children: RESEARCH_DESK_CSS }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "sci-wb-shell", children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("header", { className: "sci-wb-header", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "sci-wb-brand", children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(WorkbenchMark, {}),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: "\u79D1\u7814\u5DE5\u4F5C\u53F0" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("nav", { className: "sci-wb-nav", "aria-label": "\u79D1\u7814\u5DE5\u4F5C\u53F0\u9875\u9762", children: NAV.map((item) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { type: "button", "aria-current": page === item.id ? "page" : void 0, onClick: () => setPage(item.id), children: item.label }, item.id)) }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "sci-wb-head-actions", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(Button, { onClick: openConversation, children: [
          "\u56DE\u5230\u5BF9\u8BDD ",
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { "aria-hidden": "true", children: "\u2197" })
        ] }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("main", { className: "sci-wb-content", children: page === "catalog" ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "sci-desk-scene", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(ProjectCatalog, { services }) }) : state.loading && !currentView ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Panel, { children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "sci-empty", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("h2", { children: "\u6B63\u5728\u8BFB\u53D6\u7814\u7A76\u72B6\u6001" }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { children: "\u5DE5\u4F5C\u53F0\u4ECE\u5F53\u524D DSH \u9879\u76EE\u8BFB\u53D6\u8BBA\u6587\u4E3B\u7EBF\u3001\u56E2\u961F\u4EFB\u52A1\u548C\u5DF2\u767B\u8BB0\u6210\u679C\u3002" })
      ] }) }) }) : state.error && !currentView ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Panel, { title: "\u6682\u65F6\u65E0\u6CD5\u8BFB\u53D6\u5DE5\u4F5C\u53F0\u72B6\u6001", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(StatusMessage, { tone: "error", children: [
        state.error,
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "sci-result-actions", children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Button, { onClick: state.refresh, children: "\u91CD\u65B0\u8BFB\u53D6" }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Button, { onClick: openConversation, children: "\u6253\u5F00\u5BF9\u8BDD" })
        ] })
      ] }) }) : currentView && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "sci-desk-scene", children: [
        page === "overview" && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(WorkspaceOverview, { view: currentView, raw: state.raw, busy, onAction: openAction, onNavigate: setPage, onOpenConversation: openConversation, onOpenCatalog: () => setPage("catalog") }),
        page === "paper" && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(PaperSpinePage, { view: currentView, raw: state.raw, onAction: openAction, onConfirm: confirmResult, busy, onOpenConversation: openConversation, onNavigate: setPage }),
        page === "team" && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(TeamProgressPage, { view: currentView, openMemberSession: services?.openMemberSession, memberOpenAvailable: services?.memberOpenAvailable?.(currentView) }),
        page === "artifacts" && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(ArtifactsPage, { view: currentView, onAction: openAction }),
        page === "experts" && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(ExpertSetupPage, { binding: state, services }, JSON.stringify([state.sessionId, state.projectId])),
        state.error && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "sci-small", style: { marginTop: 14 }, role: "status", children: [
          "\u72B6\u6001\u5237\u65B0\u5931\u8D25\uFF0C\u6B63\u5728\u663E\u793A\u4E0A\u4E00\u6B21\u6210\u529F\u8BFB\u53D6\u7684\u6570\u636E\uFF1A",
          state.error
        ] })
      ] }, page) })
    ] }),
    notice && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: `sci-toast`, role: "status", "data-tone": notice.tone, children: [
      notice.text,
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "sci-result-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Button, { small: true, onClick: openConversation, children: "\u6253\u5F00\u5BF9\u8BDD" }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Button, { small: true, onClick: () => setNotice(null), children: "\u5173\u95ED" })
      ] })
    ] })
  ] });
}

// client-src/workbench/QuickWorkbench.jsx
var import_react12 = __toESM(require("react"), 1);

// client-src/workbench/ResearchRail.jsx
var import_react11 = __toESM(require("react"), 1);

// client-src/workbench/research-rail-styles.js
var RESEARCH_RAIL_CSS = `
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
.sci-rs-meta span+span::before{content:'\xB7';margin-inline-end:7px}
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
/* \u76EE\u5F55\u9875\u5728\u53F3\u680F\u4E5F\u8981\u5361\u7247\u5316\uFF1AProjectCatalog \u7684 sci-catalog* \u89C4\u5219\u539F\u672C\u53EA\u5728\u5B8C\u6574\u5DE5\u4F5C\u53F0\u6CE8\u5165\u3002 */
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
`;

// client-src/workbench/ResearchRail.jsx
var import_jsx_runtime9 = require("react/jsx-runtime");
var icons = {
  project: "M4 5h16v14H4z M8 9h8m-8 4h5",
  paper: "M6 3h8l4 4v14H6z M14 3v5h4M9 12h6m-6 4h6",
  alert: "M12 3l9 16H3z M12 9v4m0 3h.01",
  team: "M8 16a3 3 0 0 1-3 3H2v-2a4 4 0 0 1 4-4h2m8 3a3 3 0 0 0 3 3h3v-2a4 4 0 0 0-4-4h-2M9 8a3 3 0 1 0 6 0 3 3 0 1 0-6 0m-2 13v-3a5 5 0 0 1 10 0v3",
  figure: "M4 4h16v16H4z M7 16l4-5 3 3 2-2 4 4 M8 8h.01",
  explore: "M11 3l2.4 6.6L20 12l-6.6 2.4L11 21l-2.4-6.6L2 12l6.6-2.4z M19 3v4m-2-2h4",
  search: "M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0zm-2 4 5 5",
  structure: "M4 4h6v5H4zm10 11h6v5h-6zM7 9v8h7",
  write: "M4 20l4-.8L20 7l-3-3L5 16z M14 7l3 3",
  slides: "M3 4h18v12H3z M12 16v4m-4 1 4-2 4 2",
  check: "m5 12 4 4L19 6",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  chevron: "m9 6 6 6-6 6",
  compute: "M4 5h16v14H4z M8 9l3 3-3 3m5 0h3"
};
function Icon({ name, size = 16 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("svg", { "aria-hidden": "true", width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.65", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("path", { d: icons[name] || icons.team }) });
}
var marks = {
  project: () => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("circle", { cx: "16", cy: "16", r: "10", opacity: ".27" }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("ellipse", { cx: "16", cy: "16", rx: "12", ry: "5", transform: "rotate(-38 16 16)", opacity: ".65" }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("circle", { cx: "16", cy: "16", r: "3", fill: "currentColor", stroke: "none" }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("circle", { cx: "24.5", cy: "9", r: "2", fill: "currentColor", stroke: "none" })
  ] }),
  paper: () => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("path", { d: "M10 5h12l3 3v16H10z", fill: "currentColor", fillOpacity: ".15" }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("path", { d: "M7 10v17h13M14 12h7m-7 4h7m-7 4h4" })
  ] }),
  team: () => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("path", { d: "m9 22 7-12 8 12H9z", opacity: ".55" }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("circle", { cx: "16", cy: "9", r: "4", fill: "currentColor", stroke: "none" }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("circle", { cx: "8", cy: "23", r: "4", fill: "currentColor", stroke: "none" }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("circle", { cx: "24", cy: "23", r: "4", fill: "currentColor", stroke: "none" })
  ] }),
  figure: () => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("rect", { x: "5", y: "6", width: "22", height: "20", rx: "4", fill: "currentColor", fillOpacity: ".13" }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("path", { d: "M9 21l5-6 4 3 5-8" }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("circle", { cx: "23", cy: "10", r: "2.3", fill: "currentColor", stroke: "none" })
  ] }),
  alert: () => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("path", { d: "M16 4 28 16 16 28 4 16z", fill: "currentColor", fillOpacity: ".15" }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("path", { d: "M16 10v6m0 4v1" })
  ] }),
  explore: () => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("path", { d: "M16 5q1 10 11 11-10 1-11 11Q15 17 5 16 15 15 16 5Z", fill: "currentColor", fillOpacity: ".17" }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("path", { d: "M25 5v6m-3-3h6" })
  ] })
};
function ModuleMark({ kind, compact = false }) {
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "sci-rs-module-mark", "data-kind": kind, "data-compact": compact || void 0, children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("svg", { viewBox: "0 0 32 32", width: compact ? 20 : 24, height: compact ? 20 : 24, "aria-hidden": "true", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", children: marks[kind]?.() }) });
}
function ModuleTitle({ kind, children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("h3", { className: "sci-rs-module-title", children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(ModuleMark, { kind }),
    children
  ] });
}
function Action({ href, icon, primary, children, ...props }) {
  const common = { className: "sci-rs-action", "data-primary": primary || void 0, ...props };
  const content = /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
    icon && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Icon, { name: icon, size: 14 }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children })
  ] });
  return href ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("a", { ...common, href, target: "_blank", rel: "noreferrer", children: content }) : /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("button", { ...common, type: "button", children: content });
}
function Pill({ tone, children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "sci-rs-pill", "data-tone": tone, children });
}
function Card({ variant, icon, label, title, status, action, children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("article", { className: "sci-rs-card", "data-variant": variant, children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "sci-rs-kicker", children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "sci-rs-icon", children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Icon, { name: icon }) }),
      label,
      status
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h3", { children: title }),
    children,
    action && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "sci-rs-card-footer", children: action })
  ] });
}
function Copy({ text, limit = 95 }) {
  if (!text) return null;
  const shortened = text.length > limit;
  return shortened ? /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("details", { className: "sci-rs-details", children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("summary", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("span", { className: "sci-rs-excerpt", children: [
        text.slice(0, limit),
        "\u2026 "
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "sci-rs-expand", children: "\u5C55\u5F00\u5168\u6587" }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "sci-rs-collapse", children: "\u6536\u8D77\u5168\u6587" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { children: text })
  ] }) : /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "sci-rs-copy", children: text });
}
function Metrics({ items }) {
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dl", { className: "sci-rs-stats", children: items.map(([label, value]) => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dt", { children: label }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("dd", { children: value })
  ] }, label)) });
}
function Section({ title, icon, count, children, defaultOpen = true }) {
  const [open, setOpen] = (0, import_react11.useState)(defaultOpen);
  const contentId = (0, import_react11.useId)();
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("section", { className: "sci-rs-section", children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h3", { children: /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("button", { type: "button", className: "sci-rs-head", "aria-expanded": open, "aria-controls": contentId, onClick: () => setOpen(!open), children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(ModuleMark, { kind: icon }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: title }),
      count != null && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "sci-rs-count", children: count }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "sci-rs-chevron", children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Icon, { name: "chevron", size: 13 }) })
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { id: contentId, hidden: !open, children: open && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "sci-rs-stack", children }) })
  ] });
}
function CardList({ items, render, limit = 3, label }) {
  const [visible, setVisible] = (0, import_react11.useState)(limit);
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
    items.slice(0, visible).map(render),
    visible < items.length && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("button", { type: "button", className: "sci-rs-action sci-rs-more", onClick: () => setVisible(visible + limit), children: [
      "\u66F4\u591A",
      label,
      "\uFF08\u5269\u4F59 ",
      items.length - visible,
      "\uFF09"
    ] })
  ] });
}
var skills = [
  ["explore", "explore", "\u5F00\u59CB\u63A2\u7D22"],
  ["literature", "search", "\u67E5\u6587\u732E"],
  ["structure", "structure", "\u8C03\u6574\u7ED3\u6784"],
  ["draw", "figure", "\u7ED8\u56FE"],
  ["write", "write", "\u5199\u4F5C"],
  ["slides", "slides", "\u6C47\u62A5"]
];
var direction = { not_assessed: "\u65B9\u5411\u5F85\u8BC4\u4F30", supports: "\u652F\u6301\u4E3B\u5F20", contradicts: "\u4E0E\u4E3B\u5F20\u76F8\u53CD", inconclusive: "\u65B9\u5411\u4E0D\u786E\u5B9A", not_applicable: "\u65B9\u5411\u4E0D\u9002\u7528" };
var evidence = { planned: "\u8BC1\u636E\u5F85\u6536\u96C6", observed: "\u5DF2\u8BB0\u5F55\u89C2\u5BDF", verified: "\u8BC1\u636E\u5DF2\u6838\u9A8C", disputed: "\u8BC1\u636E\u6709\u4E89\u8BAE", invalidated: "\u8BC1\u636E\u5DF2\u5931\u6548" };
var role = { main: "\u4E3B\u7ED3\u679C", validation: "\u9A8C\u8BC1", control: "\u5BF9\u7167", boundary: "\u9002\u7528\u8FB9\u754C", supplement: "\u8865\u5145\u6750\u6599", excluded: "\u4E0D\u7EB3\u5165\u6B63\u6587" };
var audit = { approved: "\u4EBA\u5DE5\u7EC8\u5BA1\u901A\u8FC7", "ready-for-manual-review": "\u7B49\u5F85\u4EBA\u5DE5\u7EC8\u5BA1", "needs-attention": "\u56FE\u4EF6\u5F85\u590D\u6838", failed: "\u56FE\u4EF6\u9700\u4FEE\u6B63", rejected: "\u4EBA\u5DE5\u7EC8\u5BA1\u9000\u56DE" };
var memberIcons = { reviewer: "check", writer: "write", simulator: "compute", trainer: "compute", analyst: "compute", "figure-expert": "figure", presentation: "slides" };
function FigurePreview({ figure }) {
  const [status, setStatus] = (0, import_react11.useState)("loading");
  if (!figure.previewable || !figure.url) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
    status !== "error" && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("img", { className: "sci-rs-figure", src: figure.url, alt: figure.title, loading: "lazy", onLoad: () => setStatus("ready"), onError: () => setStatus("error") }),
    status !== "ready" && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "sci-rs-copy", children: status === "error" ? "\u9884\u89C8\u4E0D\u53EF\u7528\uFF0C\u53EF\u6253\u5F00\u539F\u56FE\u3002" : "\u56FE\u4EF6\u9884\u89C8\u52A0\u8F7D\u4E2D" })
  ] });
}
function ResearchRail({ view, raw, error, notice, busy, onRefresh, onWorkbench, onHandoff, onConfirm, onOpenMember, onDismiss, onOpenCatalog, catalog }) {
  const [page, setPage] = (0, import_react11.useState)("overview");
  const paper = view?.paper;
  const team = view?.team;
  const figures = view?.artifacts.figures || [];
  const hasCore = Boolean(paper?.core.claim || paper?.core.title);
  const hasPaper = hasCore || Boolean(paper?.results.length || raw?.projectId);
  const pending = paper ? [
    ...hasCore && !paper.core.confirmed ? [{ ...paper.core, id: "core" }] : [],
    ...paper.results.filter((result) => !result.confirmed && result.status !== "dropped" && result.manuscriptRole !== "excluded")
  ] : [];
  const issues = team?.tasks.filter((task) => task.isBlocked || task.status === "failed") || [];
  const active = team?.activeTasks.filter((task) => !task.isBlocked && task.status !== "failed") || [];
  const counts = team?.counts;
  const done = counts?.completed || 0;
  const question = paper?.question || raw?.blueprint?.question;
  const pendingTotal = pending.length + issues.length;
  const first = pending[0];
  const issue = issues[0];
  const working = active.find((task) => task.isRunning) || active[0];
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "sci-workbench sci-quick sci-rs", lang: "zh-CN", "aria-label": "\u7814\u7A76\u72B6\u6001", "data-page": page, children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(WorkbenchStyles, {}),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("style", { children: RESEARCH_RAIL_CSS }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("header", { className: "sci-rs-mast", children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("h2", { className: "sci-rs-module-title", children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(ModuleMark, { kind: "project", compact: true }),
        "\u7814\u7A76\u72B6\u6001"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Action, { icon: "arrow", onClick: onWorkbench, children: "\u5DE5\u4F5C\u53F0" }),
      onOpenCatalog && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Action, { icon: "project", onClick: () => {
        setPage("catalog");
        onOpenCatalog();
      }, children: "\u67E5\u770B\u5168\u90E8\u9879\u76EE" })
    ] }),
    view && hasPaper && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("nav", { className: "sci-rs-switch", "aria-label": "\u7814\u7A76\u72B6\u6001\u89C6\u56FE", children: [["overview", "\u6982\u89C8", "project"], ["paper", "\u8BBA\u6587", "paper"], ["team", "\u56E2\u961F", "team"], ["figures", "\u6210\u679C", "figure"]].map(([id, label, kind]) => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("button", { type: "button", "aria-pressed": page === id, onClick: () => setPage(id), children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(ModuleMark, { kind, compact: true }),
      label
    ] }, id)) }),
    page === "catalog" && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("button", { type: "button", className: "sci-rs-back", onClick: () => setPage("overview"), children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Icon, { name: "chevron", size: 13 }),
      " \u8FD4\u56DE\u7814\u7A76\u72B6\u6001"
    ] }),
    page === "catalog" && catalog,
    page !== "catalog" && error && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Card, { variant: "problem", icon: "alert", label: "\u8FDE\u63A5\u72B6\u6001", title: view ? "\u72B6\u6001\u53EF\u80FD\u5DF2\u8FC7\u671F" : "\u6682\u65F6\u65E0\u6CD5\u8BFB\u53D6\u72B6\u6001", action: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Action, { onClick: onRefresh, children: "\u91CD\u65B0\u8BFB\u53D6" }), children: /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("p", { className: "sci-rs-copy", role: "alert", children: [
      view ? "\u6B63\u5728\u663E\u793A\u4E0A\u6B21\u8BFB\u53D6\u7684\u5185\u5BB9\u3002" : "",
      error
    ] }) }),
    page !== "catalog" && !view && !error && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "sci-rs-empty", role: "status", children: "\u6B63\u5728\u8BFB\u53D6\u7814\u7A76\u72B6\u6001\u2026" }),
    notice && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "sci-rs-next", children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { role: notice.tone === "error" ? "alert" : "status", children: notice.text }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Action, { onClick: onDismiss, children: "\u5173\u95ED\u63D0\u793A" })
    ] }),
    page !== "catalog" && view && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
      (!hasPaper || page === "overview") && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("article", { className: "sci-rs-card sci-rs-hero", "data-variant": "project", children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "sci-rs-kicker", children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Icon, { name: "project", size: 14 }),
          hasPaper ? "\u5F53\u524D\u8BFE\u9898" : "\u4ECE\u5BF9\u8BDD\u5F00\u59CB",
          hasPaper && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "sci-rs-stage", children: paper.stageLabel })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h3", { children: hasPaper ? paper.title : "\u4F60\u60F3\u7814\u7A76\u4EC0\u4E48\uFF1F" }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "sci-rs-copy sci-rs-preview", children: question || paper.core.claim || (hasPaper ? "\u5728\u5BF9\u8BDD\u4E2D\u8865\u5145\u7814\u7A76\u95EE\u9898\u3002" : "\u8BF4\u4E00\u4E2A\u95EE\u9898\uFF0C\u6216\u6574\u7406\u5DF2\u6709\u6570\u636E\u3002\u8BBA\u6587\u4E3B\u7EBF\u3001\u4EFB\u52A1\u548C\u56FE\u4EF6\u4F1A\u968F\u5BF9\u8BDD\u66F4\u65B0\u3002") }),
        hasPaper ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Metrics, { items: [["\u7814\u7A76\u7ED3\u679C", paper.totalResults], ["\u5F85\u5904\u7406", pendingTotal], ["\u4EFB\u52A1\u5B8C\u6210", done]] }) : /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Action, { primary: true, icon: "arrow", disabled: busy, onClick: () => onHandoff("explore"), children: "\u5728\u5BF9\u8BDD\u4E2D\u5F00\u59CB\u63A2\u7D22" }) })
      ] }),
      hasPaper && page === "overview" && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("section", { className: "sci-rs-section sci-rs-module", "data-kind": "alert", children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "sci-rs-heading", children: [
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(ModuleTitle, { kind: "alert", children: "\u5F85\u4F60\u5904\u7406" }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: pendingTotal ? `\u5171 ${pendingTotal} \u9879` : "\u6682\u65E0\u5F85\u529E" })
          ] }),
          first ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
            Card,
            {
              variant: "attention",
              icon: "paper",
              label: first.id === "core" ? "\u6838\u5FC3\u4E3B\u5F20" : "\u7814\u7A76\u7ED3\u679C",
              title: first.title || "\u672A\u547D\u540D\u4E3B\u5F20",
              status: /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(Pill, { tone: "warn", children: [
                "\u5F85\u786E\u8BA4 \xB7 r",
                first.revision
              ] }),
              action: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Action, { primary: true, icon: "arrow", onClick: () => setPage("paper"), children: "\u6838\u5BF9\u4E3B\u5F20" }),
              children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "sci-rs-copy sci-rs-preview", children: first.claim || "\u5148\u5728\u5BF9\u8BDD\u4E2D\u8865\u5145\u4E3B\u5F20\u3002" })
            }
          ) : issue ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
            Card,
            {
              variant: "attention",
              icon: "alert",
              label: "\u56E2\u961F\u4EFB\u52A1",
              title: issue.subject || issue.id,
              status: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Pill, { tone: "warn", children: issue.status === "failed" ? "\u5931\u8D25" : "\u53D7\u963B" }),
              action: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Action, { icon: "arrow", onClick: () => setPage("team"), children: "\u67E5\u770B\u4EFB\u52A1" }),
              children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "sci-rs-copy sci-rs-preview", children: issue.blockers?.[0] || issue.resultSummary || "\u5230\u56E2\u961F\u89C6\u56FE\u67E5\u770B\u8FDB\u5C55\u3002" })
            }
          ) : /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "sci-rs-empty", children: "\u76EE\u524D\u6CA1\u6709\u5F85\u786E\u8BA4\u6216\u53D7\u963B\u4E8B\u9879\u3002" }),
          first && issues.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("button", { type: "button", className: "sci-rs-text-button", onClick: () => setPage("team"), children: [
            "\u53E6\u6709 ",
            issues.length,
            " \u9879\u4EFB\u52A1\u9700\u8981\u5904\u7406 ",
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Icon, { name: "arrow", size: 13 })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("section", { className: "sci-rs-section sci-rs-module", "data-kind": "team", children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "sci-rs-heading", children: [
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(ModuleTitle, { kind: "team", children: "\u56E2\u961F\u8FDB\u5C55" }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("button", { type: "button", className: "sci-rs-text-button", onClick: () => setPage("team"), children: [
              "\u67E5\u770B\u56E2\u961F ",
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Icon, { name: "arrow", size: 13 })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("article", { className: "sci-rs-card sci-rs-activity", children: [
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Metrics, { items: [["\u8FD0\u884C\u4E2D", counts.running], ["\u5DF2\u5B8C\u6210", done], ["\u9700\u5904\u7406", issues.length]] }),
            working && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("p", { className: "sci-rs-copy sci-rs-preview", children: [
              working.label,
              " \xB7 ",
              working.subject || working.id
            ] })
          ] })
        ] })
      ] }),
      hasPaper && page === "paper" && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(Section, { title: "\u5F85\u786E\u8BA4\u7684\u4E3B\u5F20", icon: "alert", count: pending.length, children: [
        pending.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "sci-rs-empty", children: "\u6CA1\u6709\u5F85\u786E\u8BA4\u7684\u4E3B\u5F20\u3002" }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(CardList, { label: "\u5F85\u786E\u8BA4\u4E3B\u5F20", items: pending, render: (item) => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
          Card,
          {
            variant: "attention",
            icon: "paper",
            label: item.id === "core" ? "\u6838\u5FC3\u4E3B\u5F20" : `\u7814\u7A76\u7ED3\u679C \xB7 ${item.id}`,
            title: item.title || "\u672A\u547D\u540D\u4E3B\u5F20",
            status: /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(Pill, { tone: "warn", children: [
              "\u5F85\u786E\u8BA4 \xB7 r",
              item.revision
            ] }),
            action: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Action, { primary: true, icon: "check", disabled: busy || Boolean(error) || !item.claim || !item.contentHash, onClick: () => onConfirm(item.id, item.revision, item.contentHash), children: item.contentHash ? "\u786E\u8BA4\u6B64\u4FEE\u8BA2" : "\u6B63\u5728\u6821\u9A8C\u5185\u5BB9\u2026" }),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Copy, { limit: 64, text: item.claim || "\u8BF7\u5148\u5728\u5BF9\u8BDD\u4E2D\u8865\u5145\u53EF\u786E\u8BA4\u7684\u4E3B\u5F20\u3002" }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "sci-rs-meta", children: [
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: "\u53EF\u9000\u56DE" }),
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: "\u6216\u5230\u5BF9\u8BDD\u4E2D\u8BF4\u660E\u4FEE\u6539" })
              ] })
            ]
          },
          item.id
        ) })
      ] }),
      hasPaper && page === "team" && issues.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Section, { title: "\u9700\u8981\u5904\u7406\u7684\u4EFB\u52A1", icon: "alert", count: issues.length, children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(CardList, { label: "\u4EFB\u52A1\u63D0\u9192", items: issues, render: (task) => /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Card, { variant: task.status === "failed" ? "problem" : "attention", icon: "alert", label: task.assignee ? `\u4EFB\u52A1 \xB7 ${task.assignee}` : "\u4EFB\u52A1", title: task.subject || task.id, status: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Pill, { tone: task.status === "failed" ? "bad" : "warn", children: task.status === "failed" ? "\u5931\u8D25" : "\u53D7\u963B" }), children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Copy, { text: task.blockers?.join("\uFF1B") || task.resultSummary || task.report || "\u8BF7\u5728\u5B8C\u6574\u5DE5\u4F5C\u53F0\u67E5\u770B\u4EFB\u52A1\u8BE6\u60C5\u3002" }) }, task.id) }) }),
      hasPaper && page === "paper" && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(Section, { title: "\u8BBA\u6587\u4E3B\u7EBF", icon: "paper", count: paper.totalResults, children: [
        hasCore && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
          Card,
          {
            icon: "paper",
            label: "\u6838\u5FC3\u4E3B\u5F20",
            title: paper.core.title || "\u8BBA\u6587\u7684\u6838\u5FC3\u4E3B\u5F20",
            status: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Pill, { tone: paper.core.confirmed ? "good" : "warn", children: paper.core.confirmed ? "\u5DF2\u786E\u8BA4" : "\u5F85\u786E\u8BA4" }),
            action: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Action, { icon: "write", disabled: busy, onClick: () => onHandoff("structure"), children: "\u5728\u5BF9\u8BDD\u4E2D\u8C03\u6574\u4E3B\u7EBF" }),
            children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Copy, { text: paper.core.claim })
          }
        ),
        !paper.results.length && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "sci-rs-empty", children: "\u8FD8\u6CA1\u6709\u7ED3\u679C\u8349\u6848\u3002\u53EF\u5728\u5BF9\u8BDD\u4E2D\u68B3\u7406\u8BBA\u6587\u7ED3\u6784\u3002" }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(CardList, { label: "\u7814\u7A76\u7ED3\u679C", items: paper.results, render: (result) => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
          Card,
          {
            icon: "paper",
            label: `\u7814\u7A76\u7ED3\u679C \xB7 ${result.id}`,
            title: result.title,
            status: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Pill, { tone: result.manuscriptRole === "excluded" || result.status === "dropped" ? void 0 : result.confirmed ? "good" : "warn", children: result.manuscriptRole === "excluded" || result.status === "dropped" ? "\u4E0D\u7EB3\u5165\u6B63\u6587" : result.confirmed ? "\u5DF2\u786E\u8BA4" : "\u5F85\u786E\u8BA4" }),
            action: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Action, { icon: "write", disabled: busy, onClick: () => onHandoff("structure", { objectId: result.id, revision: result.revision }), children: "\u5728\u5BF9\u8BDD\u4E2D\u4FEE\u6539" }),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Copy, { text: result.claim }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "sci-rs-meta", children: [result.statusLabel, direction[result.direction], evidence[result.evidenceState], role[result.manuscriptRole]].filter(Boolean).map((label) => /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: label }, label)) }),
              result.requiredItems?.[0] && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "sci-rs-next", children: [
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("b", { children: "\u5F53\u524D\u7F3A\u53E3" }),
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Copy, { text: result.requiredItems[0], limit: 60 })
              ] })
            ]
          },
          result.id
        ) })
      ] }),
      hasPaper && page === "team" && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(Section, { title: "\u56E2\u961F\u8FDB\u5C55", icon: "team", count: team.members.length, children: [
        !team.members.length && !active.length && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "sci-rs-empty", children: "\u56E2\u961F\u5C1A\u672A\u5F00\u59CB\u5DE5\u4F5C\u3002\u6D3E\u53D1\u4EFB\u52A1\u540E\uFF0C\u6210\u5458\u4E0E\u8FDB\u5EA6\u4F1A\u663E\u793A\u5728\u8FD9\u91CC\u3002" }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(CardList, { label: "\u56E2\u961F\u6210\u5458", items: team.members, render: (member) => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
          Card,
          {
            icon: memberIcons[member.role] || "team",
            label: "\u56E2\u961F\u6210\u5458",
            title: member.label || member.name,
            status: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Pill, { tone: member.liveStatusTone, children: member.liveStatusLabel }),
            action: onOpenMember && member.childId && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Action, { icon: "arrow", onClick: () => onOpenMember(member), children: "\u6253\u5F00\u6210\u5458\u4F1A\u8BDD" }),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Copy, { text: member.currentTasks.length ? member.currentTasks.map((task) => task.subject || task.id).join("\uFF1B") : "\u5F53\u524D\u6CA1\u6709\u8FDB\u884C\u4E2D\u7684\u4EFB\u52A1\u3002" }),
              member.lastReport && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Copy, { text: `\u6700\u8FD1\u56DE\u62A5\uFF1A${member.lastReport}` })
            ]
          },
          member.name
        ) }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(CardList, { label: "\u6267\u884C\u4EFB\u52A1", items: active, render: (task) => /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Card, { icon: "structure", label: "\u6267\u884C\u4EFB\u52A1", title: task.subject || task.id, status: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Pill, { tone: task.isRunning ? "good" : void 0, children: task.label }), children: /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "sci-rs-meta", children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: task.assignee || "\u5C1A\u672A\u5206\u914D" }),
          task.resultIds?.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: task.resultIds.join("\u3001") })
        ] }) }, task.id) })
      ] }),
      hasPaper && page === "figures" && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(Section, { title: "\u767B\u8BB0\u56FE\u4EF6", icon: "figure", count: figures.length, children: [
        !figures.length && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "sci-rs-empty", children: "\u767B\u8BB0\u56FE\u4EF6\u540E\u53EF\u5728\u8FD9\u91CC\u9884\u89C8\u3002" }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(CardList, { label: "\u56FE\u4EF6", items: figures, render: (figure) => /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
          Card,
          {
            icon: "figure",
            label: "\u56FE\u4EF6",
            title: figure.title,
            action: figure.url && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Action, { icon: "arrow", href: figure.url, children: "\u6253\u5F00\u539F\u56FE" }),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "sci-rs-meta", children: [figure.resultId || "\u672A\u5173\u8054\u7ED3\u679C", figure.version && `v${figure.version}`, audit[figure.audit?.overallStatus]].filter(Boolean).map((label) => /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: label }, label)) }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(FigurePreview, { figure }, figure.url)
            ]
          },
          figure.id || figure.path
        ) })
      ] }),
      (!hasPaper || page === "overview") && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(Section, { title: "\u5E38\u7528\u6280\u80FD", icon: "explore", children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "sci-rs-copy", children: "\u70B9\u51FB\u540E\u586B\u5165\u5BF9\u8BDD\u8349\u7A3F\uFF0C\u7531\u4F60\u8865\u5145\u5E76\u53D1\u9001\u3002" }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "sci-rs-skills", children: skills.map(([id, icon, label]) => /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Action, { icon, disabled: busy, onClick: () => onHandoff(id), children: label }, id)) })
      ] })
    ] })
  ] });
}

// client-src/workbench/QuickWorkbench.jsx
var import_jsx_runtime10 = require("react/jsx-runtime");
function QuickWorkbench({ services }) {
  const state = useProjectBinding(services);
  const [busy, setBusy] = (0, import_react12.useState)(false);
  const [notice, setNotice] = (0, import_react12.useState)(null);
  const [catalogOpen, setCatalogOpen] = (0, import_react12.useState)(false);
  const doConfirm = async (objectId, revision, contentHash) => {
    setBusy(true);
    setNotice(null);
    try {
      const r = await confirmObjectViaAct({
        sessionId: state.sessionId,
        objectId,
        expectedObjectRevision: revision,
        expectedHash: contentHash,
        expectedRevision: state.revision
      });
      if (r.ok) {
        setNotice({ tone: "success", text: "\u5DF2\u786E\u8BA4\u5F53\u524D\u4FEE\u8BA2\u3002" });
        await state.refresh();
      } else {
        setNotice({ tone: "error", text: r.reason || "\u786E\u8BA4\u672A\u6267\u884C\u3002" });
      }
    } finally {
      setBusy(false);
    }
  };
  const doHandoff = async (kind, target = null) => {
    setBusy(true);
    setNotice(null);
    try {
      const handoff = semanticHandoffOf(kind, target) || { kind };
      const r = await services?.prepareHandoff?.(handoff.kind, handoff.target);
      if (r?.ok) {
        setNotice({ tone: "success", text: "\u5DF2\u586B\u5165\u5BF9\u8BDD\u8349\u7A3F\uFF0C\u8BF7\u8865\u5145\u540E\u53D1\u9001\u3002" });
      } else {
        setNotice({ tone: "error", text: "\u672A\u80FD\u586B\u5165\u8349\u7A3F\u3002\u8BF7\u56DE\u5230\u5F53\u524D\u5BF9\u8BDD\u540E\u91CD\u8BD5\uFF0C\u6216\u76F4\u63A5\u63CF\u8FF0\u4F60\u60F3\u505A\u7684\u4E8B\u3002" });
      }
    } catch {
      setNotice({ tone: "error", text: "\u672A\u80FD\u586B\u5165\u8349\u7A3F\u3002\u8BF7\u56DE\u5230\u5F53\u524D\u5BF9\u8BDD\u540E\u91CD\u8BD5\u3002" });
    } finally {
      setBusy(false);
    }
  };
  const openMember = async (member) => {
    try {
      await services.openMemberSession(member);
      setNotice(null);
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "\u65E0\u6CD5\u6253\u5F00\u8BE5\u6210\u5458\u4F1A\u8BDD\uFF0C\u8BF7\u4ECE\u5B8C\u6574\u5DE5\u4F5C\u53F0\u91CD\u8BD5\u3002" });
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
    ResearchRail,
    {
      view: state.view,
      raw: state.raw,
      error: state.error,
      notice,
      busy,
      onRefresh: state.refresh,
      onWorkbench: () => services?.openWorkbench?.(),
      onHandoff: doHandoff,
      onConfirm: doConfirm,
      onOpenCatalog: () => setCatalogOpen(true),
      catalog: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(ProjectCatalog, { services }),
      onOpenMember: services?.memberOpenAvailable?.(state.view) ? openMember : void 0,
      onDismiss: () => setNotice(null)
    },
    state.projectId || "unbound"
  );
}

// client-src/conversation/ScienceDock.jsx
var import_react13 = __toESM(require("react"), 1);

// client-src/conversation/skill-actions.js
var SCIENCE_SKILLS = Object.freeze([
  { id: "explore", label: "\u5F00\u59CB\u63A2\u7D22", hint: "\u6F84\u6E05\u7814\u7A76\u95EE\u9898\u3001\u5DF2\u6709\u8BC1\u636E\u4E0E\u53EF\u884C\u8303\u56F4", skill: "sci-hypothesis", guide: "\u6211\u60F3\u7814\u7A76\u7684\u65B9\u5411\u662F\uFF1A" },
  { id: "results", label: "\u6574\u7406\u5DF2\u6709\u7ED3\u679C", hint: "\u628A\u6563\u843D\u7684\u7ED3\u679C\u6574\u7406\u6210\u53EF\u8FFD\u6EAF\u6E05\u5355", skill: null, prompt: "\u8BF7\u68C0\u67E5\u5E76\u6574\u7406\u6211\u5DF2\u6709\u7684\u79D1\u7814\u7ED3\u679C\uFF1A\u5148\u5217\u51FA\u53EF\u8FFD\u6EAF\u7684\u7ED3\u679C\u3001\u6765\u6E90\u548C\u4E0D\u786E\u5B9A\u9879\uFF0C\u4E0D\u8981\u8865\u9020\u7F3A\u5931\u6570\u636E\u3002" },
  { id: "literature", label: "\u67E5\u6587\u732E", hint: "\u56F4\u7ED5\u5F53\u524D\u95EE\u9898\u6269\u5C55\u6587\u732E\u4E0E\u6D41\u7A0B\u63A2\u7D22", skill: "sci-autoresearch", guide: "\u8BF7\u56F4\u7ED5\u6211\u7684\u7814\u7A76\u95EE\u9898\u505A\u6587\u732E\u4E0E\u6D41\u7A0B\u63A2\u7D22\uFF1A" },
  { id: "draw", label: "\u7ED8\u56FE", hint: "\u4E3A\u7ED3\u679C\u5EFA\u7ACB\u53EF\u8FFD\u6EAF\u56FE\u4EF6", skill: "sci-figures", guide: "\u8BF7\u4E3A\u4EE5\u4E0B\u7814\u7A76\u7ED3\u679C\u5EFA\u7ACB\u56FE\u4EF6\u65B9\u6848\uFF1A" },
  { id: "write", label: "\u5199\u4F5C", hint: "\u56F4\u7ED5\u5DF2\u786E\u8BA4\u7ED3\u679C\u8D77\u8349\u6216\u4FEE\u6539\u7A3F\u4EF6", skill: "sci-writing", guide: "\u8BF7\u57FA\u4E8E\u5F53\u524D\u8BBA\u6587\u4E3B\u7EBF\u8D77\u8349\uFF1A" },
  { id: "slides", label: "\u6C47\u62A5", hint: "\u628A\u5DF2\u786E\u8BA4\u7ED3\u679C\u6574\u7406\u6210\u6C47\u62A5 PPT", skill: "sci-slides", guide: "\u8BF7\u57FA\u4E8E\u5F53\u524D\u7814\u7A76\u8FDB\u5C55\u5236\u4F5C\u6C47\u62A5\uFF1A" }
]);
function insertionTextFor(entry, currentDraft = "") {
  const body = entry.skill ? `/${entry.skill}
${entry.guide || ""}` : String(entry.prompt || "");
  const draft = String(currentDraft || "");
  if (draft.includes(body)) return null;
  if (draft.trim() === "") return body;
  return `

${body}`;
}
function insertSkillEntry(inputActions, inputState, entry) {
  if (!inputActions || typeof inputActions.captureInsertion !== "function" || typeof inputActions.insertText !== "function") {
    return { ok: false, code: "no-input-actions", message: "\u5F53\u524D DSH \u7248\u672C\u4E0D\u63D0\u4F9B\u539F\u751F\u8F93\u5165\u63A5\u53E3\u3002" };
  }
  if (!entry || !entry.skill && !entry.prompt) {
    return { ok: false, code: "bad-entry", message: "\u6280\u80FD\u914D\u7F6E\u7F3A\u5931\u3002" };
  }
  const phase = inputState ? inputState.phase : "plain";
  if (phase && phase !== "plain") {
    return { ok: false, code: "busy", message: "\u8F93\u5165\u6846\u6B63\u5728\u63D0\u4EA4\u4E2D\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5\uFF1B\u8349\u7A3F\u672A\u6539\u52A8\u3002" };
  }
  const draft = inputState ? String(inputState.draft || "") : "";
  const text = insertionTextFor(entry, draft);
  if (text == null) {
    return { ok: true, inserted: false, message: "\u8BE5\u6280\u80FD\u5DF2\u5728\u8349\u7A3F\u4E2D\u3002" };
  }
  let span = null;
  try {
    span = inputActions.captureInsertion();
  } catch (err) {
    return { ok: false, code: "capture-failed", message: `\u65E0\u6CD5\u6355\u83B7\u63D2\u5165\u70B9\uFF08${err && err.message || "unknown"}\uFF09\uFF1B\u8349\u7A3F\u672A\u6539\u52A8\u3002` };
  }
  let accepted = false;
  try {
    accepted = inputActions.insertText(text, span) === true;
  } catch (err) {
    return { ok: false, code: "insert-failed", message: `\u63D2\u5165\u5931\u8D25\uFF08${err && err.message || "unknown"}\uFF09\uFF1B\u8349\u7A3F\u672A\u6539\u52A8\u3002` };
  }
  if (!accepted) {
    return { ok: false, code: "draft-changed", message: "\u8349\u7A3F\u521A\u521A\u53D1\u751F\u4E86\u53D8\u5316\uFF0C\u672A\u63D2\u5165\uFF1B\u8BF7\u91CD\u65B0\u70B9\u51FB\u3002\u539F\u8349\u7A3F\u5B8C\u6574\u4FDD\u7559\u3002" };
  }
  return { ok: true, inserted: true };
}

// client-src/conversation/ScienceDock.jsx
var import_jsx_runtime11 = require("react/jsx-runtime");
var stylesInjected = false;
function ensureStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.id = "dsh-science-dock-styles";
  style.textContent = `
.sci-dock{padding:2px 12px 6px;font-size:12px;color:var(--dsh-text-secondary,inherit)}
.sci-dock-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.sci-dock-note{opacity:.72;margin-right:2px;white-space:nowrap}
.sci-dock-ctx{display:inline-flex;flex-wrap:wrap;gap:8px;align-items:center;white-space:nowrap;opacity:.9}
.sci-dock-ctx b{color:inherit;font-weight:600}
.sci-dock-chip{border:1px solid var(--dsh-border,rgba(127,127,127,.3));border-radius:999px;padding:0 8px;font-size:11px;line-height:1.7}
.sci-dock-chip[data-tone=warn]{color:var(--dsh-warning,#b7791f)}
.sci-dock-chip[data-tone=bad]{color:var(--dsh-danger,#d64545)}
.sci-dock-chip[data-tone=good]{color:var(--dsh-success,#2f855a)}
.sci-dock-btn{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--dsh-border,rgba(127,127,127,.35));background:transparent;color:inherit;border-radius:999px;padding:2px 10px;font-size:12px;line-height:1.6;cursor:pointer}
.sci-dock-btn:hover{background:var(--dsh-fill-secondary,rgba(127,127,127,.12))}
.sci-dock-btn:focus-visible{outline:2px solid var(--dsh-brand,#4b7bec);outline-offset:1px}
.sci-dock-msg{width:100%;font-size:12px;opacity:.85}
.sci-dock-msg[data-tone=error]{color:var(--dsh-danger,#d64545)}
`;
  document.head.appendChild(style);
}
function ScienceDock({ inputActions, useInput, services }) {
  ensureStyles();
  const input = useInput ? useInput((s) => s) : null;
  const [notice, setNotice] = (0, import_react13.useState)(null);
  const state = useProjectBinding(services);
  const runSkill = (0, import_react13.useCallback)((entry) => {
    const result = insertSkillEntry(inputActions, input, entry);
    if (!result.ok) {
      setNotice({ tone: "error", text: result.message });
      return;
    }
    setNotice(result.inserted ? { tone: "info", text: "\u5DF2\u5728\u8F93\u5165\u6846\u51C6\u5907\u6280\u80FD\uFF0C\u8BF7\u7EE7\u7EED\u8865\u5145\u540E\u53D1\u9001\u3002" } : { tone: "info", text: result.message });
  }, [inputActions, input]);
  const connectProject = (0, import_react13.useCallback)(async () => {
    if (!state.sessionId) {
      setNotice({ tone: "error", text: "\u5F53\u524D\u6CA1\u6709\u4F1A\u8BDD\u3002" });
      return;
    }
    const r = await state.act({
      actionId: "project.ensure-binding",
      commandId: `dock-bind-${Date.now().toString(36)}`,
      payload: {}
    });
    if (r.status === 200 && (r.body.kind === "applied" || r.body.kind === "already-applied")) {
      setNotice({ tone: "info", text: "\u5DF2\u8FDE\u63A5\u7814\u7A76\u9879\u76EE\u3002" });
      void state.refresh();
      return;
    }
    setNotice({ tone: "error", text: r.body && r.body.reason || "\u8FDE\u63A5\u5931\u8D25\uFF1A" + String(r.status) });
  }, [state]);
  const keepFocus = (0, import_react13.useCallback)((event) => event.preventDefault(), []);
  const busy = input ? input.phase !== "plain" : false;
  const status = state.status;
  const stale = state.stale;
  const paper = state.view?.paper || null;
  const nextDecision = state.raw?.focus?.nextDecisions?.find?.((decision) => decision.status === "pending") || null;
  const running = state.view?.team?.counts?.running || 0;
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "sci-dock", role: "toolbar", "aria-label": "\u79D1\u7814\u6280\u80FD", children: [
    status === "ready" && paper && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "sci-dock-row", style: { marginBottom: 3 }, children: /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { className: "sci-dock-ctx", children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("b", { children: paper.title }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "sci-dock-chip", children: paper.stageLabel }),
      paper.question && paper.question !== paper.title && /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { className: "sci-dock-chip", title: paper.question, children: [
        "\u7814\u7A76\u95EE\u9898\uFF1A",
        paper.question.length > 32 ? `${paper.question.slice(0, 32)}\u2026` : paper.question
      ] }),
      paper.pendingConfirmationCount > 0 && /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { className: "sci-dock-chip", "data-tone": "warn", title: "\u5F85\u786E\u8BA4 = \u5C1A\u672A\u786E\u8BA4\u7684\u6838\u5FC3\u4E0E Result \u6570\uFF1B\u53F3\u680F\u300C\u5F85\u4F60\u5904\u7406\u300D\u53E6\u542B\u53D7\u963B\u4EFB\u52A1", children: [
        "\u5F85\u786E\u8BA4 ",
        paper.pendingConfirmationCount
      ] }),
      running > 0 && /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { className: "sci-dock-chip", children: [
        "\u4EFB\u52A1 ",
        running
      ] }),
      nextDecision && nextDecision.text && /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { className: "sci-dock-chip", "data-tone": "warn", children: [
        "\u4E0B\u4E00\u51B3\u7B56\uFF1A",
        String(nextDecision.text).slice(0, 24),
        String(nextDecision.text).length > 24 ? "\u2026" : ""
      ] }),
      stale && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "sci-dock-chip", "data-tone": "bad", children: "\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u72B6\u6001\u53EF\u80FD\u8FC7\u671F" })
    ] }) }),
    status === "empty" && /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "sci-dock-row", style: { marginBottom: 3 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "sci-dock-ctx", children: "\u5C1A\u672A\u5EFA\u7ACB\u7814\u7A76\u9879\u76EE\u2014\u2014\u4ECE\u4E00\u53E5\u8BDD\u5F00\u59CB\uFF0C\u6216\u6574\u7406\u5DF2\u6709\u7ED3\u679C\u3002" }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("button", { type: "button", className: "sci-dock-btn", onMouseDown: keepFocus, disabled: busy, onClick: connectProject, children: "\u8FDE\u63A5\u73B0\u6709\u9879\u76EE" })
    ] }),
    status === "offline" && /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "sci-dock-row", style: { marginBottom: 3 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "sci-dock-chip", "data-tone": "bad", children: "\u7814\u7A76\u72B6\u6001\u8FDE\u63A5\u4E2D\u65AD" }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("button", { type: "button", className: "sci-dock-btn", onMouseDown: keepFocus, onClick: () => state.refresh(), children: "\u91CD\u8FDE" })
    ] }),
    status === "unauthorized" && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "sci-dock-row", style: { marginBottom: 3 }, children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "sci-dock-chip", "data-tone": "bad", children: "\u5F53\u524D\u4F1A\u8BDD\u4E0D\u53EF\u7528" }) }),
    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "sci-dock-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "sci-dock-note", children: "\u79D1\u7814\uFF1A" }),
      SCIENCE_SKILLS.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
        "button",
        {
          type: "button",
          className: "sci-dock-btn",
          title: `${entry.hint}\uFF08\u586B\u5165\u5BF9\u8BDD\uFF0C\u4E0D\u81EA\u52A8\u53D1\u9001\uFF09`,
          disabled: busy,
          onMouseDown: keepFocus,
          onClick: () => runSkill(entry),
          children: entry.label
        },
        entry.id
      ))
    ] }),
    notice && /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "sci-dock-msg", "data-tone": notice.tone, role: notice.tone === "error" ? "alert" : "status", children: [
      notice.text,
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("button", { type: "button", className: "sci-dock-btn", style: { marginLeft: 6 }, onMouseDown: keepFocus, onClick: () => setNotice(null), children: "\u5173\u95ED" })
    ] })
  ] });
}

// client-src/conversation/ScienceTurnCards.jsx
var import_jsx_runtime12 = require("react/jsx-runtime");
var SCI_TOOLS = /* @__PURE__ */ new Set([
  "sci_blueprint_set",
  "sci_result_add",
  "sci_result_update",
  "sci_blueprint_confirm",
  "sci_claim_add",
  "sci_evidence_add",
  "sci_blueprint_stage",
  "sci_submission_check",
  "sci_result_reference_add",
  "sci_result_reference_verify",
  "sci_result_reference_remove",
  "sci_result_screening",
  "sci_blueprint_align",
  "sci_blueprint_link_figure",
  "sci_blueprint_import_legacy",
  "sci_team_dispatch",
  "sci_team_update_task",
  "sci_claim_retire",
  "sci_figure_register",
  "sci_figure_audit",
  "sci_figure_plan"
]);
function summarizeResult(_toolName, value) {
  if (!value || typeof value !== "object") return null;
  const parts = [];
  if (value.resultId) parts.push(value.resultId);
  if (value.objectId) parts.push(value.objectId);
  if (value.taskId) parts.push(value.taskId);
  if (value.figureId) parts.push(value.figureId);
  if (value.claimId) parts.push(value.claimId);
  if (value.evidenceId) parts.push(value.evidenceId);
  if (value.stage) parts.push(`\u9636\u6BB5 \u2192 ${value.stage}`);
  if (value.revision) parts.push(`rev ${value.revision}`);
  if (Array.isArray(value.changed) && value.changed.length > 0) parts.push(value.changed.join("\u3001"));
  const wrote = value.saved === true || value.receipt && typeof value.receipt === "object";
  if (parts.length === 0 && wrote) parts.push("\u5DF2\u4FDD\u5B58");
  if (value.requireConfirm) parts.push("\u5F85\u7528\u6237\u786E\u8BA4");
  if (value.stale) parts.push("\u5F15\u7528\u5DF2\u8FC7\u671F");
  return parts.join(" \xB7 ") || null;
}
var scienceStateChangeDefinition = {
  kind: "dsh-science/state-change",
  target: "chat",
  match: (event) => {
    if (event.type === "tool/call" && SCI_TOOLS.has(String(event.data && event.data.name))) {
      return { id: String(event.data.callId), role: "start" };
    }
    if (event.type === "tool/result" && event.data && event.data.message && event.data.message.source) {
      const source = event.data.message.source;
      if (source.kind === "tool" && source.callId) {
        return { id: String(source.callId), role: "update" };
      }
    }
    return null;
  },
  start: (_context, match) => {
    if (match.event.type !== "tool/call") throw new Error("science state-change start requires tool/call");
    return { toolName: String(match.event.data.name), done: false, summary: null, error: false };
  },
  update: (context, match) => {
    if (match.event.type !== "tool/result") return context.state;
    const callId = String(match.event.data.message && match.event.data.message.source && match.event.data.message.source.callId || "");
    if (callId && context.state && context.id && callId !== String(context.id)) return context.state;
    const failed = match.event.data.error !== void 0 || match.event.data.message && match.event.data.message.isError === true;
    let value = null;
    try {
      const blocks = match.event.data.message && match.event.data.message.content;
      const text = Array.isArray(blocks) ? blocks.filter((b) => b && b.type === "text").map((b) => b.text).join("") : "";
      value = text ? JSON.parse(text) : null;
    } catch {
    }
    const summary = !failed && value ? summarizeResult(context.state.toolName, value) : null;
    return { ...context.state, done: true, error: !!failed, summary };
  },
  buildViewNode: (context) => {
    if (context.start === void 0) return null;
    const state = context.state;
    if (!state.done) return null;
    if (!state.summary && !state.error) return null;
    return {
      key: context.key,
      kind: "dsh-science/state-change",
      id: context.id,
      target: "chat",
      anchorSeq: context.start.event.seq,
      location: context.start.location,
      visibility: "visible",
      data: { toolName: state.toolName, summary: state.summary, error: state.error }
    };
  }
};
var stylesInjected2 = false;
function ensureStyles2() {
  if (stylesInjected2 || typeof document === "undefined") return;
  stylesInjected2 = true;
  const style = document.createElement("style");
  style.id = "dsh-science-turn-card-styles";
  style.textContent = `
.sci-turncard{display:flex;align-items:flex-start;gap:8px;font-size:12px;padding:4px 10px;margin:2px 0;border:1px solid var(--dsh-border,rgba(127,127,127,.25));border-radius:8px;background:var(--dsh-fill-secondary,rgba(127,127,127,.06));color:inherit}
.sci-turncard[data-error=true]{border-color:var(--dsh-danger,#d64545)}
.sci-turncard .sci-turncard-icon{flex:0 0 auto;opacity:.8}
.sci-turncard .sci-turncard-body{min-width:0}
.sci-turncard .sci-turncard-title{font-weight:600}
.sci-turncard .sci-turncard-summary{opacity:.85;overflow-wrap:anywhere}
`;
  document.head.appendChild(style);
}
var TOOL_LABELS = {
  sci_blueprint_set: "\u66F4\u65B0\u6838\u5FC3",
  sci_result_add: "\u65B0\u589E Result",
  sci_result_update: "\u66F4\u65B0 Result",
  sci_blueprint_confirm: "\u786E\u8BA4\u4FEE\u8BA2",
  sci_claim_add: "\u65B0\u589E Claim",
  sci_evidence_add: "\u767B\u8BB0\u8BC1\u636E",
  sci_blueprint_stage: "\u5207\u6362\u9636\u6BB5",
  sci_submission_check: "\u6295\u7A3F\u68C0\u67E5",
  sci_result_reference_add: "\u767B\u8BB0\u6587\u732E",
  sci_result_reference_verify: "\u6838\u5BF9\u6587\u732E",
  sci_result_reference_remove: "\u79FB\u9664\u6587\u732E",
  sci_result_screening: "\u6587\u732E\u5FEB\u7B5B",
  sci_blueprint_align: "\u5BF9\u9F50\u4EFB\u52A1",
  sci_blueprint_link_figure: "\u6302\u63A5\u56FE\u4EF6",
  sci_blueprint_import_legacy: "\u5BFC\u5165\u65E7\u6570\u636E",
  sci_team_dispatch: "\u6D3E\u53D1\u4EFB\u52A1",
  sci_team_update_task: "\u66F4\u65B0\u4EFB\u52A1",
  sci_figure_register: "\u767B\u8BB0\u56FE\u4EF6",
  sci_figure_audit: "\u56FE\u4EF6\u524D\u68C0",
  sci_figure_plan: "\u56FE\u4EF6\u8BA1\u5212"
};
function StateChangeCard({ node }) {
  ensureStyles2();
  const data = node && node.data || {};
  const label = TOOL_LABELS[data.toolName] || data.toolName || "\u9879\u76EE\u72B6\u6001";
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "sci-turncard", "data-error": data.error ? "true" : "false", children: [
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "sci-turncard-icon", "aria-hidden": "true", children: data.error ? "\u26A0" : "\u{1F9EC}" }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { className: "sci-turncard-body", children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "sci-turncard-title", children: data.error ? `${label} \u672A\u5B8C\u6210` : `\u5DF2\u540C\u6B65\uFF1A${label}` }),
      data.summary && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "sci-turncard-summary", children: data.summary }),
      data.error && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "sci-turncard-summary", children: "\u8BE5\u5DE5\u5177\u8C03\u7528\u672A\u6210\u529F\uFF0C\u9879\u76EE\u72B6\u6001\u672A\u53D8\u66F4\uFF1B\u53EF\u5728\u5BF9\u8BDD\u4E2D\u91CD\u8BD5\u3002" })
    ] })
  ] });
}

// client-src/conversation/ScienceConfirmCard.jsx
var import_react14 = __toESM(require("react"), 1);
var import_jsx_runtime13 = require("react/jsx-runtime");
var SCIENCE_CONFIRM_ACTION = "sci-paper-confirm";
var SCIENCE_CONFIRM_LOCALE = "dsh-science-confirm";
var COPY = Object.freeze({
  zh: {
    confirm: "\u786E\u8BA4\u6B64\u4FEE\u8BA2",
    reject: "\u9000\u56DE\u5E76\u56DE\u5BF9\u8BDD",
    confirmed: "\u5DF2\u786E\u8BA4",
    rejected: "\u5DF2\u9000\u56DE",
    dismissed: "\u5DF2\u5FFD\u7565",
    replaced: "\u5DF2\u88AB\u65B0\u5361\u7247\u66FF\u4EE3",
    unavailable: "\u8FD9\u6B21\u64CD\u4F5C\u6CA1\u6709\u5B8C\u6210\uFF0C\u8BF7\u91CD\u8BD5\u3002",
    rejectHint: "\u9000\u56DE\u4E0D\u4F1A\u6539\u52A8\u8BBA\u6587\u5185\u5BB9\uFF0C\u53EA\u8BB0\u5F55\u51B3\u5B9A\uFF1B\u8BF7\u5728\u5BF9\u8BDD\u4E2D\u8BF4\u660E\u4FEE\u6539\u610F\u89C1\u3002",
    settled: "\u8FD9\u5F20\u5361\u7247\u5DF2\u5904\u7406\u5B8C\u6210\u3002",
    revision: "\u4FEE\u8BA2",
    stale: "\u8FD9\u5F20\u5361\u7247\u5BF9\u5E94 r{shown}\uFF0C\u5F53\u524D\u5DF2\u662F r{current}\uFF0C\u8BF7\u8BA9\u961F\u957F\u57FA\u4E8E\u6700\u65B0\u4FEE\u8BA2\u91CD\u65B0\u53D1\u8D77\u3002"
  },
  en: {
    confirm: "Confirm this revision",
    reject: "Return to conversation",
    confirmed: "Confirmed",
    rejected: "Returned",
    dismissed: "Dismissed",
    replaced: "Replaced by a newer card",
    unavailable: "This action did not finish. Try again.",
    rejectHint: "Returning does not change the paper content; it only records the decision. Explain your edits in the conversation.",
    settled: "This card has been handled.",
    revision: "Revision",
    stale: "This card targets r{shown} but the object is now r{current}. Ask the lead to propose a new card from the latest revision."
  }
});
function textOf(t, key) {
  if (typeof t === "function") {
    try {
      const value = t(key);
      if (value && value !== key) return value;
    } catch {
    }
  }
  const language = typeof navigator === "object" && String(navigator.language || "").toLowerCase().startsWith("en") ? "en" : "zh";
  return COPY[language] && COPY[language][key] || (COPY.zh[key] ?? key);
}
var FINAL_PHASES = ["confirmed", "rejected", "dismissed", "replaced"];
var stylesInjected3 = false;
function ensureStyles3() {
  if (stylesInjected3 || typeof document === "undefined") return;
  stylesInjected3 = true;
  const style = document.createElement("style");
  style.id = "dsh-science-confirm-card-styles";
  style.textContent = `
.sci-confirm-card{display:flex;flex-direction:column;gap:8px;margin-top:8px;padding:12px 14px;border:1px solid var(--dsh-border,rgba(127,127,127,.28));border-radius:10px;background:var(--dsh-fill-secondary,rgba(127,127,127,.06))}
.sci-confirm-meta{display:flex;align-items:center;gap:8px;font-size:12px;opacity:.72;overflow-wrap:anywhere}
.sci-confirm-chip{padding:1px 6px;border-radius:999px;border:1px solid var(--dsh-border,rgba(127,127,127,.3));font-variant-numeric:tabular-nums}
.sci-confirm-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:2px}
.sci-confirm-actions button{font:inherit;font-size:13px;line-height:1.6;padding:5px 14px;border-radius:8px;cursor:pointer;border:1px solid var(--dsh-border,rgba(127,127,127,.4));background:transparent;color:inherit;transition:background .12s ease}
.sci-confirm-actions button:first-child{background:var(--dsh-accent,#3b6df6);border-color:transparent;color:#fff;font-weight:600}
.sci-confirm-actions button:first-child:hover:not(:disabled){filter:brightness(1.06)}
.sci-confirm-actions button:last-child:hover:not(:disabled){background:var(--dsh-fill-tertiary,rgba(127,127,127,.12))}
.sci-confirm-actions button:disabled{opacity:.5;cursor:not-allowed}
.sci-confirm-hint{font-size:12px;opacity:.7}
.sci-confirm-status{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600}
.sci-confirm-status[data-tone=good]{color:var(--dsh-success,#2f9e5f)}
.sci-confirm-status[data-tone=warn]{color:var(--dsh-warning,#b07a12)}
.sci-confirm-notice{font-size:12px;line-height:1.6;color:var(--dsh-warning,#b07a12)}
.sci-confirm-error{font-size:12px;line-height:1.6;color:var(--dsh-danger,#d64545)}
`;
  document.head.appendChild(style);
}
function useCurrentObjectRevision(sessionId, objectId) {
  const [current, setCurrent] = (0, import_react14.useState)(null);
  (0, import_react14.useEffect)(() => {
    if (!sessionId || !objectId || typeof fetch !== "function") return void 0;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/plugins/dsh-science/project/get?sessionId=${encodeURIComponent(sessionId)}`);
        if (!alive || !res || !res.ok) return;
        const body = await res.json();
        const paper = body && body.project && body.project.paper;
        if (!paper) return;
        const obj = objectId === "core" ? paper.core : (paper.results || []).find((r) => r && r.id === objectId);
        const revision = obj && Number(obj.revision);
        if (alive && Number.isFinite(revision)) setCurrent(revision);
      } catch {
      }
    })();
    return () => {
      alive = false;
    };
  }, [sessionId, objectId]);
  return current;
}
function ScienceConfirmBody({ proposal, decision, sessionId, summary, act, t }) {
  ensureStyles3();
  const [pending, setPending] = (0, import_react14.useState)(false);
  const [settled, setSettled] = (0, import_react14.useState)(false);
  const [error, setError] = (0, import_react14.useState)("");
  const phase = decision?.phase;
  const done = FINAL_PHASES.includes(phase) || settled;
  const details = proposal && proposal.details || {};
  const shownRevision = details.objectRevision;
  const liveRevision = useCurrentObjectRevision(sessionId, details.objectId);
  const stale = !done && liveRevision != null && shownRevision != null && Number(liveRevision) !== Number(shownRevision);
  const hashShort = typeof details.expectedHash === "string" ? details.expectedHash.slice(0, 8) : "";
  const send = async (verb) => {
    if (done || pending || typeof act !== "function") return;
    setPending(true);
    setError("");
    try {
      const result = await act(verb);
      if (!result || result.status === "refused" || result.status === "unconfirmed") {
        setError(result?.reason || textOf(t, "unavailable"));
      } else {
        setSettled(true);
      }
    } catch (err) {
      setError(err?.message || textOf(t, "unavailable"));
    } finally {
      setPending(false);
    }
  };
  const statusKey = done ? settled && !phase ? "settled" : phase : "";
  return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "sci-confirm-card", "data-action": proposal?.action || SCIENCE_CONFIRM_ACTION, children: [
    summary,
    (shownRevision != null || hashShort) && /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "sci-confirm-meta", children: [
      details.objectId && /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { children: details.objectId }),
      shownRevision != null && /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("span", { className: "sci-confirm-chip", children: [
        textOf(t, "revision"),
        " r",
        shownRevision
      ] }),
      hashShort && /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "sci-confirm-chip", children: hashShort })
    ] }),
    stale && /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("p", { className: "sci-confirm-notice", role: "alert", children: textOf(t, "stale").replace("{shown}", String(shownRevision)).replace("{current}", String(liveRevision)) }),
    done && /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("p", { className: "sci-confirm-status", role: "status", "data-tone": phase === "confirmed" ? "good" : "warn", children: [
      phase === "confirmed" ? "\u2713" : "\u21A9",
      " ",
      textOf(t, statusKey || "settled")
    ] }),
    error && /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("p", { className: "sci-confirm-error", role: "alert", children: error }),
    !done && /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "sci-confirm-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("button", { type: "button", disabled: pending || stale, onClick: () => send("confirm"), children: textOf(t, "confirm") }),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("button", { type: "button", disabled: pending || stale, onClick: () => send("reject"), children: textOf(t, "reject") })
    ] }),
    !done && /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("p", { className: "sci-confirm-hint", children: textOf(t, "rejectHint") })
  ] });
}
function scienceConfirmLocale() {
  return {
    zh: { ...COPY.zh },
    en: { ...COPY.en }
  };
}

// lib/skeleton-context.js
var SKELETON_LIFECYCLE = Object.freeze([
  { action: "propose", command: "paper.propose-core | paper.propose-result | paper.record-proposal", effect: "\u8FFD\u52A0\u5F85\u786E\u8BA4\u8349\u6848\uFF1B\u5FC5\u987B\u5E26\u6765\u6E90\uFF1B\u4E0D\u81EA\u52A8\u786E\u8BA4\u3001\u4E0D\u6D3E\u53D1\u4EFB\u52A1" },
  { action: "confirm", command: "paper.confirm-revision", effect: "\u53EA\u786E\u8BA4 expectedObjectRevision + expectedHash \u5BF9\u5E94\u7684\u5F53\u524D\u5BF9\u8C61\uFF1B\u63A2\u7D22\u548C\u6574\u7406\u6750\u6599\u4E0D\u53D7\u9636\u6BB5\u9650\u5236" },
  { action: "revise", command: "paper.update-result | paper.propose-core | paper.record-claim | paper.retire-claim", effect: "\u8BED\u4E49\u53D8\u5316\u8FFD\u52A0 history \u5E76\u63A8\u8FDB\u5BF9\u8C61\u4FEE\u8BA2\uFF1B\u65E7\u786E\u8BA4\u5931\u6548\uFF1B\u65E7\u4EFB\u52A1/\u8BC1\u636E\u5173\u7CFB\u4ECD\u53EF\u6309\u4FEE\u8BA2\u67E5\u8BE2" },
  { action: "archive", command: "paper.archive-object", effect: "\u5BF9\u8C61\u4FDD\u7559\u5E76\u6807\u8BB0 archived\uFF1B\u8FFD\u52A0\u5F52\u6863\u4FEE\u8BA2\uFF1B\u4E0D\u5220\u9664\u4EFB\u52A1\u3001\u8BC1\u636E\u6216\u5386\u53F2\u5173\u7CFB" }
]);
var CLIP = Object.freeze({ question: 160, claim: 240, evidence: 120 });
function objectRefToken(target) {
  if (!target) return "";
  const objectId = typeof target === "string" ? target : target.objectId || target.id;
  if (!objectId) return "";
  const revision = typeof target === "object" && target.revision != null ? ` revision=${Number(target.revision)}` : "";
  return `[[dsh-science-ref objectId=${objectId}${revision}]]`;
}

// client-src/conversation/composer-handoff.js
var SCIENCE_SKILL_TEXT = Object.freeze({
  explore: { skill: "sci-hypothesis", guide: "\u6211\u60F3\u7814\u7A76\u7684\u65B9\u5411\u662F\uFF1A" },
  results: { skill: null, prompt: "\u8BF7\u68C0\u67E5\u5E76\u6574\u7406\u6211\u5DF2\u6709\u7684\u79D1\u7814\u7ED3\u679C\uFF1A\u5148\u5217\u51FA\u53EF\u8FFD\u6EAF\u7684\u7ED3\u679C\u3001\u6765\u6E90\u548C\u4E0D\u786E\u5B9A\u9879\uFF0C\u4E0D\u8981\u8865\u9020\u7F3A\u5931\u6570\u636E\u3002" },
  literature: { skill: "sci-autoresearch", guide: "\u8BF7\u56F4\u7ED5\u6211\u7684\u7814\u7A76\u95EE\u9898\u505A\u6587\u732E\u63A2\u7D22\uFF1A" },
  draw: { skill: "sci-figures", guide: "\u8BF7\u4E3A\u4EE5\u4E0B\u7814\u7A76\u7ED3\u679C\u5EFA\u7ACB\u56FE\u4EF6\u65B9\u6848\uFF1A" },
  write: { skill: "sci-writing", guide: "\u8BF7\u57FA\u4E8E\u5F53\u524D\u8BBA\u6587\u4E3B\u7EBF\u8D77\u8349\uFF1A" },
  slides: { skill: "sci-slides", guide: "\u8BF7\u57FA\u4E8E\u5F53\u524D\u7814\u7A76\u8FDB\u5C55\u5236\u4F5C\u6C47\u62A5\uFF1A" },
  structure: { skill: null, prompt: "\u8BF7\u57FA\u4E8E\u5F53\u524D\u4F1A\u8BDD\u8BC1\u636E\u4E0E\u9879\u76EE\u72B6\u6001\u5EFA\u7ACB/\u8C03\u6574\u6587\u7AE0\u7ED3\u6784\u8349\u6848\uFF1A\u63D0\u51FA\u6838\u5FC3\u7ED3\u8BBA\u5019\u9009\u5E76\u62C6\u5206\u4E3A 3\u20135 \u4E2A\u53EF\u72EC\u7ACB\u6838\u9A8C\u7684 Result\uFF1B\u53EA\u751F\u6210\u5F85\u786E\u8BA4\u8349\u6848\uFF0C\u4E0D\u8981\u81EA\u52A8\u786E\u8BA4\u6216\u6D3E\u53D1\u4EFB\u52A1\u3002" }
});
function handoffTextFor(kind, target = null) {
  const entry = SCIENCE_SKILL_TEXT[kind];
  if (!entry) return null;
  const head = entry.skill ? `/${entry.skill}` : "";
  const body = entry.skill ? entry.guide : entry.prompt;
  const ref = target ? `
\uFF08\u5BF9\u8C61\uFF1A${typeof target === "string" ? target : target.objectId || target.id || ""}\uFF09
${objectRefToken(target)}` : "";
  return `${head ? head + "\n" : ""}${body}${ref}`;
}
async function handoffToComposer({ ctx, sessionId, kind, target = null, openConversation }) {
  const text = handoffTextFor(kind, target);
  if (!text) return { ok: false, code: "unknown-kind" };
  if (!sessionId) return { ok: false, code: "no-session" };
  let conversation = null;
  let sessions = null;
  try {
    conversation = ctx.get("conversation");
    sessions = ctx.get("sessions");
  } catch {
    try {
      conversation = ctx.conversation;
      sessions = ctx.sessions;
    } catch {
    }
  }
  const binding = sessions && typeof sessions.binding === "function" ? sessions.binding(sessionId) : void 0;
  if (conversation && conversation.input && binding && typeof conversation.input.requestDraftInitialization === "function") {
    try {
      const result = conversation.input.requestDraftInitialization(binding, { prompt: text, whenDraftExists: "append" });
      if (result === "applied" || result === "preserved") {
        if (typeof openConversation === "function") openConversation();
        return { ok: true };
      }
      return { ok: false, code: "blocked" };
    } catch {
      return { ok: false, code: "handoff-failed" };
    }
  }
  return { ok: false, code: "no-input-face" };
}

// client-src/workbench/host-adapter.js
var WORKBENCH_REQUIRED_SERVICES = Object.freeze([
  "slots",
  "sessions",
  "layout",
  "sidebarRightTabs",
  "uiWorkspace"
]);
function registerGuardedPart(mount, part, register) {
  const state = mount && typeof mount === "object" ? mount : {};
  if (state[part]) return () => {
  };
  const dispose = register();
  state[part] = true;
  return () => {
    state[part] = false;
    if (typeof dispose === "function") dispose();
  };
}

// client-src/index.jsx
var import_jsx_runtime14 = require("react/jsx-runtime");
var inject = [...WORKBENCH_REQUIRED_SERVICES, "uiConversation", "conversation", "actionCards", "locale"];
var PANEL_ID = "dsh-science/workbench";
function service(ctx, name) {
  try {
    return ctx.get(name);
  } catch {
    return void 0;
  }
}
function currentSessionId(sessions) {
  try {
    const snapshot = sessions?.list?.getSnapshot?.();
    const main = Object.values(snapshot?.byId || {}).find((row) => row?.retainedBy && (row.retainedBy.mainView || 0) > 0);
    if (main?.id) return main.id;
    return typeof snapshot?.current === "string" ? snapshot.current : void 0;
  } catch {
    return void 0;
  }
}
function makeServices(ctx) {
  const sessionsOf = () => service(ctx, "sessions") || ctx.sessions;
  const getSessionId = () => currentSessionId(sessionsOf());
  const subscribeSession = (listener) => {
    const sessions = sessionsOf();
    for (const target of [sessions?.list, sessions]) {
      if (!target || typeof target.subscribe !== "function") continue;
      try {
        const dispose = target.subscribe(() => {
          try {
            listener();
          } catch {
          }
        });
        if (typeof dispose === "function") return dispose;
      } catch {
      }
    }
    return () => {
    };
  };
  const getCurrentSession = () => {
    const sessions = sessionsOf();
    const id = getSessionId();
    if (!id || typeof sessions?.binding !== "function") return void 0;
    try {
      return sessions.binding(id)?.session;
    } catch {
      return void 0;
    }
  };
  const openConversation = () => {
    const layout = service(ctx, "layout") || ctx.layout;
    if (typeof layout?.selectPanel !== "function") throw new Error("\u5F53\u524D DSH \u4E0D\u652F\u6301\u5207\u6362\u5230\u5BF9\u8BDD\u9762\u677F\u3002");
    layout.selectPanel(null);
  };
  const openWorkbench = (page) => {
    const layout = service(ctx, "layout") || ctx.layout;
    if (page) {
      try {
        window.__DSH_SCIENCE_OPEN_PAGE__ = page;
      } catch {
      }
    }
    layout?.selectPanel?.(PANEL_ID);
  };
  const openRootSession = (sessionId) => {
    const workspace = service(ctx, "uiWorkspace");
    if (typeof workspace?.openSession !== "function") throw new Error("\u5F53\u524D DSH \u4E0D\u652F\u6301\u6253\u5F00\u8BFE\u9898\u4F1A\u8BDD\u3002");
    if (!sessionId || typeof sessionId !== "string") throw new Error("\u8BE5\u8BFE\u9898\u6CA1\u6709\u53EF\u6253\u5F00\u7684\u539F\u4F1A\u8BDD\u3002");
    workspace.openSession(sessionId);
  };
  const openMemberSession = (member) => {
    const workspace = service(ctx, "uiWorkspace");
    if (typeof workspace?.openSession !== "function") throw new Error("\u5F53\u524D DSH \u4E0D\u652F\u6301\u6253\u5F00\u6210\u5458\u4F1A\u8BDD\u3002");
    if (!member?.childId) throw new Error("\u8BE5\u6210\u5458\u6CA1\u6709\u8BB0\u5F55\u53EF\u6253\u5F00\u7684\u4F1A\u8BDD\u3002");
    const sessions = sessionsOf();
    const parentSessionId = member.parentSessionId || currentSessionId(sessions);
    if (!parentSessionId) throw new Error("\u65E0\u6CD5\u786E\u5B9A\u6210\u5458\u4F1A\u8BDD\u6240\u5C5E\u7684\u9879\u76EE\u4F1A\u8BDD\u3002");
    workspace.openSession({ parentSessionId, childSessionId: member.childId, mode: "continuable" });
  };
  const memberOpenAvailable = (view) => {
    const workspace = service(ctx, "uiWorkspace");
    const sessions = sessionsOf();
    return typeof workspace?.openSession === "function" && Boolean(getSessionId() || view?.team?.members?.some((member) => member.parentSessionId && member.childId));
  };
  const prepareHandoff = async (kind, target = null) => {
    return handoffToComposer({ ctx, sessionId: getSessionId(), kind, target, openConversation });
  };
  let manager;
  ctx.inject?.(["pluginNavigation"], (scope) => {
    manager = scope.pluginNavigation;
    scope.effect(() => () => {
      manager = void 0;
    });
  });
  const openPluginManager = () => {
    if (!manager?.openList) return false;
    manager.openList();
    return true;
  };
  return { openPluginManager, getSessionId, subscribeSession, getCurrentSession, openConversation, openWorkbench, openRootSession, openMemberSession, memberOpenAvailable, prepareHandoff };
}
function WorkbenchIcon({ size = 22, active = false }) {
  return /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", "data-active": active || void 0, children: [
    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("path", { d: "M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z" }),
    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("path", { d: "M8 8h8M8 12h5M8 16h3" })
  ] });
}
function apply(ctx) {
  let mount;
  try {
    mount = window.__DSH_SCIENCE_CLIENT_MOUNT__ || null;
    if (!mount) window.__DSH_SCIENCE_CLIENT_MOUNT__ = mount = { main: false, panelIcon: false, quick: false, tab: false, dock: false, turnCards: false };
  } catch {
    mount = { main: false, panelIcon: false, quick: false, tab: false, dock: false, turnCards: false };
  }
  const services = makeServices(ctx);
  try {
    window.__DSH_SCIENCE_DEBUG__ = { currentSessionId: () => currentSessionId(service(ctx, "sessions") || ctx.sessions) };
  } catch {
  }
  ctx.effect(() => registerGuardedPart(mount, "main", () => ctx.slots.inject("main", () => ctx.slots.register({
    name: "main",
    key: PANEL_ID,
    inject: () => ({ services })
  }, ResearchWorkbench))), "dsh-science main workbench");
  ctx.effect(() => registerGuardedPart(mount, "panelIcon", () => ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
    name: "sidebar.panellist",
    id: PANEL_ID,
    order: 40,
    label: () => "\u79D1\u7814\u5DE5\u4F5C\u53F0"
  }, WorkbenchIcon))), "dsh-science global panel entry");
  const tabs = service(ctx, "sidebarRightTabs") || ctx.sidebarRightTabs;
  if (tabs && typeof tabs.register === "function") {
    ctx.effect(() => registerGuardedPart(mount, "tab", () => tabs.register({
      id: PANEL_ID,
      kind: "workbench",
      title: () => "\u79D1\u7814\u5DE5\u4F5C\u53F0",
      guide: [{ id: "workbench", order: 10, title: () => "\u79D1\u7814\u5DE5\u4F5C\u53F0", description: () => "\u663E\u793A\u7814\u7A76\u9636\u6BB5\u3001\u4E0B\u4E00\u6B65\u5EFA\u8BAE\u548C\u56E2\u961F\u8FD0\u884C\u72B6\u6001\u3002\u6253\u5F00\u5B8C\u6574\u5DE5\u4F5C\u53F0\u53EF\u67E5\u770B\u8BBA\u6587\u4E3B\u7EBF\u3001\u56E2\u961F\u8FDB\u5C55\u3001\u56FE\u8868\u6210\u679C\u4E0E\u4E13\u5BB6\u914D\u7F6E\u3002" }]
    })), "dsh-science right-rail tab");
    ctx.effect(() => registerGuardedPart(mount, "quick", () => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
      name: "sidebar.right.pane.tab",
      key: PANEL_ID,
      inject: () => ({ services })
    }, QuickWorkbench))), "dsh-science right-rail companion");
  }
  ctx.effect(() => registerGuardedPart(mount, "dock", () => ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
    name: "conversation.input.dock",
    id: "dsh-science/context",
    order: 30,
    inject: () => ({ services })
  }, ScienceDock))), "dsh-science composer dock");
  const locale = service(ctx, "locale") || ctx.locale;
  if (locale && typeof locale.register === "function") {
    ctx.effect(() => locale.register(SCIENCE_CONFIRM_LOCALE, scienceConfirmLocale()), "dsh-science confirm locale");
  }
  const actionCards = service(ctx, "actionCards") || ctx.actionCards;
  if (actionCards && typeof actionCards.register === "function") {
    ctx.effect(() => actionCards.register({
      action: SCIENCE_CONFIRM_ACTION,
      locale: SCIENCE_CONFIRM_LOCALE,
      Body: ScienceConfirmBody
    }), "dsh-science confirm card");
  }
  const uiConversation = service(ctx, "uiConversation") || ctx.uiConversation;
  if (uiConversation && uiConversation.events && typeof uiConversation.events.register === "function") {
    ctx.effect(() => registerGuardedPart(mount, "turnCards", () => {
      const disposeDefinition = uiConversation.events.register(scienceStateChangeDefinition);
      const disposeRenderer = ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
        name: "conversation.chat.node",
        key: "dsh-science/state-change",
        inject: () => ({})
      }, StateChangeCard));
      return () => {
        try {
          disposeRenderer();
        } catch {
        }
        try {
          disposeDefinition();
        } catch {
        }
      };
    }), "dsh-science turn cards");
  }
}
return module.exports; } });
