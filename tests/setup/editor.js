// Loads the editor into the jsdom global the way index.html does.
//
// js/editor.js is a classic script — no module wrapper, no IIFE — so every
// symbol it declares is a global. That is exactly why tests/expvis_probe.py can
// call addComponent() and _compileExperiment() straight from an injected
// script, and it is the property this setup reproduces off-browser.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");

// The editor assumes the whole page DOM is already present: at load it wires
// handlers onto elements by id. Give it that DOM rather than an empty document,
// or the load dies on the first missing element — which says nothing about the
// editor.
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const inner = html
  .replace(/^[\s\S]*?<html[^>]*>/i, "")
  .replace(/<\/html>[\s\S]*$/i, "")
  // The page's own <script src> tags would fetch over the network. The editor
  // script is loaded below; the jsPsych CDN tags are for the generated
  // experiments, not for the editor.
  .replace(/<script\b[^>]*\bsrc=[^>]*><\/script>/gi, "");
document.documentElement.innerHTML = inner;

// Indirect eval runs in the global scope, so the editor's top-level `var` and
// `function` declarations land on globalThis — the same thing a classic
// <script> does, and what makes `editor`, `addComponent` and
// `_compileExperiment` reachable from a spec.
(0, eval)(fs.readFileSync(path.join(ROOT, "js", "editor.js"), "utf8"));
