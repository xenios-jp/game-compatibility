const assert = require("node:assert/strict");
const test = require("node:test");

const helpers = require("./compat-data.cjs");

function validSections(overrides = {}) {
  return {
    "Game Name": "Halo 3",
    "Title ID": "4D5307E6",
    Platform: "iOS",
    Device: "iPhone 15",
    "OS Version": "26.0",
    Architecture: "ARM64",
    "GPU Backend": "MSL (Metal Shading Language)",
    "Compatibility Status": "Playable — Game can be played start to finish with minor issues",
    Performance: "Great — Runs at or near full speed",
    "XeniOS Version": "2.0.1",
    "Build Channel": "Release",
    "Build Number": "9730",
    Notes: "Campaign reaches gameplay.",
    ...overrides,
  };
}

test("uses required form identity when the issue title is unchanged", () => {
  const { report, errors } = helpers.normalizeIssueFormReport(
    { title: "[Compatibility Report]" },
    validSections()
  );

  assert.deepEqual(errors, []);
  assert.equal(report.titleId, "4D5307E6");
  assert.equal(report.title, "Halo 3");
  assert.equal(report.build.channel, "self-built");
  assert.equal(report.build.official, false);
});

test("keeps compatibility with reports that encode identity in the title", () => {
  const sections = validSections();
  delete sections["Game Name"];
  delete sections["Title ID"];

  const { report, errors } = helpers.normalizeIssueFormReport(
    { title: "4D5307E6 — Halo 3" },
    sections
  );

  assert.deepEqual(errors, []);
  assert.equal(report.titleId, "4D5307E6");
  assert.equal(report.title, "Halo 3");
});

test("rejects placeholder titles when the identity fields are absent", () => {
  const sections = validSections();
  delete sections["Game Name"];
  delete sections["Title ID"];

  const { report, errors } = helpers.normalizeIssueFormReport(
    { title: "[TITLE_ID] — [GAME_NAME]" },
    sections
  );

  assert.equal(report, null);
  assert.match(errors[0], /Game Name/);
});

test("rejects impossible iOS architecture and GPU combinations", () => {
  const { errors } = helpers.normalizeIssueFormReport(
    { title: "[TITLE_ID] — [GAME_NAME]" },
    validSections({
      Architecture: "x86_64",
      "GPU Backend": "MSC (Metal Shader Converter)",
    })
  );

  assert.ok(errors.includes("iOS reports can only use ARM64."));
  assert.ok(errors.includes("iOS reports can only use MSL."));
});

test("rejects incompatible status and performance combinations", () => {
  const { errors } = helpers.normalizeIssueFormReport(
    { title: "[TITLE_ID] — [GAME_NAME]" },
    validSections({
      "Compatibility Status": "Doesn't Boot — Does not boot or crashes immediately",
      Performance: "Great — Runs at or near full speed",
    })
  );

  assert.ok(errors.some((error) => error.includes('status "nothing"')));
});
