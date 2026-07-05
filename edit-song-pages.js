const { spawnSync } = require("child_process");
const path = require("path");

const result = spawnSync(process.execPath, [path.join(__dirname, "generate-song-pages.js")], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
