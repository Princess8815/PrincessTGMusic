# PrincessTG Creations | Direct Firestore Site Mail

## No Cloud Function is needed for mail

Site Mail in **My Profile → Mail** now uses the Firebase Web SDK to read, search, send and delete mail **directly in Firestore**. It no longer calls `siteMail` and no longer needs the `siteMailCleanup` scheduled function. The existing unrelated newsletter Cloud Functions are unchanged.

The previous `siteMail`/cleanup exports and `functions/site-mail.js` have been removed from this feature branch.

## Required: manually publish the accompanying Firestore Security Rules

**The security rules are not committed to this PR**, per the owner's request. Publish the updated `PrincessTG_Firestore_Rules_Direct_Mail.txt` provided in the chat. They extend the user's earlier rules without opening the private `users` collection. Publishing the older mail rules will continue to block all mailbox writes and search.

Do not add a permissive wildcard. Firestore ORs permissions granted by overlapping rules, so a wildcard allowing access to other people's mail would bypass this protection.

### Collection paths

- `siteMailDirectory/{uid}`: **public-to-verified-members** directory. Stores display name and updated timestamp only, **not email addresses**. Existing members appear after next verified sign-in.
- `siteMailBoxes` is **not used**. The exact container name is `siteMailboxes` (lowercase "b").
- `siteMailboxes/{uid}/siteInbox/{id}`: the recipient's private Inbox message and compressed pictures.
- `siteMailboxes/{uid}/siteSent/{id}`: the sender's private Sent message and compressed pictures.
- `siteMailThrottle/{uid}`: last-sent timestamp, 24-hour counter and last message ID for server-enforced anti-spam cooldown.

Sending is a **single three-document atomic Firestore batch**: create Inbox copy, create Sent copy, advance sender's rate receipt. Rules enforce both copies match, verify active sender/recipient accounts and Firebase email verification, and restrict the sender to **one message every 15 seconds and at most 50 messages per 24 hours**. Recipients can update only their own read receipt. Deleting one copy does not delete the other.

Only the author's signed-in verified account can see or delete their mail. Firestore rules, not UI hiding, enforce ownership.

## Required: configure 30-day automatic cleanup with Firestore TTL

Firestore has a built-in Time-to-Live (TTL) service; **no Cloud Functions and no external cron job** are needed for cleanup.

In **Google Cloud Console → Firestore database → Time-to-live → Create policy**, configure these **two policies**, both with field `expiresAt` and an offset of **0**:

1. Collection group: **`siteInbox`**, TTL field: **`expiresAt`**
2. Collection group: **`siteSent`**, TTL field: **`expiresAt`**

The web client writes `createdAt` and `expiresAt` with approximately 30 days between them, and the Security Rules prevent changing those timestamps after creation. The UI hides expired messages. Direct message reads are refused after expiry by security rules. Firestore TTL removes the documents and embedded pictures **typically within 24 hours after expiration**, not instantly to the second.

TTL deletions are billable and generally **not included in the Firestore free quota**. Check project billing and costs before enabling TTL. See the official Firebase guide: https://firebase.google.com/docs/firestore/ttl

**If you do not enable both TTL policies, the mail will visually expire but the stored data will NOT be physically removed automatically.**

## Recipient search and enrollment

The client cannot query `users` because that collection contains private authentication emails and is available only to the owner and administrators under the existing rules.

Instead, the client searches `siteMailDirectory` by display-name prefix. The verified account registers its own exact public display name in the directory using the existing `script/user-data.js` initialization after sign-in or email verification. Other members must also sign in after this release to appear in search; there is no server migration of old accounts.

Directory entries are restricted to display names from the user's current account record. A member cannot create a public directory entry for someone else's UID.

## Features and limits

- Inbox, Sent, Compose, replies, per-message and bulk deletes, timestamps, unread state
- Search members by display name; no member emails shown to other users
- Attach songs via a site URL/reference, import shared playlists into browser-local playlists
- Attach up to 3 images from a phone/computer, converted to compressed JPEG in the browser
- No user-supplied audio, SVG, HTML, executable or other file uploads
- Max 140 KB per compressed picture, subject 120 characters, body 6,000 characters, playlist 150 song references

