# SME Payroll Cloudflare Multi-User Build

This folder is a Cloudflare-ready build for moving SME Payroll from a local browser-only app to a real cloud-backed multi-user app.

## What Is Included

- `worker.js`: Cloudflare Worker API.
- `schema.sql`: Cloudflare D1 database schema.
- `public/`: Cloud-ready SME Payroll frontend.
- `wrangler.toml`: Worker configuration template.
- `package.json`: Wrangler scripts.

## Features Built

- User sign-up and sign-in.
- 30-day free trial.
- Subscription plans:
  - Single user monthly: $10
  - Single user yearly: $100
  - Multiple users monthly: $20
  - Multiple users yearly: $200
- Business accounts.
- Business memberships.
- Invite-user function.
- Invite acceptance.
- Role permissions:
  - `owner`: full access.
  - `admin`: invite users and manage payroll.
  - `payroll_officer`: manage staff, PPE periods, time entries and payslips.
  - `viewer`: read-only access.
- Payroll periods with start date and PPE date.
- Staff records.
- Time entries.
- Payslip generation records.
- Subscription status table.
- PayPal webhook placeholder for payment verification.

## Cloudflare Setup Steps

1. Install Wrangler on your computer:
   `npm install -g wrangler`

2. Log in to Cloudflare:
   `wrangler login`

3. Create a D1 database:
   `wrangler d1 create sme_payroll`

4. Copy the returned D1 `database_id` into `wrangler.toml`.

5. Create the D1 tables:
   `wrangler d1 execute sme_payroll --remote --file=schema.sql`

6. Deploy the Worker:
   `wrangler deploy`

7. In Cloudflare, route the Worker to:
   `www.saufotrading.com/api/*`

8. Upload the `public/` folder with your SAUFO Trading website, or use the prepared SAUFO website package where the cloud app is included under:
   `apps/sme-payroll-cloud/`

9. Open:
   `https://www.saufotrading.com/apps/sme-payroll-cloud/`

## PayPal / Visa Debit Payments

For production payments:

1. Use a PayPal Business account.
2. Change the PayPal business display name to `Saufo Trading`.
3. Create PayPal products/plans for the four subscription plans.
4. Replace the current basic PayPal links with PayPal hosted button IDs or PayPal JavaScript SDK plan IDs.
5. Configure PayPal webhooks to call:
   `https://www.saufotrading.com/api/paypal/webhook`
6. In `worker.js`, complete the webhook verification section before trusting payment events.

This is what prevents users from activating paid access without confirmed payment.

## Important Production Note

This build provides the cloud architecture and API. Before accepting real customers, finish:

- PayPal webhook signature verification.
- Email sending for invitations.
- Password reset flow.
- Admin screen for changing roles and disabling users.
- Full frontend migration of all existing local payroll UI features.
