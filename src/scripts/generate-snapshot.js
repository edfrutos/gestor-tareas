/**
 * Generates a stable directory-tree snapshot (like `tree`) with configurable excludes.
 *
 * Default excludes (by name, any depth):
 * - node_modules, uploads, dist, build, .git, tmp
 *
 * You can additionally pass glob-like patterns (matched against posix relative paths):
 * - `*`  matches any chars except `/`
 * - `?`  matches a single char except `/`
 * - `**` matches any chars including `/`
 *
 * Usage:
 *   node src/scripts/generate-snapshot.js --out esqueleto.txt
 *   node src/scripts/generate-snapshot.js --stdout
 *   SNAPSHOT_EXCLUDE="node_modules,uploads,**\\/dist\\/**" node src/scripts/generate-snapshot.js --stdout
 */

const fs = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_EXCLUDE_NAMES = ["node_modules", "uploads", "dist", "build", ".git", "tmp"];

function splitCsv(s) {
  if (!s) return [];
  return String(s)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function toPosixRel(p) {
  // Normalize to a posix-ish relative path for matching.
  return p.split(path.sep).join("/");
}

function globToRegExp(glob) {
  // Minimal glob -> RegExp. Supports *, ?, **.
  // We anchor it, so patterns like "**/dist/**" behave predictably.
  let re = "^";
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i];
    if (ch === "*") {
      const next = glob[i + 1];
      if (next === "*") {
        re += ".*";
        i += 1;
      } else {
        re += "[^/]*";
      }
      continue;
    }
    if (ch === "?") {
      re += "[^/]";
      continue;
    }
    // Escape regex specials.
    if ("\\.[]{}()+-^$|".includes(ch)) re += "\\";
    re += ch;
  }
  re += "$";
  return new RegExp(re);
}

function compileExcludePatterns(patterns) {
  const compiled = [];
  for (const p of patterns) {
    const isNameOnly = !p.includes("/") && !p.includes("*") && !p.includes("?");
    if (isNameOnly) {
      compiled.push({ kind: "name", value: p });
    } else {
      compiled.push({ kind: "glob", value: p, re: globToRegExp(p) });
    }
  }
  return compiled;
}

function shouldExcludeEntry({ name, relPathPosix, compiledExcludes }) {
  for (const rule of compiledExcludes) {
    if (rule.kind === "name") {
      if (name === rule.value) return true;
      continue;
    }
    if (rule.re.test(relPathPosix)) return true;
  }
  return false;
}

async function getDirectoryListing(dirAbs, relDirPosix, options) {
  const { includeHidden, compiledExcludes } = options;
  const dirents = await fs.readdir(dirAbs, { withFileTypes: true });

  const entries = [];
  for (const d of dirents) {
    const name = d.name;
    if (!includeHidden && name.startsWith(".")) continue;

    const relPathPosix = relDirPosix ? `${relDirPosix}/${name}` : name;

    // Filter *at collection time* to avoid recursing into excluded paths.
    if (shouldExcludeEntry({ name, relPathPosix, compiledExcludes })) continue;

    entries.push({
      name,
      isDirectory: d.isDirectory(),
      isSymlink: d.isSymbolicLink(),
      relPathPosix,
      absPath: path.join(dirAbs, name),
    });
  }

  // Stable ordering: directories first, then lexicographic by name.
  entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return entries;
}

async function buildTreeLines(dirAbs, relDirPosix, options, prefix, depth) {
  const { maxDepth } = options;
  if (Number.isFinite(maxDepth) && depth > maxDepth) return [];

  const entries = await getDirectoryListing(dirAbs, relDirPosix, options);
  const lines = [];

  for (let idx = 0; idx < entries.length; idx += 1) {
    const e = entries[idx];
    const isLast = idx === entries.length - 1;
    const branch = isLast ? "└── " : "├── ";
    lines.push(`${prefix}${branch}${e.name}`);

    if (e.isDirectory && !e.isSymlink) {
      const childPrefix = prefix + (isLast ? "    " : "│   ");
      const childLines = await buildTreeLines(
        e.absPath,
        e.relPathPosix,
        options,
        childPrefix,
        depth + 1,
      );
      lines.push(...childLines);
    }
  }

  return lines;
}

async function generateSnapshot({ rootDir, excludePatterns, includeHidden, maxDepth }) {
  const compiledExcludes = compileExcludePatterns(excludePatterns);
  const rootAbs = path.resolve(rootDir);

  const lines = ["."];
  const childLines = await buildTreeLines(
    rootAbs,
    "",
    { compiledExcludes, includeHidden, maxDepth },
    "",
    1,
  );
  lines.push(...childLines);
  return lines.join("\n") + "\n";
}

function parseArgs(argv) {
  const args = {
    rootDir: ".",
    outFile: "esqueleto.txt",
    stdout: false,
    includeHidden: false,
    maxDepth: Infinity,
    excludePatterns: [],
    excludeMode: "default-plus", // default-plus | only
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--root") {
      args.rootDir = argv[i + 1];
      i += 1;
      continue;
    }
    if (a === "--out") {
      args.outFile = argv[i + 1];
      i += 1;
      continue;
    }
    if (a === "--stdout") {
      args.stdout = true;
      continue;
    }
    if (a === "--include-hidden") {
      args.includeHidden = true;
      continue;
    }
    if (a === "--max-depth") {
      const n = Number(argv[i + 1]);
      args.maxDepth = Number.isFinite(n) ? n : Infinity;
      i += 1;
      continue;
    }
    if (a === "--exclude") {
      args.excludePatterns.push(...splitCsv(argv[i + 1]));
      i += 1;
      continue;
    }
    if (a === "--exclude-only") {
      args.excludeMode = "only";
      args.excludePatterns.push(...splitCsv(argv[i + 1]));
      i += 1;
      continue;
    }
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const envExcludes = splitCsv(process.env.SNAPSHOT_EXCLUDE);
  const base = DEFAULT_EXCLUDE_NAMES;
  const excludePatterns =
    args.excludeMode === "only"
      ? [...envExcludes, ...args.excludePatterns]
      : [...base, ...envExcludes, ...args.excludePatterns];

  // Ensure path patterns use posix separators for matching.
  const normalizedPatterns = excludePatterns.map((p) => toPosixRel(p));

  const snapshot = await generateSnapshot({
    rootDir: args.rootDir,
    excludePatterns: normalizedPatterns,
    includeHidden: args.includeHidden,
    maxDepth: args.maxDepth,
  });

  if (args.stdout) {
    process.stdout.write(snapshot);
    return;
  }

  const outAbs = path.resolve(args.outFile);
  await fs.writeFile(outAbs, snapshot, "utf8");
  console.log(`Snapshot written to ${outAbs}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_EXCLUDE_NAMES,
  compileExcludePatterns,
  generateSnapshot,
  getDirectoryListing,
  shouldExcludeEntry,
};

