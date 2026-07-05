const fs = require("fs");
const path = require("path");

const siteUrl = "https://princess8815.github.io/PrincessTGMusic";
const logoUrl = `${siteUrl}/images/logo%20avatar.png`;
const audioPlayerDir = path.join(__dirname, "audioPlayer");
const detailsFile = path.join(audioPlayerDir, "audio", "song-details.json");
const pagesDir = path.join(audioPlayerDir, "pages");
const templateFile = path.join(pagesDir, "template.html");

function slugify(title) {
  return String(title ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "song";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function makeUniquePageId(title, usedPageIds) {
  const basePageId = slugify(title);
  let pageId = basePageId;
  let suffix = 2;

  while (usedPageIds.has(pageId)) {
    pageId = `${basePageId}-${suffix}`;
    suffix += 1;
  }

  usedPageIds.add(pageId);
  return pageId;
}

function getSongPageId(song, usedPageIds) {
  if (!song.pageId) {
    return slugify(song.title);
  }

  const savedPageId = slugify(song.pageId);
  if (savedPageId && !usedPageIds.has(savedPageId)) {
    usedPageIds.add(savedPageId);
    return savedPageId;
  }

  return makeUniquePageId(song.title, usedPageIds);
}

function renderTemplate(template, replacements) {
  return template.replace(/{{([A-Z_]+)}}/g, (match, token) => {
    if (!Object.prototype.hasOwnProperty.call(replacements, token)) {
      return match;
    }

    return replacements[token];
  });
}

function cleanMultilineText(value) {
  return String(value ?? "").split("\n").map((line) => line.trimEnd()).join("\n");
}

function renderSongPage(song, pageId, template) {
  const title = song.title;
  const description = song.description || `Listen to ${title} by PrincessTG.`;
  const pageTitle = `${title} by PrincessTG`;
  const url = `${siteUrl}/audioPlayer/pages/${pageId}.html`;

  return renderTemplate(template, {
    LOGO_URL: logoUrl,
    META_DESCRIPTION: escapeHtml(description),
    PAGE_ID: escapeHtml(pageId),
    PAGE_TITLE: escapeHtml(pageTitle),
    PAGE_URL: escapeHtml(url),
    RELEASE_DATE: escapeHtml(song.releaseDate || ""),
    SONG_ALBUM: escapeHtml(song.album || ""),
    SONG_DESCRIPTION: escapeHtml(song.description || ""),
    SONG_LYRICS: escapeHtml(cleanMultilineText(song.lyrics || "No lyrics available.")),
    SONG_TITLE: escapeHtml(title),
  });
}

const songs = JSON.parse(fs.readFileSync(detailsFile, "utf8"));
const template = fs.readFileSync(templateFile, "utf8");
const usedPageIds = new Set();
const writtenPageIds = new Set();

for (const song of songs) {
  if (!song.title) continue;
  const pageId = getSongPageId(song, usedPageIds);
  fs.writeFileSync(path.join(pagesDir, `${pageId}.html`), renderSongPage(song, pageId, template), "utf8");
  writtenPageIds.add(pageId);
}

console.log(`Wrote ${writtenPageIds.size} song pages to ${pagesDir} using ${templateFile}`);
