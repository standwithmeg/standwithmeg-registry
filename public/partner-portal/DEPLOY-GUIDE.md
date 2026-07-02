# Put the Portal Online

The portal now lives best inside the live `my.standwithmeg.com` app because
sponsor/prospect submissions need the Next API to email Meg and feed the admin
inbox.

---

## Live app deployment checklist

Use this when the folder is copied into:

```text
/Users/meghannmiller/Code/standwithmeg-court-actor-fresh/public/partner-portal
```

1. Commit and push the portal/API changes to the live repo.
2. In Vercel, set these environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GOOGLE_SMTP_USER`
   - `GOOGLE_SMTP_PASSWORD`
   - `GOOGLE_SMTP_FROM` (optional, but recommended)
   - `PARTNER_PORTAL_ADMIN_CODE` (required for admin inbox reads/updates)
3. In Supabase SQL Editor, run:

```sql
-- copy/paste the contents of:
-- supabase/migrations/037_partner_portal_records.sql
```

4. Open:

```text
https://my.standwithmeg.com/partner-portal/admin.html
```

5. Enter the private `PARTNER_PORTAL_ADMIN_CODE`.
6. Submit one test prospect from:

```text
https://my.standwithmeg.com/partner-portal/portal.html
```

7. Confirm:
   - Meg receives the email.
   - The record appears in the admin Submission Inbox or Prospect Pipeline.
   - The record can be moved through pipeline stages.
   - An approved sponsor can be converted into the local Square/payment ledger.

If the new Supabase migration has not been applied yet, the API temporarily
stores partner portal records in the existing `sponsor_inquiries` table with a
`[PARTNER_PORTAL_RECORD]` marker. That keeps submissions recoverable, but the
proper long-term table is still `partner_portal_records`.

---

## Standalone static hosting

Only use this if you want training pages without automatic email/admin sync.
Netlify Drop is the easiest static-only option.

---

## Option A — Netlify Drop (easiest, free, recommended)
1. Go to **app.netlify.com/drop**.
2. Drag the whole **`partner-portal`** folder onto the page.
3. Wait ~20 seconds. You get a live link like `random-name.netlify.app`.
4. (Optional) Make a free account to rename it to something like `partners-standwithmeg.netlify.app`.
5. Send that link + your access code to approved partners. Done.

**To update later:** change a file, drag the folder again (or connect it to the GitHub repo for auto-updates).

---

## Option B — Your own subdomain (most professional)
If you want `partners.standwithmeg.com`:
1. Deploy with Netlify (Option A) or Vercel.
2. In your domain/DNS settings, add the subdomain and point it at the host (each host shows the exact record).
3. The host issues HTTPS automatically.

This is the best long-term home and still free.

---

## Option C — Inside GoHighLevel
You already use GHL. You can either:
- **Link out** to the Netlify portal from a GHL page/button (fastest), or
- **Rebuild it natively** in GHL Memberships for real logins and completion tracking —
  see `GHL-MIGRATION-GUIDE.md`.

---

## Before you share it — your 3-minute setup
- [ ] **Set your access code** in `scripts/auth.js` (default is `OKFAMILIES2026`).
- [ ] **Add your contact info** — search `lessons.js` for "team lead" and drop in your name/number, and edit `brand-kit/business-card.svg` placeholders.
- [ ] **Check the links** in Module 8 point to your real report URLs.
- [ ] Open it on your phone to confirm it looks right (it's fully mobile-friendly).

## Keeping it private
- The pages include `noindex` so search engines skip them.
- The access code keeps casual visitors out.
- Rotate the code anytime by editing `auth.js` and redeploying — old code stops working.
