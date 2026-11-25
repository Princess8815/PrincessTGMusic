`firestore.rules` is the full supplied rules file with the marked Research & Surveys block added. Existing rules outside that block are preserved. Publish it to the `music-and-poetry` project before using the survey. The trusted service performs submissions; browsers can only read their own reward and balance, while active administrators/owners can read anonymous answers.

Run normal regression tests from the repository root:

```sh
node --test tests/*.test.* workers/cd-store/tests/*.test.mjs
```

For the security/atomic-write integration test, install the test tools outside the repository, then run against the demo emulator only (Java 21 required). `SURVEY_TEST_DEPS` is the absolute path to that install's `node_modules`:

```sh
npm install --prefix /tmp/princesstg-rules-qa firebase-tools@15.37.0 firebase@12.19.0 @firebase/rules-unit-testing@5.0.0
SURVEY_TEST_DEPS=/tmp/princesstg-rules-qa/node_modules /tmp/princesstg-rules-qa/node_modules/.bin/firebase emulators:exec --only firestore --project demo-princesstg 'node security/surveys.emulator.mjs'
```

The integration test checks anonymous response access, wallet/claim isolation, denied client writes (including staff), and real concurrent trusted commits that award exactly 500 coins without changing account fields. Marked test retries remain idempotent and earn no coins. It does not contact the production database.

The survey schema, validation, paginated exports, Word page separation, signed-token checks, request tampering, account changes, failures and retry races are also covered by the normal tests. Deployment instructions for both existing Workers are in `workers/cd-store/README.md`.
