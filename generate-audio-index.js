const fs = require("fs");
const path = require("path");

const audioDir = path.join(__dirname, "audioPlayer", "audio");
const outputFile = path.join(audioDir, "index.json");

const allowedExtensions = new Set([
  ".mp3",
  ".wav",
  ".ogg",
  ".m4a",
  ".aac",
  ".flac",
  ".webm",
]);

function walk(dir, baseDir = dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...walk(fullPath, baseDir));
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (!allowedExtensions.has(ext)) {
      continue;
    }

    const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, "/");
    results.push(`audio/${relativePath}`);
  }

  return results.sort((a, b) => a.localeCompare(b));
}

const files = walk(audioDir);
fs.writeFileSync(outputFile, JSON.stringify(files, null, 2), "utf8");

console.log(`Wrote ${files.length} tracks to ${outputFile}`);