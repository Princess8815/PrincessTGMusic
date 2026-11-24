# Legal and policy pages: owner review before publication

Four public, themed pages are linked at the bottom of the shared sidebar and in checkout. They are proposed policy text, not a legal compliance certification.

## Decisions requiring owner approval
- Proposed 13+ account age, guardian permission for minors, 30-day change-of-mind returns on unused CDs, customer return postage for voluntary returns, full pre-shipment cancellation, seller-paid return shipping for defects/errors, and dispatch within stated timeframe or 30 days. Approve and ensure the shop can actually honor these promises before merge; change them if needed subject to applicable law.
- Confirm the public support address/email, actual selling regions, shipment workflow, refund procedure, product warranties, and business identity. No personal home address or phone number is added.
- Confirm whether providers' features are live (newsletter, TTL, health data, rewards), review deployed Firebase rules and IAM, and confirm that no other tracking, advertising or third-party services are operating. No claim of verified production permissions is made.
- Set retention/deletion procedures for D1 checkout records (including incomplete orders), Formspree/email copies, tax records and logs. Account closure archives some information; Site Mail TTL requires separate deployment. Review archived profiles, directories, mail, promotional opt-in and Google-only account closure paths. This PR does not change any data handling.
- Review consumer health data obligations (including applicable state laws and FTC Health Breach Notification Rule), notice/consent requirements, children's privacy, incident response and data rights before offering the health feature broadly. The pages alone do not meet every possible legal requirement. Confirm no health records are used in advertising and review any future ads before rollout.
- Confirm Stripe refund/tax reversal procedures, D1 reconciliation, separate sandbox/live databases and hosting suitable for commerce before launch. Do not enable real payments based solely on this PR.

## Reference material
- FTC internet merchandise rule: https://www.ftc.gov/legal-library/browse/rules/mail-internet-or-telephone-order-merchandise-rule
- FTC health breach guidance: https://www.ftc.gov/business-guidance/resources/complying-ftcs-health-breach-notification-rule-0
- Wisconsin DATCP return/refund guidance: https://datcp.wi.gov/Pages/Publications/ReturnRefundPolicies168.aspx

## Verify after merge and deployment
- Open pages/privacy-policy.html, pages/terms-of-service.html, pages/refund-policy.html, pages/shipping-policy.html while signed out. Test sidebar on desktop/mobile, custom palette, keyboard focus and cross-links, and checkout links without losing cart. Enter the deployed HTTPS privacy and terms URLs into Stripe; update them when migrating hosts.
- No Firebase rules, Worker configuration, payment logic or data schema are changed.
