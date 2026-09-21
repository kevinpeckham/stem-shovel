# Billing: what an account costs, the tiers, and the Stripe plan

Two things are decided: every account today is **free for life** (no base
subscription cost, ever), and the first twenty accounts are **founders**
(never charged, unlimited data, every feature). Paid tiers do not exist yet.

**Enforced since v0.30.0** (`src/lib/constants/plans.ts` `PLAN_LIMITS`,
`src/lib/utils/accountLimits.ts`): a free account holds 10 GB of user files
(stems, demos and takes, counting reservations still uploading; renditions
and mixes are not counted) and 5 members of any role. `storageRoom` refuses
the reservation in `/api/stems`, `/api/demos` and `/api/recordings` with a
409 the upload UI shows; `memberHeadroom` refuses a new invitation, an
invitation's acceptance, an invite code's redemption and the sign-up hook. A
founder account has no limits; a system admin raises one account's storage
on `/admin/accounts` (`account.storage_limit_bytes`, null = the plan's).
This document estimates what an account costs us, so the free data limit
and the paid data tiers can be priced, and lays out how Stripe will be wired
in when the time comes. Nothing in the payment section is built.

## 1. What we measured (2026-09-16)

From the shared database (31 ready stems across 10 songs):

| Item                            | Measured                                |
| ------------------------------- | --------------------------------------- |
| Source stem (WAV)               | 37.9 MB average (10–74 MB), 155 s long  |
| WAV rate                        | 274 KB/s (mix of mono and stereo)       |
| AAC playback rendition per stem | 3.07 MB (9.6 % of the source)           |
| Demo (MP3 etc.) + rendition     | 1.4 MB + 1.7 MB                         |
| MIDI file                       | 16 KB                                   |
| Database rows per account       | kilobytes; `notes_json` ≈ 0.5 MB / song |

The sample songs average 2.6 minutes. A full-length song (3¾ min) makes a
stem about **62 MB**, so the "full-length" column below scales everything by
1.6.

## 2. Current rates (fetched 2026-09-16)

**Vercel Blob** (Pro, iad1): storage **$0.023 / GB-month** (monthly average
of the store); Blob Data Transfer **$0.05 / GB** (every download or stream,
hit or miss); Fast Origin Transfer $0.06 / GB on cache misses only; simple
operations $0.40 / million; advanced operations (put, copy, list; multipart
uploads count one per part) $5 / million; deletes free. Client uploads (what
we use) incur no transfer charge. Private and public stores cost the same
to hold; our private files are served by presigned store URLs, not through
a function, so they cost the same to deliver too.

**Turso**: Free $0 (5 GB, 500 M row reads, 10 M row writes / month);
Developer $4.99 / month (9 GB, +$0.75 / GB); Scaler $24.92 / month (24 GB,
+$0.50 / GB). Our rows are tiny; the plan is fixed overhead, not a
per-account cost.

**Vercel Pro**: $20 / month per seat, usage on top. Functions bill Active
CPU (about $0.128 / hour in iad1) and provisioned memory.

**AI Gateway**: Gemini 3 Flash checks cost about a cent each. A Fable chart
draft is ~38 k input + ~11 k output tokens; at Opus-class list prices
($15 / $75 per million) that is **about $1.40 per draft**, by far the most
expensive single action a user can take.

## 3. The model

Kevin's assumptions: an actively used account has **2 projects, each with
10 versions of 12 stems** (240 stems), and for every active account **four
are created and never used**. Lifetime here means five years of retained
data with two years of active use.

### Data held per active account

| Basis                         | Stems | Sources | Renditions | Mixes, demos, MIDI | Total       |
| ----------------------------- | ----- | ------- | ---------- | ------------------ | ----------- |
| Measured (2.6-minute songs)   | 240   | 9.1 GB  | 0.74 GB    | ~0.1 GB            | **~9.9 GB** |
| Full-length (3¾-minute songs) | 240   | 14.9 GB | 1.2 GB     | ~0.15 GB           | **~16 GB**  |

An unused account holds a demo or a test upload at most: ~50 MB.

### Cost per active account

| Line                                | Measured basis | Full-length | Notes                                                                                                |
| ----------------------------------- | -------------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| Storage, 5 years                    | $11.40         | $18.40      | 9.9 GB × $0.023 × 60 months, uploads spread over the first 2 years (≈ 83 % of the full-size average) |
| Delivery, 2 active years            | $2.90          | $4.60       | 40 song plays (12 renditions) + 20 WAV downloads a month ≈ 2.3 GB × $0.05                            |
| Blob operations                     | $0.02          | $0.03       | ~2,500 advanced operations (multipart parts, renditions, mixes)                                      |
| Compute (transcode + transcription) | $0.30          | $0.45       | ~5 CPU-s per stem to transcode; ≤ 200 s per song version to transcribe                               |
| **Subtotal, no AI drafts**          | **≈ $15**      | **≈ $24**   | ≈ $0.25 / month over five years                                                                      |
| AI chart drafts (5 per account)     | +$7            | +$7         | Optional; the one cost worth gating on a tier                                                        |

### Blended per sign-up (1 active : 4 unused)

| Basis       | Per sign-up, 5 years | Per sign-up per month | 1,000 sign-ups per month, steady state |
| ----------- | -------------------- | --------------------- | -------------------------------------- |
| Measured    | ≈ $3.10              | ≈ $0.05               | ≈ $52 / month usage                    |
| Full-length | ≈ $4.90              | ≈ $0.08               | ≈ $82 / month usage                    |

Add fixed overhead of **$25–45 / month** (Vercel Pro seat + Turso Developer
or Scaler) regardless of account count.

### What this says

- **Storage is ~75 % of the cost** and it is the only line that keeps
  costing after the band stops using the account. Everything else is a few
  cents once, or scales with actual use.
- An active account costs about **$3 a year**. A free tier is cheap to
  promise; the risk is the tail, not the average: one account uploading 200
  GB costs $55 a year. That is what the data limit is for.
- **AI drafts are the outlier**: five drafts cost half as much as everything
  else combined. Keep a per-account monthly allowance on the free tier (the
  rate limit today is 5 per user per hour) and count them as a premium
  feature when tiers exist.
- Deleting superseded stem versions is the one lever users have; project
  archiving keeps files, so it does not save anything. A "clean up old
  versions" tool would cut the storage line noticeably.

### Suggested free limit and data tiers (not decided)

At $0.023 / GB-month a limit costs at most:

| Tier          | Cap    | Cost if full  | Suggested price | Margin at cap                                    |
| ------------- | ------ | ------------- | --------------- | ------------------------------------------------ |
| Free for life | 10 GB  | $0.23 / month | $0              | covers the average active account's two projects |
| Data 50       | 50 GB  | $1.15 / month | $5 / month      | ~75 %                                            |
| Data 200      | 200 GB | $4.60 / month | $15 / month     | ~70 %                                            |
| Data 1000     | 1 TB   | $23 / month   | $49 / month     | ~50 %                                            |

Most paying accounts will sit well under their cap, so real margins are
higher. Founders have no cap (`storage_limit_bytes` null).

## 4. What exists in the code today

- `account.plan` (text, only `"free"`; `src/lib/val/AccountPlanSchema.ts`
  is where tiers get added), `account.lifetime_free` (default true),
  `account.is_founder` (default false). Migration 0032 flagged the first
  twenty accounts by `created_at`; `createOwnedAccount` flags a new account
  while fewer than `FOUNDER_SEATS` (20, `src/lib/constants/plans.ts`) exist.
- `account.storage_limit_bytes` (older): null = unlimited, checked when a
  stem upload token is issued. This is the enforcement point for data tiers.
- Super admins grant or revoke founder status from `/admin`: per account on
  Accounts (`manageAccount` actions `founder` / `unfounder`), or per user on
  Users, which sets the flag on every account the user owns (`manageUser`
  actions `founder` / `unfounder`, `setUserFounder`); both need
  `requireSuperAdmin`.
- `PlanBadge.svelte` shows Founder / Free for life / the plan name in account
  settings, on Your accounts, and in the admin list. The user-docs page
  "Accounts and plans" explains the promise.

## 5. Plan for Stripe subscriptions (not built)

### Shape

Stripe Billing, one Stripe **Customer per account** (not per user), paid by
card through **Stripe Checkout**, managed afterwards through the **Customer
Portal** (card changes, cancel, switch tier, invoices). Products are the
data tiers as recurring prices (monthly and yearly); premium-feature tiers
are more prices on the same products later. No custom card forms, no
storing card data.

### Data

Add to `account`: `stripe_customer_id`, `stripe_subscription_id`,
`plan_status` (`active` | `past_due` | `canceled` | `trialing`),
`plan_renews_at`, `plan_price_id`. Keep `plan` as the source of truth the
app reads; Stripe events write it. Derive `storage_limit_bytes` from the
plan on every change (founder → null; free → the free cap; a tier → its
cap), never edit it by hand once tiers exist. A `stripe_event` table
(event id, type, received_at, handled) makes the webhook idempotent.

### Flow

1. **Upgrade** button in account settings (owners only; hidden for founders,
   who never pay; shown to lifetime-free accounts for data tiers only). A
   remote `command` creates a Checkout Session in subscription mode with the
   account's customer (created on first use, `metadata.accountId`), the
   chosen price, `success_url` back to settings with a flag, `cancel_url`
   to settings. The browser is redirected to Stripe.
2. **Webhook** `POST /api/stripe/webhook` (a `+server.ts`, raw body, the
   signature checked with `STRIPE_WEBHOOK_SECRET`, event id recorded before
   handling). Handle `checkout.session.completed`,
   `customer.subscription.created/updated/deleted`,
   `invoice.paid`, `invoice.payment_failed`. Each maps to
   `setAccountPlan(accountId, plan, status, renewsAt)` and an `audit_log`
   row. Unknown events are acknowledged and ignored.
3. **Manage** button opens a Customer Portal session (return URL settings).
   Cancellation keeps the tier until the period ends (`cancel_at_period_end`),
   then the `deleted` event drops the account to free.
4. **Downgrade over the limit**: uploads are refused (the existing token
   check) but nothing is deleted; settings show the usage bar in red with the
   two ways out (upgrade, or delete old stem versions). Never delete data for
   non-payment.
5. **Failed payment**: `past_due` shows a banner to owners for the retry
   window (Stripe's Smart Retries, ~3 weeks); after the subscription is
   canceled by Stripe the account drops to free with the over-limit rule
   above.

### Environment and tooling

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_<TIER>_<INTERVAL>`
in `.env.schema`, values in 1Password / `.env.local` (Kevin adds them; test
mode keys first). Stripe CLI (`stripe listen --forward-to
localhost:5173/api/stripe/webhook`) for local webhooks; the dev and
production databases are shared, so local webhook tests must use a
throwaway account. The `stripe` npm package is ESM-compatible and runs on
Node 24 (server-only import).

### Security

The plan changes only through verified webhooks and super-admin actions,
never from a form value; the Checkout Session's `client_reference_id` and
customer metadata carry the account id and are cross-checked. The webhook
route is exempt from CSRF origin checks (Stripe posts cross-origin) but
protected by the signature; add it to `docs/security.md` when built.
Rate-limit session creation per user.

### Order of work

1. Decide the free cap and the first data tier; set `storage_limit_bytes`
   for free accounts (a script, then the default in `createOwnedAccount`),
   with a usage bar and a warning at 80 % in settings. No Stripe yet.
2. Stripe test mode: customer + Checkout + webhook + `plan_status`;
   Upgrade/Manage buttons; the audit rows; Playwright against the Stripe CLI.
3. Customer Portal, yearly prices, invoices link.
4. Premium-feature gating (AI drafts first), founders exempt.
5. Live keys, a real card, then announce in the user docs and the changelog.
