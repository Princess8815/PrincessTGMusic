# Drag-and-drop ordering restored

This fix keeps **the global all-songs order**, **each personal playlist order**, **each visitor's album order**, and **your official album order** separate.

| Location | How to reorder | Where it saves |
|---|---|---|
| Main media player: All enabled tracks | Drag ☰ handle or use ↑ / ↓ | Local storage `audio-player-order-v1` |
| Main media player: selected personal playlist | Drag checked tracks' ☰ handles or use ↑ / ↓ | That playlist's tracks in local storage |
| Profile: My Music Playlists | Drag any track's ☰ handle or use ↑ / ↓ | That playlist's tracks in local storage |
| Album detail page | Drag a song's ☰ handle or use ↑ / ↓ | Personal album order in local storage |
| Admin → Albums → Edit | Drag a song's ☰ handle or use ↑ / ↓, **then Save Album** | Official `albums/{id}.trackOrder` in Firestore |

**Important:** Main media player playlists previously had `row.draggable = currentSort === "custom" && !isCustomPlaylistSelected()`, disabling dragging for selected playlists. This has been fixed.

Drag controls are attached to the handle so player buttons and links remain usable. Touchscreen drag via handle also has a pointer fallback; arrow controls remain available as an alternative.

The media player preserves songs excluded by album filtering and playlist-only entries without an MP3. Changing a playlist's order does not change the global music order. Manually dragging while another sort is active switches the player to **Custom order** so the saved order stays visible.

## Verify before merging

1. Open the all-songs player. Drag a track, reload, verify it stayed in that position.
2. Create/select a personal playlist. Drag two checked tracks, reload, verify order remains.
3. Switch to All enabled tracks. Verify the playlist reorder did not modify the global order.
4. On Profile, open the same playlist and confirm its order matches. Drag from there, return to the player, confirm the change.
5. On an album page, drag and reload. Reset to album default, confirm your official order returns.
6. In Admin → Albums → Edit, drag tracks, save, and open the album page in a fresh browser to confirm the official order changed.

This is a client-side UI fix. It does not change Firebase rules or require Blaze. End-to-end browser testing against the live site has not been performed here.
