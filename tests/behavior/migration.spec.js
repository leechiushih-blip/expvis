// Reading what was written before the vocabulary changed.
//
// Phases became blocks — the UI, the internals, and the key the experiment is
// stored under. Everything persisted keeps the old key: a project in
// localStorage, a saved version, a model answer produced by the older prompt.
// Reading only the new name would silently open those as empty experiments,
// which is the worst way to lose someone's work: it looks like they never
// made it.

const H = require("./harness");

jest.useFakeTimers();

describe("an object that predates the rename", () => {
  test("a project stored under the old key still yields its blocks", () => {
    const blocks = [{id: "ph1", name: "Trials", timeline: []}];
    expect(_adoptBlocks({phases: blocks})).toEqual(blocks);
  });

  test("the new key wins when both are present", () => {
    const now = [{id: "b1"}];
    const then = [{id: "ph1"}];
    expect(_adoptBlocks({blocks: now, phases: then})).toEqual(now);
  });

  test("a project with neither key is empty, not broken", () => {
    expect(_adoptBlocks({})).toEqual([]);
    expect(_adoptBlocks(null)).toEqual([]);
    expect(_adoptBlocks(undefined)).toEqual([]);
  });

  test("a key holding something that is not a list is treated as absent", () => {
    // Not defensive for its own sake: a malformed project should open empty
    // rather than throw somewhere further in, where the message would name a
    // function instead of the file.
    expect(_adoptBlocks({blocks: "nope"})).toEqual([]);
    expect(_adoptBlocks({phases: 42})).toEqual([]);
  });

  test("the old key is read at every place a project can arrive", () => {
    // The four readers are the live project, a saved version, the undo
    // snapshot, and a model answer. This asserts the function is what they
    // call, rather than each of them spelling out `|| phases` and one
    // forgetting — which is how a migration ends up covering three of four.
    const src = require("fs").readFileSync(
      require("path").join(H.ROOT, "js", "editor.js"),
      "utf8"
    );
    const callSites = (src.match(/_adoptBlocks\(/g) || []).length;
    expect(callSites).toBe(5); // the definition plus four readers
    // and nothing still reads the field directly
    expect(/JSON\.parse\(JSON\.stringify\((s|v)\.blocks\)\)/.test(src)).toBe(false);
    expect(/editor\.blocks = (d|exp)\.blocks/.test(src)).toBe(false);
  });
});