Pictures are embedded directly in Firestore message copies. The two-copy design uses extra document writes and storage, and each opened message reads the compressed image data. Plan capacity as membership grows.

## Release checklist

1. Publish the **new direct-mail rules** manually. The previously published function-only mail rules block this implementation.
2. Ensure Google and email/password sign-in providers are enabled under Firebase Authentication. Add the current site domain under Authorized domains.
3. Merge and publish PR #18's website changes (the prior PRs #15 → #16 → #17 still form its dependency chain).
4. Log in as two **verified** users. Check the `siteMailDirectory` collection and confirm each member appears by public display name.
5. Search, send, read, reply, delete from Inbox, delete from Sent, and verify the other account's copy remains.
6. Configure both TTL policies (`siteInbox`, `siteSent`, `expiresAt`). Test expiry with safe test records, not real messages.
7. Validate the Firestore rules with the Firebase Rules Playground/emulator: no email verification, banned/archived users, forged sender, recipient mailbox reading, spoofed sender name, missing paired copy, repeated sends, and fake audio attachments must all be rejected.
8. Test on 320px/375px/390px mobile screens and with a second account's first sign-in.

The included checks are static and simulated. **Production Firestore rules and TTL have not been deployed or emulator-tested from this PR.**

## Further protection before broad public rollout

Even verified email addresses can belong to spammers. Consider App Check, block/report controls, moderation, and a stronger directory/contact discovery flow. Strict Firestore rules are essential regardless of which UI sends the request.

## Email verification troubleshooting (PR #18 follow-up)

The registration modal and Site Mail verification gate both call the same
`sendSiteVerification` helper. It now uses `sendEmailVerification(user)`
**without custom ActionCodeSettings**, so Firebase's hosted handler generates
the verification link without requiring GitHub Pages as an authorized
*continue URL*. Users return to the site after confirming their email.

- Firebase **accepted** the request: the UI says that Firebase accepted the
  request and shows the address it used. Check Inbox, Spam/Junk and Promotions.
  Delivery, email filtering and delays are controlled by Firebase and the
  destination provider, not Firestore rules or our JavaScript.
- Firebase **rejected** the request: the UI shows the returned error code and
  reason. For `auth/too-many-requests` or `auth/quota-exceeded`, stop
  retrying and inspect Firebase Auth usage/limits before another attempt.
  For `auth/network-request-failed`, check browser connectivity.
- A separate display-name/profile write failure **must not** prevent the
  newly created account from requesting a verification email.
- On return, the site refreshes Firebase Auth using `reload(user)` and
  `user.getIdToken(true)`. The verification badge and mail gate update.
- Check Firebase Console → **Authentication → Templates → Email address
  verification** to review the project template, sender and action-link
  settings. Confirm the user has an actual email/password account in
  Authentication → Users.
- Google sign-in is separate: a Google account whose Firebase Auth
  `emailVerified` is already true does not require a second verification
  email.

**These checks cannot confirm real email delivery without access to Firebase
Auth logs and the recipient's inbox.** Neither publishing Firestore rules nor
deploying a Cloud Function is required to send Firebase Auth verification
emails. The regular app uses Firebase Authentication's client SDK.


### Why one account receives verification email but others do not

Verification emails are sent by **Firebase Authentication**, not Firestore or a site-mail Cloud Function. Every request targets the **currently signed-in** user's Firebase email. PR #18 now requests verification immediately after account creation, before saving the user's optional profile information, so an unrelated database/profile failure cannot block the email request.

On the verification screen, confirm the **actual account email** displayed. A request to verify another user is not possible from the owner's logged-in account.

Firebase enforces per-project sending quotas and automatic abuse protections, sometimes including limits based on repeated registrations from a shared IP. These limits can prevent additional test accounts from receiving emails, even when an established account succeeds. Firebase documents the limits at https://firebase.google.com/docs/auth/limits.

For a failed test, note the precise on-screen result:

- **Firebase accepted a verification request for X**: Firebase accepted the API call, but this is not proof that X's provider delivered it. Check Inbox, Spam/Junk, Promotions, Firebase Authentication → Templates → Email address verification, and the address shown on the screen.
- **Firebase did not send** with `auth/too-many-requests`, `auth/quota-exceeded` or another code: it was rejected. Stop repeated requests, check quotas and rate limits, and retry after restrictions lift. Do not keep creating test accounts to work around a restriction.
- **Account created but no verification request appears**: check browser JavaScript console for the actual Authentication error, and verify the account exists under Firebase Authentication → Users.

