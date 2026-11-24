# Multiple albums and original release dates

Requires PR #24 and updated Firestore song rules. No Cloudflare or Stripe changes.

In Admin > Music > Add or Edit, select one primary album (or Single) and optionally two different additional albums. The same song ID and audio are used on all three album pages. Set the independent standalone/original release date if applicable; leave it blank when a song has no standalone release date. The displayed release date is the earliest valid ISO date from that field and the selected albums. The generic Single grouping is not treated as a common release date for every single.

Existing records without originalReleaseDate use their previous releaseDate as the independent date, preserving existing release history. Editing an album recalculates matching tracks while retaining their other memberships. An intentional correction can be made in the song editor's independent date field. Legacy custom release labels still work through the existing JSON fallback; editing a legacy non-date requires selecting a valid date as before. TBD values never override a known date.

Schema: album (primary string, retained for compatibility), albums (list of 1–3 distinct approved names, primary first), originalReleaseDate (YYYY-MM-DD or tbd), releaseDate (earliest known date). Old records remain readable without migration. Existing CD listings have explicit per-volume songIds; refresh and save a CD listing after changing memberships to update its track assignments. Existing album track ordering remains independent.

Rules: update validNewSong's allowed keys to include albums and originalReleaseDate. Validate optional album membership as a list of 1–3 unique approved names with album equal to the first element, and originalReleaseDate as a date string or tbd. Apply membership/date validation to staff updates when these fields change; keep existing staff permissions and all other rules unchanged. Back up deployed rules first; do not replace newer unrelated rules. Test one song before bulk edits.

Tests: node --experimental-default-type=module tests/song-albums.test.mjs

## CD Store browsing and featured listings

The CD Store uses compact cards, category tabs (a category dropdown on mobile), and an album dropdown. In Admin > Albums > CD Store, each individual CD has a Category field (type a new name or select a suggestion) and a Featured checkbox. Existing listings default to Albums and not featured. Only sellable CDs appear. Featured CDs appear at the top of the selected category/album, without repeating them in the regular grid. A single-disc album stores an empty volume name for compatibility with the already-deployed Worker; its title is always the album name. Each multi-disc volume can have its own category, feature status, and name. These display-only fields do not affect SKU, prices, or checkout, and do not require deploying the Worker again. The existing PR25 album rules already permit staff to save this metadata.
