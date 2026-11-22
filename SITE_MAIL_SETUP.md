# PrincessTG Creations: Private Site Mail Setup

## What this adds

The **My Profile → Mail** tab uses Firebase callable Cloud Functions to send private, authenticated in-site mail between accounts. It is **not external SMTP email** and does not send real email notifications.

Members can search other members by display name, send/receive/reply, open mail with sent/expiry times, delete individual mail or clear Inbox/Sent, send site song references, send a snapshot of a locally saved playlist, and attach up to **three pictures**. Picture uploads are converted client-side into compressed JPEG images (typically under 140 KB each). No user-provided audio files, SVG, HTML, executables, or other file types may be sent.

### Retention, deletion and copies

Each message receives both `createdAt` and `expiresAt` timestamps. The expiry is **30 × 24 hours after the send timestamp**, not after the last read.

There are two *private envelope records* for each message: one in `siteMailboxes/{recipientUid}/inbox/{messageId}`, another in `siteMailboxes/{senderUid}/sent/{messageId}`. Each person deletes only their own envelope. An account cannot read mail if its own envelope has been deleted, even when the shared underlying message still exists.

The scheduled `siteMailCleanup` job checks every six hours and purges expired messages, both mailbox envelopes and any compressed image content. The callable functions stop serving expired mail immediately at the 30-day deadline, even if the next cleanup job has not yet run.

The underlying `siteMailMessages/{messageId}` record remains stored until its expiry so that deletion by one party cannot delete the other party's mail early.

**For immediate deletion of all copies** (for example, a privacy request or account-deletion flow), implement an additional privileged admin-only server operation. The regular Delete and Delete all buttons remove the user's copy, not both users' copies.

## Required security review before deployment

These are **private message collections**. The application never requests them directly from the browser: all searches, sends, reads and deletes go through the `siteMail` callable, which verifies Firebase Auth, checks sender and recipient account statuses, limits sending to 8 messages/minute and 50 messages/day, and limits the attachment payload.

**IMPORTANT:** The currently deployed Firestore Security Rules are *not included* in this repository. There is no `firestore.rules` entry in `firebase.json`. Do not deploy a new generic rules file over the existing project rules without inspecting and merging them.

Under the existing project's `match /databases/{database}/documents` block, ensure these exact collections are inaccessible directly from web and mobile clients:

```
// Private site mail: only Cloud Functions Admin SDK may access these.
match /siteMailMessages/{messageId} {
  allow read, write: if false;
}
match /siteMailboxes/{memberUid}/{folder}/{messageId} {
  allow read, write: if false;
}
match /siteMailSendRate/{memberUid} {
  allow read, write: if false;
}
```

**A broad permissive rule such as `match /{document=**} { allow read, write: if true; }` OVERRIDES these denies.** Firebase ORs permissions from overlapping matches. Remove/restrict permissive catch-all rules and validate in the Firestore emulator or Rules Playground before release. Do not use the app with real users until private data access is verified.

These functions use Admin SDK, so they bypass Firestore Rules on the server. Users do not need client-side permission to query mail collections.

## Function deployment

The current `firebase.json` uses the `newsletters` codebase and `functions/index.js`. The new `siteMail` callable and `siteMailCleanup` scheduled function are exported from that existing entry point. Ensure your local functions deployment environment has the dependencies already used by `functions/index.js` (Firebase Admin and Functions).

Review the project, select it with Firebase CLI and deploy the new functions:

```bash
firebase use <your-project-alias>
firebase deploy --only functions:newsletters:siteMail,functions:newsletters:siteMailCleanup
```

If your Firebase CLI version requires an alternate codebase filter, use the CLI's normal function selection workflow. **Scheduled Cloud Functions require a Firebase billing-enabled project** and a Cloud Scheduler job.

The front end will show a clear error until the functions are deployed successfully. Merely merging the GitHub Pages changes does not make them functional.

## Browser and security tests

1. Test two separate accounts. Search a member by **display name** (not email), send and reply, confirm Sent and Inbox, timestamps and unread indicators.
2. Delete one inbox message. Confirm the recipient copy disappears but the original sender's Sent copy remains. Clear all messages in a folder and confirm other users' copies remain.
3. Send a single site song and a local playlist snapshot. The receiver should open the song or import the playlist into their own browser-local playlists.
4. Attach up to three ordinary JPEG/PNG/WebP images (including pictures from a mobile device). Uploads are converted to JPEG, under the image budget. Try audio files and confirm they are rejected both in the browser and in the callable.
5. Test very long text, user-supplied HTML, invalid Firestore UID, a banned/archived sender, a banned/archived recipient, repeated rapid sends, and cross-account ID guesses.
6. Test a 31-day-old message with `siteMailCleanup` in an emulator. Verify all three database documents and embedded image data are gone.
7. Test a mobile screen at 320/375/390 px, attached pictures, long usernames, long subject lines, the Inbox → reader → Back navigation, and light/custom RGB themes.
8. **From a signed-in client, attempt direct Firestore reads** of `siteMailMessages` and another user's `siteMailboxes`. Both must fail with permission denied.
9. Check Firestore/Functions/Cloud Scheduler costs and monitor quotas after enabling the feature.

## Data and capacity

Messages and compressed images live inside Firestore documents rather than Firebase Storage, keeping the feature in one storage system. Mail-list responses contain only small summaries; opening a message fetches its image data on demand. Limits: one message to one recipient, three images per message, 150 KB per image, 450 KB combined compressed image data, 6,000-character body, 120-character subject, and 150 songs in a shared playlist.

The rate limit and retention policy do not replace anti-abuse moderation/reporting. If opening messages to a large user community, add block/report functionality and a dedicated abuse review process before wide release.
