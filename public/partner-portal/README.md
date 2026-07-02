# Stand With Meg — Partner Portal

A self-contained partner operations portal your State Partners log into to learn the
job, sell the sponsorship inventory, understand commissions, prepare payout/legal
setup, and submit sponsors cleanly — with progress tracking and downloadable,
print-ready brand designs. Training works as static files; sponsor/prospect
submissions use the live `my.standwithmeg.com` Next API so Meg gets email alerts
and the admin inbox fills automatically.

## What's inside
```
partner-portal/
├── index.html              ← login screen (start here)
├── portal.html             ← the training app
├── styles/                 ← design tokens + styling
├── scripts/                ← auth, progress, calculator, packet-submit logic
├── content/lessons.js      ← ALL portal modules and approved copy
├── brand-kit/*             ← print/social assets partners download
├── DEPLOY-GUIDE.md         ← put it online free in ~5 minutes
└── GHL-MIGRATION-GUIDE.md  ← move to real per-partner logins later
```

## The 3 things you'll ever change
1. **Access code** — `scripts/auth.js`, line with `ACCESS_CODE`. Give this code to approved partners. Change it anytime to cut off old access.
2. **Portal copy** — `content/lessons.js`. Plain HTML. `[State]`, `[STATE_CODE]`, `[STATE_PDF]`, and `[Your Name]` auto-fill per partner.
3. **Brand designs** — `brand-kit/*.svg`. Open in any browser; edit text in any code editor or re-make in Canva.

## How partners use it
1. You send them the link + the access code.
2. They enter their **name + state + code** → everything personalizes to their state.
3. They work through **11 modules**; progress saves on their device.
4. They use the portal to save prospects, submit sponsor packets, and copy payout setup.
5. They download the brand kit (logos, flyer, business card, social posts) from Module 10.

## Admin dashboard
Open `admin.html` for Meg's daily sponsor and commission tracker:

```text
/partner-portal/admin.html
```

Set the private admin code in Vercel as `PARTNER_PORTAL_ADMIN_CODE`, then use
that code on this screen. Do not put the real admin code in this public folder.

The admin dashboard has two parts:

- **Remote inbox / prospect pipeline**: partner prospect and sponsor submissions
  saved through `/api/partner-portal/submissions`.
- **Local daily ledger**: Square contract / subscription links, sponsor-payment
  confirmations, commission status, CSV export, and JSON backups.

It does **not** send money or store sensitive payout data.

## Server requirements for automatic email + admin sync
The live repo needs:

- Supabase migration `037_partner_portal_records.sql` applied.
- `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` configured.
- Gmail SMTP environment variables configured: `GOOGLE_SMTP_USER`,
  `GOOGLE_SMTP_PASSWORD`, and optional `GOOGLE_SMTP_FROM`.
- Required private admin code for inbox reads/updates: `PARTNER_PORTAL_ADMIN_CODE`.

If the API cannot save to Supabase, the partner portal still attempts to email
Meg and tells the partner that the admin save needs the database migration.

## Try it locally
Double-click `index.html`. Log in with any name/state and the access code
(`OKFAMILIES2026` by default). That's it.

> Note: the login is a **soft gate** for non-sensitive training content — good enough to
> keep it private. For real per-partner accounts and completion reports, see
> `GHL-MIGRATION-GUIDE.md`.

## Compliance note
The portal intentionally does **not** collect bank accounts, SSNs, EIN documents,
W-9 files, or payment card details. Partners prepare a non-sensitive payout packet
inside the portal, then complete tax and banking setup through the secure payout
workflow you choose.
