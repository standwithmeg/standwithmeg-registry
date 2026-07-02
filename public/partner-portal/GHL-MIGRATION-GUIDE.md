# Move to Real Per-Partner Logins (GoHighLevel) — When You're Ready

The standalone portal is perfect for your first partners. When you want **individual
accounts, completion tracking, and a mobile app**, GoHighLevel Memberships does it natively —
no code, no extra bill (it's in your existing GHL).

You don't have to do this now. The content is already organized to drop straight in.

---

## Why move (eventually)
| Standalone portal (now) | GHL Membership (later) |
|---|---|
| Shared access code | Each partner has their own login |
| Progress saved on their device | You see who completed what |
| You host a folder | Lives in GHL, mobile app included |
| Free, instant | Included in your GHL plan |

---

## The map — your 8 modules become 8 GHL lessons
Build a **Course** in GHL → **Memberships → Courses → New Course** called
"State Partner Training." Create one **Category** ("Getting Started") and add these lessons,
pasting the text from `content/lessons.js`:

1. Welcome to the Team
2. Your Pitch, Line by Line
3. Handling the Hard Questions
4. The Brand Kit  *(upload the 8 SVGs from `brand-kit/` as downloadable materials)*
5. Your First 7 Days
6. How You Get Paid  *(embed the earnings calculator or paste the numbers)*
7. Staying Safe & On-Mission
8. Links & Submitting a Sponsor

Each lesson in `lessons.js` has a title, a minute estimate, and the body copy — copy the
text out of the `html` blocks; GHL's editor handles the formatting.

---

## Click-by-click (high level)
1. **Memberships → Courses → Create Course** → name it, add a cover (use `logo-stacked.svg`).
2. **Add Category** → "Getting Started."
3. **Add Post** for each module → paste the copy → upload brand-kit files under "Materials."
4. **Settings → Offer** → create a **free offer** so approved partners get instant access.
5. **Automation:** when a partner application is **Approved** in your pipeline, trigger
   *"Grant Offer"* so they're auto-enrolled and emailed their login. (This is the part that
   saves you time — approval → access happens by itself.)
6. **Drip (optional):** release Modules 5–8 a day after 1–4 so no one skips the basics.

---

## Auto-enroll on approval (the time-saver)
In **Automation → Workflows**:
- **Trigger:** Opportunity stage changed → "Partner Approved"
- **Action 1:** Grant the Course offer
- **Action 2:** Send welcome email (reuse the "You're in" template from
  `partner-application-reply-templates.md`)

Now your only manual step is moving an application card to **Approved** — GHL does the rest.

---

## Keep the standalone portal too
Even after migrating, the standalone version is a great **public preview** or backup. No
harm in keeping both — they share the same content source.
