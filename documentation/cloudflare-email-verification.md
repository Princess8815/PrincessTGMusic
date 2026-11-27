# Cloudflare + Resend email verification rollout
Firebase generates the actual one-time VERIFY_EMAIL link and applies it via its hosted handler. The Worker never returns or logs that link, never directly marks an account verified, and never accepts a client-supplied recipient. Password resets remain unchanged. Local Firebase emulator continues its native verification flow.

## Before merging
- Confirm RESEND_API_KEY is a secret on the live Worker, not the Pages project; keep Resend click tracking disabled for verification links.
- Confirm the verified Resend sending domain matches VERIFICATION_FROM; the sender is verification@princesstg-creations.com.
- Confirm the existing Firebase Worker service account has Firebase Auth user lookup and email action-link generation permissions (not just Firestore). Do not expose credentials.
- From the repository root, run `node --test workers/cd-store/tests/member-verification.test.mjs`.
- Apply the additive migration to live D1 first: `npx wrangler d1 execute princesstg-cd-orders-live --remote --config workers/cd-store/wrangler.live.toml --file workers/cd-store/migrations/0005_verification_sends.sql`. Verify the table exists.
- Deploy Worker from this branch before merging the frontend: `npx wrangler deploy --config workers/cd-store/wrangler.live.toml`. Preserve all existing secrets and inspect config changes.
- Use the branch's Pages preview alias (check the actual alias and adjust VERIFICATION_PREVIEW_ORIGIN if necessary). Test a new unverified Yahoo account, a Gmail account, spam folders, repeat requests, and existing verified accounts. Confirm Resend delivery events and Firebase emailVerified after clicking the link, and that verified-only features work. Remove the preview origin after testing. Verify existing store and games on the custom domain.
- Merge only after successful tests. Existing users and old Pages origin remain supported. Rollback by reverting the frontend change; Firebase's original sending flow will work as before. The additive D1 table can remain.

## Limits
1/minute and 5/rolling 24 hours per account or normalized email; 20/hour per IP; 80/rolling 24 hours for verification requests globally. Reservations include unsuccessful provider attempts to prevent abuse. Expired records are purged by the existing scheduled Worker. Resend acceptance is not guaranteed inbox delivery, and other mail can consume its quota. Firebase's own link-generation limits still apply. For delivery diagnostics use the Resend dashboard; Worker logs contain provider status and accepted message IDs, not addresses or action links.
