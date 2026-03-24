This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

### Admin → Tokens

The **Tokens** admin page (`/admin/tokens`) lists and generates physical claim tokens. The `beatcoin_tokens` table uses RLS without anon read access, so those APIs use the **Supabase service role** on the server only.

Add to your environment (never expose this key to the browser):

```bash
SUPABASE_SERVICE_ROLE_KEY=your_service_role_secret
```

Use the same `NEXT_PUBLIC_SUPABASE_URL` as the rest of the app.

### Event currency (reward unit)

Guest-facing missions, leaderboard, and claim flows show a configurable **event reward unit** (name + icon assets), not generic “points”. Config is stored in **`app_settings`** under key **`reward_unit`** (JSON: `name`, `short_label`, `icon_main_url`, `icon_alt_urls`). In admin settings, icons are uploaded via file pickers (PNG/WEBP) and stored in Supabase Storage (`mission-submissions/reward-unit-icons/*`).

Run `supabase/schema/reward_unit_settings.sql` in the Supabase SQL Editor if that key is missing. Edit branding at **`/admin/settings`**.

**Team / rank emblems (future):** Types and placeholder UI live in `lib/guest-emblem-config.ts`. Optional per-event URLs can later be stored under **`app_settings`** key **`guest_emblems`** (see `GuestEmblemsSettingsValue` in that file); the mission overlay accepts optional `hudEmblems` props when wiring uploads.

### Reliability hardening (event bursts)

For safer concurrent mission submissions and token resets, run:

- `supabase/schema/mission_submission_hardening.sql`
- `supabase/schema/beatcoin_token_reset_rpc.sql`
- `supabase/schema/reset_archive_recovery.sql`

These add idempotency + locking for mission submit writes and an atomic token reset RPC.

### Recovery / reversible reset

Admin reset/recovery operations are batch-archived and restorable:

- Reset endpoint: `POST /api/admin/recovery/reset`
- Restore endpoint: `POST /api/admin/recovery/restore`
- History endpoint: `GET /api/admin/recovery/batches`
- Admin UI: `/admin/recovery`

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
