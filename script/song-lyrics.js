
/* ==========================================
   PRINCESSTG SONG LYRIC CLEANER
========================================== */

export function cleanLyrics(input) {
  return String(input ?? "")
    // Normalize Windows and Mac line endings.
    .replace(/\r\n?/g, "\n")

    .split("\n")
    .map(line => {

      // Remove labels such as:
      // [Chorus], [Verse 1], [Instrumental]
      line = line.replace(/\[[^\]]*\]/g, "");

      // Remove parentheses, but keep the text.
      // (Hello) becomes Hello.
      line = line.replace(/[()]/g, "");

      line = line.trim();

      if (!line) return "";

      // Lowercase the line.
      line = line.toLowerCase();

      // Capitalize the first letter.
      // Supports non-English alphabets.
      line = line.replace(
        /\p{L}/u,
        letter => letter.toUpperCase()
      );

      return line;
    })

    .join("\n")

    // Never leave more than one blank line
    // between sections.
    .replace(/\n{3,}/g, "\n\n")

    .trim();
}
