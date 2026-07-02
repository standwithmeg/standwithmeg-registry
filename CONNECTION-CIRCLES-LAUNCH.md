# Connection Circles — Launch Checklist (Meg's copy)

The feature is fully built and already live (hidden) at my.standwithmeg.com/connect.
It needs Stripe (NOT Square — Square stays for sponsor contracts) + 6 settings in Vercel.
Pricing already built into the site: **$6/month or $50/year**, same for sponsoring a family.

⚠️ Golden rule: the Secret key and Signing secret get pasted ONLY into Vercel.
Never email, text, or screenshot them. If one ever leaks, roll it in Stripe immediately.

---

## A. Stripe account — one time (~5 min + their verification)

1. Go to **stripe.com** → Sign up with founder@standwithmeg.com (or sign in if you already have one).
2. Business name: Stand With Meg. Complete **"Activate payments"** — business type, EIN or SSN, and the bank account for payouts (same info Square asked you for).

## B. Create the two products (~5 min)

In Stripe: **Product catalog → + Add product**

**Product 1 — name it: `Connection Circles Membership`**
- Price 1: `$6.00` · Recurring · **Monthly** → Save → copy its **price ID** (starts with `price_`)
- On the product page click **+ Add another price**: `$50.00` · Recurring · **Yearly** → copy its price ID

**Product 2 — name it: `Connection Circles — Sponsored Membership`**
- Price 1: `$6.00` · Recurring · **Monthly** → copy price ID
- Price 2: `$50.00` · Recurring · **Yearly** → copy price ID

Keep a note open and label all four as you copy them:
```
member monthly  = price_________
member yearly   = price_________
sponsor monthly = price_________
sponsor yearly  = price_________
```

## C. Key + webhook (~3 min)

1. **Developers → API keys** → reveal and copy the **Secret key** (`sk_live_...`).
2. **Developers → Webhooks → + Add endpoint**
   - Endpoint URL: `https://my.standwithmeg.com/api/connect/stripe/webhook`
   - Select events: **checkout.session.completed**, **invoice.payment_succeeded**, AND **customer.subscription.deleted** (renewals extend access; cancellations revoke access)
   - Add endpoint → copy the **Signing secret** (`whsec_...`).

## D. Vercel (~5 min)

vercel.com → the **standwithmeg-registry** project → **Settings → Environment Variables**.
Add these six (environment: **Production**), names typed EXACTLY:

| Name | Value |
|---|---|
| `STRIPE_SECRET_KEY` | sk_live_... |
| `STRIPE_WEBHOOK_SECRET` | whsec_... |
| `STRIPE_CONNECT_MONTHLY_PRICE_ID` | price ID for member $6/mo |
| `STRIPE_CONNECT_ANNUAL_PRICE_ID` | price ID for member $50/yr |
| `STRIPE_CONNECT_SPONSOR_MONTH_PRICE_ID` | price ID for sponsor $6/mo |
| `STRIPE_CONNECT_SPONSOR_YEAR_PRICE_ID` | price ID for sponsor $50/yr |

While you're in Vercel env vars, also CONFIRM these already exist (used for the circle emails — they should be there from other features; add them from your records if missing): `GOOGLE_SMTP_USER`, `GOOGLE_SMTP_PASSWORD`, `GOOGLE_SMTP_FROM`.

Then: **Deployments → ⋯ on the newest deployment → Redeploy** (env vars only load on a fresh deploy).

## E. Tell Claude "Stripe is in" — Claude's part (same day)

- Add the **Connect** link to the site navigation
- Add the **"Connect with other families who named this actor"** button on every court actor page (the high-converting placement)
- Test end to end before any family touches it: hardship (free) path, a real $6 checkout (then refund it in Stripe), webhook firing, match emails
- Then announce: the social pipeline + Arthur Yon's reply are already teed up

## Why Stripe and not your Square

The entire checkout/webhook code was built on Stripe's subscription system. Pointing it
at Square would mean rewriting the payment layer — days of work vs. 15 minutes of setup.
Square keeps doing sponsor agreements; Stripe runs Circles memberships. Two registers,
one business.
