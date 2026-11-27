# Admin Music / Albums / Genres upgrade

This branch adds a nested **Add / Edit / Delete** navigation for **Music**, **Albums**, and **Genres**, plus one shared dynamic album detail page.

## What changed

- Existing Music Add/Edit/Delete forms and script selectors were retained.
- **Album names** still live in `enums/albums.values`, preserving old Add Song and Edit Song dropdowns.
- **Album details** now live in `albums/{slug}` (name, releaseDate, description, coverUrl, timestamps).
- One reusable page, `albums/album.html?id=album-slug`, renders Firestore metadata and all tracks from the combined legacy JSON + Firestore song catalog. The album index now points here.
- Changing an album's release date or name attempts to update all matching Firestore song documents in **one atomic batch**. Older JSON-only songs receive Firestore overlay records; the old JSON and static pages are not deleted.
- Deleting an album containing songs is intentionally blocked. Reassign songs first.
- **Genres** use `enums/genres.values` with the existing hard-coded genre list as a fallback. Genre rename updates matching song records. Deleting an in-use genre is blocked.
- Native audio download menus are hidden and a visible **Download audio (admin)** link is shown only to verified staff. This is a **UI restriction, not actual file protection**.

## Firebase rules: add, do not replace your existing rules

Your current rules live in Firebase, not in the GitHub repository. **Back up the full existing rules before editing, and preserve all existing account, moderation, song, newsletter, and other rule blocks.**

Inside the existing `match /databases/{database}/documents` block, merge the following album rule. If a `match /albums/{albumId}` rule already exists, edit that rule rather than making a competing one:

```firestore
match /albums/{albumId} {
  allow read: if true;
  allow create, update, delete: if request.auth != null
    && exists(/databases/$(database)/documents/users/$(request.auth.uid))
    && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'owner'];
}
```

For `enums/genres`, update your **existing** `/enums/{enumId}` rule (or add a specific `/enums/genres` match if no applicable rule exists) to allow public read and verified admin/owner writes **while preserving the existing permissions on `enums/albums` and other enum documents**. Example of the intended condition:

```firestore
allow read: if true;
allow create, update, delete: if request.auth != null
  && exists(/databases/$(database)/documents/users/$(request.auth.uid))
  && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'owner'];
```

**Important:** Review existing song creation rules to ensure they allow the admin song override document format already used by `script/admin-edit-songs.js`. Album and genre updates to legacy JSON-only songs use that same Firestore-override approach. On a rules denial, a batch fails entirely and will not partially update the date.

Use the Firebase Rules Playground to test a public read, an admin create/edit/delete, and a nonadmin denied write before using the new editor.

No Firebase Cloud Functions or Blaze subscription is required for this Firestore-only feature.

## Test plan

1. Deploy the Firestore rules above. Open admin as an admin account. Confirm **Music** > Add/Edit/Delete still work.
2. In **Albums** > Add, create a test album with a description and date. Confirm it appears in Add Song dropdown (may require refresh for the Edit Song selector).
3. Open **Albums** > Edit, select the new album, change the date, and save. Verify Firestore `albums/<slug>` and `enums/albums`.
4. Assign a test song to that album, update the album date again, and verify `songs/<song-id>.releaseDate` changed. Test one old JSON-only song carefully before mass changes.
5. Visit `albums/index.html`, open an album, and verify the shared page has the updated metadata, tracks, and audio player.
6. In **Genres**, create a test genre, assign it to a test song, rename it, then verify the Firestore song genre changed. Deletion should be refused while in use.
7. For a signed-out visitor, check the audio player no longer offers the native download control. As an admin/owner, confirm a **Download audio (admin)** link appears after the player.

## Important limitations

- GitHub Pages serves `audioPlayer/audio/*.mp3` publicly. The site can **hide the download command**, but a visitor can still inspect the MP3 URL, access it directly, or save streaming audio. **Do not describe these files as secured.** True admin-only downloads require serving media through private storage and a server/authorized endpoint, not publicly available GitHub Pages assets.
- Old generated album HTML pages remain online unchanged for compatibility. The current album index links to the new dynamic page. Bookmarked old pages can still display embedded, outdated release dates until migrated or redirected.
- The album/genre update batch deliberately stops if more than **380** songs match, to avoid crossing Firestore's write limit.
- Changing an album's date updates the songs in Firestore, but externally hosted streaming platforms and previously generated static HTML files are not rewritten automatically.
- Because no live Firebase connection can be tested through this review, verify permissions and perform the above tests on a small sample before merging the branch into `main`.
