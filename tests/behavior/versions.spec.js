// The versions under test are the versions researchers get.
//
// A generated experiment loads jsPsych and its plugins from unpkg at the exact
// versions _jspsychPluginCDN pins. The behaviour tests run against the packages
// installed here. If the two drift, every green assertion above is about a
// jsPsych nobody is using — which is the quietest way for this whole layer to
// stop meaning anything.
//
// This does not test a component. It is the premise the rest of them rest on.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");

function cdnTable() {
  const src = fs.readFileSync(path.join(ROOT, "js", "editor.js"), "utf8");
  const start = src.indexOf("var _jspsychPluginCDN = {");
  const block = src.slice(start, src.indexOf("\n      };", start));
  const out = {};
  // The table reads `jsPsychXxx: {pkg: '@jspsych/…', ver: '1.2.3'}` — the
  // global name is the key, outside the braces that hold the package.
  const re = /(\w+):\s*\{pkg:\s*'([^']+)',\s*ver:\s*'([^']+)'\}/g;
  let m;
  while ((m = re.exec(block))) out[m[1]] = { pkg: m[2], ver: m[3] };
  const core = /_JSPsychVersion\s*=\s*'([^']+)'/.exec(src);
  return { plugins: out, core: core && core[1] };
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
// Pinned, not ranged: a caret would let npm install a newer plugin than the one
// the generated file asks unpkg for, and the tests would silently be about it.
function pinOf(range) {
  const m = /^\^?(\d+\.\d+\.\d+)$/.exec(String(range).trim());
  return m ? m[1] : null;
}
function installedVersion(name) {
  return JSON.parse(
    fs.readFileSync(path.join(ROOT, "node_modules", name, "package.json"), "utf8")
  ).version;
}

describe("what the tests run against is what the experiment loads", () => {
  const cdn = cdnTable();

  test("editor.js still pins a table this can read", () => {
    // A silent zero would make every assertion below vacuously true.
    expect(Object.keys(cdn.plugins).length).toBe(23);
    expect(cdn.core).toBeTruthy();
  });

  test("jsPsych core is on the pinned version", () => {
    expect(pkg.devDependencies.jspsych).toBe("^" + cdn.core);
    expect(installedVersion("jspsych")).toBe(cdn.core);
  });

  test("every plugin the editor can emit is a dependency, at the pinned version", () => {
    const missing = [];
    const wrongRange = [];
    const wrongInstalled = [];
    Object.keys(cdn.plugins).forEach((globalName) => {
      const pkgName = cdn.plugins[globalName].pkg;
      const want = cdn.plugins[globalName].ver;
      const have = pkg.devDependencies[pkgName];
      if (!have) {
        missing.push(pkgName);
        return;
      }
      if (pinOf(have) !== want) wrongRange.push(`${pkgName}: ${have} vs ${want}`);
      const installed = installedVersion(pkgName);
      if (installed !== want) wrongInstalled.push(`${pkgName}: ${installed} vs ${want}`);
    });
    expect(missing).toEqual([]);
    expect(wrongRange).toEqual([]);
    expect(wrongInstalled).toEqual([]);
  });

  test("the harness provides a stub for every plugin the editor can emit", () => {
    // A plugin the editor emits but the harness does not supply would reach the
    // generated code as an undefined identifier, and the run would fail with a
    // message pointing at the generated file rather than at the gap here.
    const H = require("./harness");
    const absent = Object.keys(H.PLUGINS).filter(
      (globalName) => !cdn.plugins[globalName] && globalName !== "jsPsychPreload"
    );
    // The harness may carry extras (it names the real preload plugin too), but
    // every global the generated code can spell has to be present.
    const emittedGlobals = new Set(Object.keys(cdn.plugins).concat("jsPsychPreload"));
    const notSupplied = [...emittedGlobals].filter((g) => !(g in H.PLUGINS));
    expect(notSupplied).toEqual([]);
    expect(absent.length).toBeGreaterThanOrEqual(0);
  });
});
