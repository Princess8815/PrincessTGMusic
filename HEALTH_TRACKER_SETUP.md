# Health Tracker & Meal Planner

A **Health Tracker** navigation link is available to *every site visitor* in the shared
desktop sidebar and mobile hamburger menu. The public tracker page lives at
`pages/health.html`.

## Public vs. saved information

Everyone can open the tracker, view home workout guides, and search approximate
food/calorie reference amounts. To **save** a diary, plan or goal, sign in to
a PrincessTG account. Each member's records are isolated in Firestore under
their own Firebase Authentication UID. Staff and other users do not get access
to their private health records.

The locally bundled quick-reference food calories are **estimates** for the
specified serving; they are not a live commercial database and may not match
a particular brand or preparation. An external link opens USDA FoodData Central
for more detailed lookups. Users can enter custom foods and override estimates.

## First-time setup: mandatory Firestore rules

**IMPORTANT:** The Health Tracker cannot save or read member records until
its Firestore Security Rules have been installed. As requested for previous
work on this repository, the full rules are supplied **separately from the
GitHub PR**. This PR does not add or commit `firestore.rules`.

Use the separately provided
`PrincessTG_Firestore_Rules_With_Health_Tracker.txt` as the updated full
rules file, after reconciling it with any newer production changes.

1. Open your Firebase project → Firestore Database → Rules.
2. Compare the existing deployed rules with the supplied full rules file.
3. Preserve any changes you've made since the verification-bypass rule set.
4. Include the two new private matches for `healthDays` and
   `healthSettings`. Publish the updated rules.
5. Test in the Firestore emulator or a disposable test account before
   putting it on the production site.

The critical authorization is that **only** `request.auth.uid == uid` may
read, create, update or delete records in:

- `users/{uid}/healthDays/{YYYY-MM-DD}`
- `users/{uid}/healthSettings/main`

It is intentional that even administrators and the website owner **cannot**
read another person's records.

## Everyday use

**Journal and food:** Open the Health Tracker and sign in. Today's local date
is selected by default. Use the date selector, previous-day and next-day
buttons, or Today to view past entries. For an actual food entry, enter the
food name, per-serving calories, number of servings, meal and optional notes.
The food lookup offers a shortcut to fill the form. Remove incorrect entries
without touching other meals.

**Morning weight:** Enter a morning weight on the selected date. Pounds and
kilograms are accepted for entry; the database stores a normalized pound
value. Saving again corrects the same date's value. Clearing a weight
does not delete meals or workouts.

**Meal plans:** Select any date, including future dates, enter a meal and
estimated calories, and see a seven-day planning overview. A planned meal
does **not** count as eaten. For today/past dates, choose **Log as eaten**
to add it to the actual calorie diary.

**Workouts:** Log an activity, duration, effort and optional notes. Home
workout guides are available to guests and members alike. Exercise time is
tracked separately; workouts do not subtract calories from food intake.

**Goals:** Set optional personal calorie, starting-weight and goal-weight
values. No default calorie limit is imposed. Calorie and weight targets are
personal settings rather than prescribed nutritional guidance.

**Dashboard and analytics:** The dashboard has day totals, comparison to
the personal calorie target, a 14-day calorie chart and a 30-day weight
chart. Analytics include eight recent weeks, six recent months, averages
of calories and weight, workout minutes, weight change and progress toward
the user's weight goal. **Averages are computed only across days with
actual food or weight entries. Missing days are NOT treated as zero.**
The dashboard loads recent data to reduce reads. Historical dates remain
editable by choosing them explicitly.

**Profile:** Use **My Profile → Health** for a quick private summary and a
link to the full tracker.

**Refresh:** The **Refresh saved data** button reloads your recent records
and goals from Firestore, including updates from other signed-in devices.

## Privacy and data deletion

Under **Goals & Analytics**, members can export all health records and
settings to a JSON file, or erase all saved health data with double
confirmation. No health diary data is stored in browser localStorage.
Local Firebase Emulator mode and Live Firebase mode use distinct projects.

The existing **Delete Account** workflow now attempts to delete the
member's saved Health Tracker records and settings **before** deleting
the Firebase Authentication user. If the cleanup fails, login deletion
stops so the user can retry. Deployment of the private health rules
is therefore important for account closure on this branch.

## Developer details

- **Daily document:** `users/{uid}/healthDays/{date}` with
  `date`, `weightLb`, `foods[]`, `workouts[]`, `plans[]` and
  Firestore `updatedAt`.
- **Settings:** `users/{uid}/healthSettings/main` with
  `calorieTarget`, `goalWeightLb`, `startingWeightLb`, and
  `updatedAt`.
- Saving a daily entry uses a Firestore **transaction**, re-reading the
  document to avoid accidentally overwriting another device's edits.
- Client list size caps: max 100 food entries, 60 workouts, and 60
  planned meals per day.
- No Cloud Functions or paid APIs are required. Real-time push is not
  currently implemented; explicit Refresh reloads server data.
- The food lookup is a small offline catalog, not a live nutrition API.
- Requires browser JavaScript, Firebase Auth and Firestore access.

### Testing

Static syntax, integration checks, analytics helper tests and Firestore
path/privacy review are included in the development PR notes. The
separate security-rules file must be compiled and tested in the user's
Firebase emulator or production rules editor; static brace checks alone
are not a rules-engine test. Browser testing with an authenticated
test account is required before merge.
