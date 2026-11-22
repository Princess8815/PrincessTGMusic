# Album Player, Official Track Order & Personal Playlists

This change is designed to work with the existing **GitHub Pages + Firebase Auth + Firestore** site. No Cloud Functions, Firebase Storage, or Blaze upgrade is required.

## Admin: your official album order

Open **Admin → Albums → Edit**, choose an album, then use the **Official Track Order** area. Drag tracks or press ↑/↓ to reorder. Click **Save Album & Track Order**.

The song IDs are saved to the album's existing Firestore document in `albums/{albumId}.trackOrder`, along with its other metadata. This controls the initial order for every visitor.

Editing artwork, album description, or track order no longer rewrites every song. Album renames or release-date changes still propagate to matching songs using the existing update mechanism.

**If you cannot edit an album:** check that the existing `albums/{albumId}` rules permit an owner/admin to update that document. You do not need any additional collections.

## Album pages: visitors' personal choices

`albums/album.html?id=...` now has a dark purple player, album art, Play/Pause, Previous/Next, Shuffle, Repeat, and a collapsible **Lyrics** drawer above the audio player.

Visitors can drag tracks or use ↑/↓ to create a *personal order*. The order is saved to localStorage under `princesstg-album-track-order:<albumId>` on that browser. Press **Reset to album default** to clear the override and restore the admin's official order.

If the owner reorders an album, visitors without a personal override see the new official order. Visitors with a saved override keep their own order until resetting.

## Playlists

Shared controls let visitors add one song or a whole album to a playlist from:
- the new album page and album collection
- older generated album pages
- individual song details, including generated legacy song pages
- the all-songs player and its selected album
- the releases list

The **My Music Playlists** section under **Profile** can create, select, delete, play, reorder, shuffle, and remove tracks. Lyrics appear in a collapsible drawer. Songs without on-site MP3s can be saved and viewed but **cannot play** until an audio file is published.

Playlist data is in **localStorage on the current browser**, separated by the signed-in Firebase UID. It is **not cloud-synced**, shared between devices, or stored in Firestore. Existing local playlists under `audio-player-custom-playlists-v1` are migrated for the first signed-in account using the new library.

## Safety and testing

1. While testing in VS Code Live Server, remember the admin still writes to the actual Firestore project. Start with a test album and a few songs.
2. Admin: rearrange songs and save. Reload the album in a separate browser to confirm the new official order.
3. Visitor: rearrange the same songs; reload to confirm the personal order persists. Press Reset to confirm the official order comes back.
4. Try Shuffle and Repeat, and expand Lyrics while playing songs with known lyrics.
5. Use Add to Playlist for one song, one whole album, and a released song without MP3. Open Profile and confirm all appear.
6. Test playback and drag/arrow reordering in Profile. Reload to check persistence.
7. Sign into two different accounts in the same browser to confirm the playlists remain separate.

**MP3 security has not changed.** Download buttons may be hidden, but files on GitHub Pages remain publicly accessible by URL. No Cloud Functions are used for these features.

The old static album pages remain online. They now get a whole-album playlist shortcut through the site's shared authentication script, but their older embedded player layout is not replaced; the new album index opens the enhanced dynamic album page.
