# Elemental dragons
The Dragons category is an ordinary Starlight Store category; ownership uses the existing starlightCollectibles records. The six stable item IDs in script/starlight-dragons.mjs are future perk lookup keys. Perks are not active and no coin bonuses are granted.

## One-time catalog import
1. Use the starlight-elemental-dragons branch and sign in as an admin or owner.
2. Open the existing Starlight Store admin manager. Select the supplied starlight-elemental-dragons.json catalog in Elemental Dragon collection.
3. Press Publish six dragons and confirm the Firebase target. The category is created first, then the six item records are published atomically. Existing IDs are never overwritten. A repeated import is safe.
4. Verify the Dragons store and profile collection tabs. Purchases use the existing server-side Star Coin checks. No automatic changes are made to live Firestore by the branch itself.

The catalog uses transparent WebP data URLs below the existing 180,000-character limit. No new IAM roles, Worker code or Firestore rules are needed when existing Starlight Store is working.
