# Development rules

- New features must be testable locally or in a preview/sandbox before production. Never make live production the only way to test a new feature, particularly payment, account, database and reward changes.
- Keep test payments, configuration edits and test rewards isolated from real funds, memberships, Star Coins and collections. Use environment-specific keys, trusted authorization and test data.
- Provide setup and test instructions before merging; clearly disclose anything not exercised in a browser or against external services. Do not claim a feature is validated merely because syntax or mock tests pass.
- Preserve existing data and stable URLs whenever reorganizing the site.

- Continue changes on the user's current working branch and existing pull request. Never open another branch or PR while they are working on an existing branch unless they explicitly ask. Verify current PR state before editing; do not silently merge or close a PR.
- For live-backed game testing from a preview, apply the active staff member's matching preview Free/Paid self-test override to that member's verified game rewards. The preview toggle must not modify their production membership or anyone else's rewards. Real purchased membership remains authoritative for regular users. Existing games on approved previews use real wallets; do not mistake this for an isolated reward sandbox.
