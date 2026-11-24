# Homepage reef secrets

Based independently on main. The Listen tab has a nameless clickable axolotl (Pip). A small red DO NOT PRESS button in the Stories section under Discover reveals Hex saying "You have freed me!" Both use the existing pending-discovery queue and transaction, not purchase entitlements. Loading the page does not record either encounter. Repeat clicks cannot create duplicate documents. Guests can sign in later on the same device. The collection and discovery toast confirm saves.

## Firestore rules

In your currently deployed full rules, inside match /users/{uid}/axolotls/{axolotlId}, add 'pip' and 'hex' to the ordinary discovery ID allowlist. Preserve all other rules, including active-account/ownership checks and purchase-only restrictions. Do not add Shelly or Tide to the client allowlist. This is the only rule change. As with other ordinary cosmetic discoveries, this client-side system is not tamper-proof against someone manually calling an allowed write.

## Test

Check that neither item is awarded on load; click each encounter and check profile collection. Test repeats, guest sign-in, keyboard activation and separate accounts. Publish the two-ID rule patch before testing actual saves.
