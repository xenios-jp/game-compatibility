"use strict";

const STATUS_RANK = {
  playable: 4,
  ingame: 3,
  intro: 2,
  loads: 1,
  nothing: 0,
};

const VALID_STATUSES = Object.keys(STATUS_RANK);
const VALID_PERFS = ["great", "ok", "poor", "n/a"];
const VALID_PLATFORMS = ["ios", "macos"];
const VALID_ARCHS = ["arm64", "x86_64"];
const VALID_GPU_BACKENDS = ["msl", "msc"];
const VALID_CHANNELS = ["release", "preview", "self-built"];
const SOURCE_FOOTERS = {
  app: "*Submitted via XeniOS in-app reporter*",
  discord: "*Submitted via Discord /report*",
  github: "*Submitted via GitHub issue*",
};

function slugify(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function parseIssueSections(body) {
  const sections = {};
  const text = String(body || "");
  const sectionRegex = /###\s+(.+)\s*\n([\s\S]*?)(?=\n###|\s*$)/g;
  let match;
  while ((match = sectionRegex.exec(text)) !== null) {
    const key = match[1].trim();
    const value = match[2].trim();
    if (value && value !== "_No response_") {
      sections[key] = value;
    }
  }
  return sections;
}

function normalizeStatus(raw) {
  const lower = String(raw || "").toLowerCase();
  if (lower.includes("playable")) return "playable";
  if (lower.includes("ingame") || lower.includes("in-game") || lower.includes("in game")) {
    return "ingame";
  }
  if (lower.includes("intro")) return "intro";
  if (lower.includes("loads")) return "loads";
  if (lower.includes("nothing") || lower.includes("doesn't boot") || lower.includes("doesnt boot")) {
    return "nothing";
  }
  return null;
}

function normalizePerf(raw) {
  const lower = String(raw || "").toLowerCase();
  if (lower.includes("great")) return "great";
  if (lower.includes("ok")) return "ok";
  if (lower.includes("poor")) return "poor";
  if (lower.includes("n/a") || lower.includes("not applicable")) return "n/a";
  return null;
}

function normalizePlatform(raw) {
  const lower = String(raw || "").toLowerCase();
  if (lower.includes("ios")) return "ios";
  if (lower.includes("macos")) return "macos";
  return null;
}

function normalizeArch(raw) {
  const lower = String(raw || "").toLowerCase();
  if (lower.includes("arm64")) return "arm64";
  if (lower.includes("x86_64") || lower.includes("x86")) return "x86_64";
  return null;
}

function normalizeGpuBackend(raw) {
  const lower = String(raw || "").toLowerCase();
  if (lower.includes("msl")) return "msl";
  if (lower.includes("msc")) return "msc";
  return null;
}

function normalizeChannel(raw) {
  const lower = String(raw || "").toLowerCase();
  if (lower.includes("self-built") || lower.includes("self built") || lower.includes("custom")) {
    return "self-built";
  }
  if (lower.includes("preview") || lower.includes("beta") || lower.includes("testflight")) {
    return "preview";
  }
  if (lower.includes("release") || lower.includes("official")) {
    return "release";
  }
  return null;
}

function parseIssueTitle(title) {
  const match = String(title || "").match(/^\[?([A-Fa-f0-9]{8})\]?\s*[—–-]\s*(.+?)$/);
  if (!match) {
    return null;
  }
  return {
    titleId: match[1].toUpperCase(),
    gameName: match[2].trim(),
  };
}

function sanitizeBuildFragment(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-|-$/g, "");
}

function makeBuildId(platform, channel, appVersion, buildNumber) {
  const parts = [
    sanitizeBuildFragment(platform),
    sanitizeBuildFragment(channel),
    sanitizeBuildFragment(appVersion),
    sanitizeBuildFragment(buildNumber),
  ].filter(Boolean);
  return parts.length >= 3 ? parts.join("-") : null;
}

function parseBuildFromSections(sections, platform) {
  const channel =
    normalizeChannel(sections["Build Channel"] || sections["Release Channel"] || sections["Channel"]) ||
    "release";
  const appVersion = String(
    sections["XeniOS Version"] || sections["App Version"] || sections["Version"] || ""
  ).trim();
  const buildNumber = String(sections["Build Number"] || sections["Build"] || "").trim();
  const commitShort = String(
    sections["Commit Short"] || sections["Commit"] || sections["Commit Hash"] || ""
  ).trim();
  const buildId =
    makeBuildId(platform, channel, appVersion, buildNumber) ||
    String(sections["Build ID"] || "").trim() ||
    null;

  if (!buildId && !appVersion && !buildNumber && !commitShort) {
    return null;
  }

  return {
    buildId: buildId || undefined,
    channel,
    official: channel !== "self-built",
    appVersion: appVersion || undefined,
    buildNumber: buildNumber || undefined,
    commitShort: commitShort || undefined,
  };
}

