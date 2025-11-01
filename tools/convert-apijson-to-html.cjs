#!/usr/bin/env node
/*
 * Minimal converter: turn a UI5-style api.json into a simple static HTML reference.
 * Usage: node tools/convert-apijson-to-html.cjs <input-api.json> [output.html]
 *
 * This is intentionally small and dependency-free. It produces a basic Table of Contents
 * and a simple rendering of entities (modules/classes/interfaces) with properties and methods.
 *
 * Extend as needed (links, inheritance, examples).
 */
const fs = require("fs");
const path = require("path");

function usage() {
	console.error("Usage: node tools/convert-apijson-to-html.cjs <api.json> [out.html]");
	process.exit(2);
}

const src = process.argv[2];
const out = process.argv[3] || "apiref.html";
if (!src) usage();
if (!fs.existsSync(src)) {
	console.error("Input file not found:", src);
	process.exit(3);
}

let data;
try {
	data = JSON.parse(fs.readFileSync(src, "utf8"));
} catch (err) {
	console.error("Failed to read/parse JSON:", err.message);
	process.exit(4);
}

// Helper to safely get arrays
const arr = (v) => Array.isArray(v) ? v : [];

// Normalize entities from commonly used fields in various api.json shapes
const entities = [];
if (Array.isArray(data.modules)) entities.push(...data.modules.map((e) => ({...e, kind: "module"})));
if (Array.isArray(data.classes)) entities.push(...data.classes.map((e) => ({...e, kind: "class"})));
if (Array.isArray(data.interfaces)) entities.push(...data.interfaces.map((e) => ({...e, kind: "interface"})));
if (Array.isArray(data.enums)) entities.push(...data.enums.map((e) => ({...e, kind: "enum"})));

// Fallback: sometimes top-level 'symbols' or 'apis' might exist
if (Array.isArray(data.symbols)) entities.push(...data.symbols.map((e) => ({...e, kind: e.kind || "symbol"})));

function escapeHtml(s) {
	if (!s && s !== 0) return "";
	return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderEntity(e) {
	const title = e.name || e.fullName || "(unknown)";
	const desc = e.description || e.summary || "";
	const props = arr(e.properties).map((p) => `<li><strong>${escapeHtml(p.name)}</strong>${p.type? " <em>(" + escapeHtml(p.type) + ")</em>" : ""} — ${escapeHtml(p.description || "")}</li>`).join("\n");
	const methods = arr(e.methods).map((m) => {
		const params = arr(m.params).map((p) => escapeHtml(p.name) + (p.type ? ": " + escapeHtml(p.type) : "")).join(", ");
		return `<li><strong>${escapeHtml(m.name)}(${params})</strong>${m.returns ? " → <em>" + escapeHtml(JSON.stringify(m.returns)) + "</em>" : ""} — ${escapeHtml(m.description || "")}</li>`;
	}).join("\n");
	const examples = (arr(e.examples).map((ex) => `<pre>${escapeHtml(ex)}</pre>`).join("\n")) || "";
	return `<section class="entity">
	<h2 id="${escapeHtml(title)}">${escapeHtml(title)} <small class="kind">${escapeHtml(e.kind || "")}</small></h2>
	<p class="desc">${escapeHtml(desc)}</p>
	${props ? "<h3>Properties</h3><ul>" + props + "</ul>" : ""}
	${methods ? "<h3>Methods</h3><ul>" + methods + "</ul>" : ""}
	${examples ? "<h3>Examples</h3>" + examples : ""}
</section>`;
}

const toc = entities.map((e) => `<li><a href="#${escapeHtml(e.name || e.fullName)}">${escapeHtml(e.name || e.fullName)}</a> <span class="k">${escapeHtml(e.kind || "")}</span></li>`).join("\n");
const body = entities.map(renderEntity).join("\n");

const title = escapeHtml(data.name || data.title || "API Reference");
const html = `<!doctype html>
<html>
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width,initial-scale=1" />
	<title>${title}</title>
	<style>
		body{font-family:Inter,ui-sans-serif,system-ui,Arial,Helvetica,sans-serif;margin:24px;max-width:1100px}
		header{display:flex;align-items:center;justify-content:space-between}
		h1{margin:0 0 12px 0}
		.toc{float:right;width:300px;margin-left:20px;padding:12px;border-left:1px solid #eee}
		.entity{margin-bottom:28px}
		.entity h2{margin:0 0 6px 0}
		.k{color:#6b7280;font-size:0.9em}
		pre{background:#f7f7f8;padding:12px;border-radius:6px;overflow:auto}
	</style>
</head>
<body>
	<header>
		<h1>${title}</h1>
	</header>
	<div style="display:flex;gap:16px;">
		<main style="flex:1;">
			${body || "<p>No API entities found in this api.json.</p>"}
		</main>
		<aside class="toc">
			<h3>Table of contents</h3>
			<ul>
				${toc || "<li>(empty)</li>"}
			</ul>
		</aside>
	</div>
</body>
</html>`;

// Ensure output directory exists
const outDir = path.dirname(out);
if (outDir && !fs.existsSync(outDir)) fs.mkdirSync(outDir, {recursive: true});
fs.writeFileSync(out, html, "utf8");
console.log("Wrote", out);
