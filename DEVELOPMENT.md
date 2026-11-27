# Development rules

- New features must be testable locally or in a preview/sandbox before production. Never make live production the only way to test a new feature, particularly payment, account, database and reward changes.
- Keep test payments, configuration edits and test rewards isolated from real funds, memberships, Star Coins and collections. Use environment-specific keys, trusted authorization and test data.
- Provide setup and test instructions before merging; clearly disclose anything not exercised in a browser or against external services. Do not claim a feature is validated merely because syntax or mock tests pass.
- Preserve existing data and stable URLs whenever reorganizing the site.