The two verification buttons (login and profile mail) now deduplicate overlapping calls for the same account. An accepted request is tracked per current account rather than applying the owner's cooldown to another signed-in account. No Firebase email verification bypass or admin claim override is used.


## Local emulator: profile read times out after test-user sign-in

Seeing the Firebase banner "Running in emulator mode" proves that the
**Authentication emulator (9099)** is connected; it does **not** prove that
the **Firestore emulator (8080)** is running. Profile information, including
`users/{uid}`, lives in Firestore, not in Firebase Authentication.

The website uses demo project `demo-princesstg` on
`localhost`/`127.0.0.1`. Firebase CLI must use **the same demo ID**:

```cmd
firebase emulators:start --only auth,firestore --project demo-princesstg
```

Run from the repository root and **keep that terminal open**. Because
`firebase.json` was updated to bind all emulator services to
`127.0.0.1`, restart the CLI after pulling changes.

In a second terminal, test whether Firestore is reachable:

```cmd
curl -i http://127.0.0.1:8080/
```

Any HTTP response, even `404`, confirms that something is listening.
`Failed to connect`, `Connection refused`, or a hanging connection means
the Firestore emulator isn't responding. Open the dashboard at
`http://127.0.0.1:4000/firestore` and confirm Firestore appears in the
emulator's running-services table. Ensure the terminal still uses **Java 21+**.
The dashboard itself running does not imply Firestore started successfully.

When Firestore is available, the web app's `script/user-data.js` automatically
creates new test profiles under `users/{uid}` after Firebase Auth sign-in.
The updated profile page waits for that initialization and offers **Retry
loading profile**. If initialization was denied, the page shows a rules error,
not an endless spinner. Missing documents are **not** silently replaced by
fake browser-only account records.

**Security warning:** Firestore emulator rules are open by default if no
`firestore.rules` file is supplied. For meaningful private-mail and ban
testing, load the owner's separate reviewed rules text into a local
`firestore.rules` and point `firebase.json` at it. Rules are not committed
here per request, and do not change the live project.

After a GitHub branch update, run `git status` to check for uncommitted local
work, then fetch/pull the updated PR branch and hard-refresh the local site.
Don't discard local edits or overwrite the live Firebase data.


## Local development mode toggle: emulators or live Firebase

A new **Settings → Local Firebase connection** control is available on
`http://localhost` and `http://127.0.0.1` preview sites. It is **not
displayed or enabled on the public GitHub Pages domain**.

- **Use local Firebase emulators** (default on a new localhost browser origin):
  Authentication on `127.0.0.1:9099`, Firestore on `127.0.0.1:8080`,
  and isolated project `demo-princesstg`. Start them with
  `firebase emulators:start --only auth,firestore --project demo-princesstg`.
  These services must be running for test accounts, profiles and mail.
- **Use live Firebase**: the local Live Server preview connects to
  `music-and-poetry` using real Firebase Authentication and Firestore.
  **No emulators need to be running**. Bans, messages and deletions affect
  real data, so the switch requires confirmation and the site displays an
  amber **LOCAL PREVIEW · LIVE FIREBASE** indicator.
- The selected mode is saved **per local browser origin**, so a different
  Live Server hostname or port may default to emulator mode again.
- Switching forces a full-page reload; Firebase SDK instances cannot
  be repointed safely while active. The emulator has a separate Firebase
  app name for independent Auth persistence, so a test-user session is not
  treated as a live user session.
- A small local badge on site pages identifies the mode and links to Settings.
  The badge and toggle never appear on the public site. Live production mode
  on GitHub Pages is always enforced regardless of stored preferences.
- You can turn off the emulators after switching the local preview to live
  mode. Switching back to emulator mode requires restarting both services.

Neither mode automatically copies accounts or documents between local
emulators and real Firebase. Do not use real credentials for emulator tests.

**For safety:** The mode switch does not alter published Firestore rules.
Local mail rules must still be loaded in the Firestore emulator. Real mail
continues to use the project's deployed security rules.