function parseMarkdownTableFields(text) {
  const fields = {};
  const lines = String(text || "").split("\n");
  let inTable = false;

  for (const line of lines) {
    if (line.includes("| Field | Value |")) {
      inTable = true;
      continue;
    }
    if (inTable && /^\|[\s-]+\|[\s-]+\|$/.test(line.trim())) {
      continue;
    }
    if (inTable && line.trim().startsWith("|")) {
      const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
      if (cells.length >= 2) {
        const key = cells[0].replace(/\*\*/g, "").trim();
        const value = cells[1].replace(/`/g, "").trim();
        if (key && value) {
          fields[key] = value;
        }
      }
      continue;
    }
    if (inTable) {
      break;
    }
  }

  return fields;
}

function parseSource(text) {
  const lower = String(text || "").toLowerCase();
  if (lower.includes("submitted via xenios in-app reporter") || lower.includes("submitted via app")) {
    return "app";
  }
  if (lower.includes("submitted via discord")) {
    return "discord";
  }
  if (lower.includes("submitted via github")) {
    return "github";
  }
  return undefined;
}

function extractNotes(text) {
  const match = String(text || "").match(
    /###\s*Notes\s*\n([\s\S]*?)(?=\n---|\n###\s*Screenshots?|\n<!-- xenios-auto -->|$)/i
  );
  return match ? match[1].trim() : "";
}

function extractImageUrls(markdown) {
  const urls = new Set();
  const text = String(markdown || "");
  const markdownImageRegex = /!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/g;
  const directImageRegex = /(https?:\/\/\S+\.(?:png|jpe?g|gif|webp))/gi;
  let match;
  while ((match = markdownImageRegex.exec(text)) !== null) {
    urls.add(match[1]);
  }
  while ((match = directImageRegex.exec(text)) !== null) {
    urls.add(match[1]);
  }
  return [...urls];
}

function parseBuildFromMarkdownFields(fields, platform) {
  const channel = normalizeChannel(fields["Build Channel"] || fields["Channel"]) || null;
  const appVersion = String(fields["XeniOS Version"] || fields["App Version"] || "").trim();
  const buildNumber = String(fields["Build Number"] || "").trim();
  const commitShort = String(fields["Commit Short"] || fields["Commit"] || "").trim();
  const buildId =
    makeBuildId(platform, channel || "release", appVersion, buildNumber) ||
    String(fields["Build ID"] || "").trim() ||
    null;

  if (!channel && !appVersion && !buildNumber && !commitShort && !buildId) {
    return null;
  }

  return {
    buildId: buildId || undefined,
    channel: channel || "release",
    official: (channel || "release") !== "self-built",
    appVersion: appVersion || undefined,
    buildNumber: buildNumber || undefined,
    commitShort: commitShort || undefined,
  };
}

function parseReportFromMarkdown(text, createdAt) {
  const fields = parseMarkdownTableFields(text);
  const status = normalizeStatus(fields["Status"] || "");
  const platform = normalizePlatform(fields["Platform"] || "");
  const device = fields["Device"] || "";
  if (!status || !platform || !device) {
    return null;
  }

  let osVersion = String(fields["OS Version"] || "").trim();
  osVersion = osVersion.replace(/^(iOS|iPadOS|macOS)\s*/i, "").trim();
  if (!osVersion) {
    return null;
  }

  const perf = normalizePerf(fields["Performance"] || "");
  const arch = normalizeArch(fields["Architecture"] || "") || "arm64";
  const gpuBackend = normalizeGpuBackend(fields["GPU Backend"] || "") || "msl";
  const notes = extractNotes(text);
  const submittedBy = String(fields["Submitted By"] || "").trim() || undefined;
  const build = parseBuildFromMarkdownFields(fields, platform);

  return {
    device,
    platform,
    osVersion,
    arch,
    gpuBackend,
    status,
    perf: perf || (status === "nothing" ? "n/a" : undefined),
    date: new Date(createdAt).toISOString().slice(0, 10),
    notes,
    source: parseSource(text),
    submittedBy,
    build,
  };
}

function compareIsoDateDesc(left, right) {
  return String(right || "").localeCompare(String(left || ""));
}

function getLatestReport(reports) {
  if (!Array.isArray(reports) || reports.length === 0) {
    return null;
  }
  return [...reports].sort((left, right) => compareIsoDateDesc(left.date, right.date))[0] || null;
}

function getBestReport(reports) {
  if (!Array.isArray(reports) || reports.length === 0) {
    return null;
  }

  return reports.reduce((best, report) => {
    if (!best) return report;
    const bestRank = STATUS_RANK[best.status] ?? -1;
    const reportRank = STATUS_RANK[report.status] ?? -1;
    if (reportRank > bestRank) return report;
    if (reportRank === bestRank && String(report.date || "") > String(best.date || "")) {
      return report;
    }
    return best;
  }, null);
}

function currentBuildForPlatform(releaseBuilds, platform, channel) {
  return releaseBuilds &&
    releaseBuilds.platforms &&
    releaseBuilds.platforms[platform] &&
    releaseBuilds.platforms[platform][channel]
    ? releaseBuilds.platforms[platform][channel]
    : null;
}

function reportMatchesChannel(report, releaseBuilds, channel) {
  if (!report || typeof report !== "object") return false;
  if (channel === "all") return true;

  const build = report.build && typeof report.build === "object" ? report.build : null;
  const currentBuild = currentBuildForPlatform(releaseBuilds, report.platform, channel);
  const currentBuildId = currentBuild && typeof currentBuild.buildId === "string"
    ? currentBuild.buildId
    : null;

  if (channel === "preview") {
    if (!build || build.channel !== "preview") return false;
    if (currentBuildId) {
      return build.buildId === currentBuildId;
    }
    return true;
  }

  if (currentBuildId) {
    return Boolean(build && build.channel === "release" && build.buildId === currentBuildId);
  }

  if (!build || !build.channel) {
    return true;
  }

  return build.channel === "release";
}

function buildSummary(channel, reports, releaseBuilds) {
  const matching = Array.isArray(reports)
    ? reports.filter((report) => reportMatchesChannel(report, releaseBuilds, channel))
    : [];
  const latestReport = getLatestReport(matching);
  const bestReport = getBestReport(matching);
  return {
    channel,
    status: bestReport ? bestReport.status : "untested",
    perf: bestReport ? bestReport.perf || null : null,
    notes: latestReport ? latestReport.notes || "" : "",
    updatedAt: latestReport ? latestReport.date : null,
    reportCount: matching.length,
    latestReport,
    bestReport,
  };
}

function decorateGame(rawGame, releaseBuilds) {
  const game = {
    ...rawGame,
    reports: Array.isArray(rawGame.reports) ? rawGame.reports : [],
    tags: Array.isArray(rawGame.tags) ? rawGame.tags : [],
    platforms: Array.isArray(rawGame.platforms) ? rawGame.platforms : [],
    screenshots: Array.isArray(rawGame.screenshots) ? rawGame.screenshots : [],
  };

  const summaries = {
    release: buildSummary("release", game.reports, releaseBuilds),
    preview: buildSummary("preview", game.reports, releaseBuilds),
    all: buildSummary("all", game.reports, releaseBuilds),
  };

  return {
    ...game,
    summaries,
  };
}

function buildLabelsForReport(report) {
  const labels = [
    "compat-report",
    `state:${report.status}`,
    `perf:${report.perf}`,
    `platform:${report.platform}`,
    `gpu:${report.gpuBackend}`,
  ];
  if (report.build && report.build.channel) {
    labels.push(`channel:${report.build.channel}`);
  }
  return [...new Set(labels)];
}

function buildMarkdownReportBody(report, source, screenshotUrls = [], submittedBy) {
  const statusEmoji = {
    playable: "✅",
    ingame: "🟦",
    intro: "🟨",
    loads: "🟧",
    nothing: "🔴",
  };
  const platformDisplay = report.platform === "ios" ? "iOS" : "macOS";
  const build = report.build || null;
  const lines = [
    "## Compatibility Report",
    "",
    "| Field | Value |",
    "|-------|-------|",
    `| **Title** | ${report.title} |`,
    `| **Title ID** | \`${report.titleId}\` |`,
    `| **Status** | ${statusEmoji[report.status]} ${report.status} |`,
    `| **Performance** | ${report.perf} |`,
    `| **Platform** | ${platformDisplay} |`,
    `| **Device** | ${report.device} |`,
    `| **OS Version** | ${platformDisplay} ${report.osVersion} |`,
    `| **Architecture** | ${report.arch} |`,
    `| **GPU Backend** | ${String(report.gpuBackend || "").toUpperCase()} |`,
  ];

  if (build) {
    if (build.channel) lines.push(`| **Build Channel** | ${build.channel} |`);
    if (build.appVersion) lines.push(`| **XeniOS Version** | ${build.appVersion} |`);
    if (build.buildNumber) lines.push(`| **Build Number** | ${build.buildNumber} |`);
    if (build.commitShort) lines.push(`| **Commit Short** | \`${build.commitShort}\` |`);
  }
  if (submittedBy) {
    lines.push(`| **Submitted By** | ${submittedBy} |`);
  }

  lines.push("", "### Notes", report.notes);

  if (screenshotUrls.length > 0) {
    lines.push("", screenshotUrls.length === 1 ? "### Screenshot" : "### Screenshots");
    screenshotUrls.forEach((url, index) => {
      lines.push(`![screenshot ${index + 1}](${url})`);
    });
  }

  lines.push("", "---", SOURCE_FOOTERS[source] || SOURCE_FOOTERS.github, "<!-- xenios-auto -->");
  return lines.join("\n");
}

function validateNormalizedReport(report) {
  const errors = [];
  if (!report.titleId || !/^[A-F0-9]{8}$/.test(report.titleId)) {
    errors.push("Title ID must be an 8-character hex value.");
  }
  if (!report.title) errors.push("Title is required.");
  if (!VALID_STATUSES.includes(report.status)) {
    errors.push(`Status must be one of: ${VALID_STATUSES.join(", ")}.`);
  }
  if (!VALID_PERFS.includes(report.perf)) {
    errors.push(`Performance must be one of: ${VALID_PERFS.join(", ")}.`);
  }
  if (!VALID_PLATFORMS.includes(report.platform)) {
    errors.push(`Platform must be one of: ${VALID_PLATFORMS.join(", ")}.`);
  }
  if (!report.device) errors.push("Device is required.");
  if (!report.osVersion) errors.push("OS version is required.");
  if (!VALID_ARCHS.includes(report.arch)) {
    errors.push(`Architecture must be one of: ${VALID_ARCHS.join(", ")}.`);
  }
  if (!VALID_GPU_BACKENDS.includes(report.gpuBackend)) {
    errors.push(`GPU backend must be one of: ${VALID_GPU_BACKENDS.join(", ")}.`);
  }
  if (!report.notes) errors.push("Notes are required.");
  if (report.platform === "ios" && report.gpuBackend !== "msl") {
    errors.push("iOS reports can only use MSL.");
  }
  if (report.build && report.build.channel && !VALID_CHANNELS.includes(report.build.channel)) {
    errors.push(`Build channel must be one of: ${VALID_CHANNELS.join(", ")}.`);
  }
  return errors;
}

function normalizeIssueFormReport(issue, sections) {
  const titleInfo = parseIssueTitle(issue.title || "");
  if (!titleInfo) {
    return { report: null, errors: ['Issue title must match "TITLE_ID — Game Name".'] };
  }

  const platform = normalizePlatform(sections["Platform"] || "");
  const status = normalizeStatus(sections["Compatibility Status"] || "");
  const perf =
    normalizePerf(sections["Performance"] || "") ||
    (status === "nothing" ? "n/a" : null);
  const arch = normalizeArch(sections["Architecture"] || "");
  const gpuBackend = normalizeGpuBackend(sections["GPU Backend"] || "");
  const build = parseBuildFromSections(sections, platform || "ios");

  const report = {
    titleId: titleInfo.titleId,
    title: titleInfo.gameName,
    status,
    perf,
    platform,
    device: String(sections["Device"] || "").trim(),
    osVersion: String(sections["OS Version"] || "").trim(),
    arch,
    gpuBackend,
    notes: String(sections["Notes"] || "").trim(),
    tags: [],
    build,
  };

  const errors = validateNormalizedReport(report);
  return { report, errors };
}

module.exports = {
  STATUS_RANK,
  VALID_CHANNELS,
  buildLabelsForReport,
  buildMarkdownReportBody,
  decorateGame,
  extractImageUrls,
  getBestReport,
  getLatestReport,
  makeBuildId,
  normalizeArch,
  normalizeChannel,
  normalizeGpuBackend,
  normalizePerf,
  normalizePlatform,
  normalizeStatus,
  normalizeIssueFormReport,
  parseIssueSections,
  parseIssueTitle,
  parseReportFromMarkdown,
  slugify,
  todayISO,
};
