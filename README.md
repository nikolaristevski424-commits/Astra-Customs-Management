# Design Shop Bot

An all-in-one Discord bot for running a Roblox design/commission shop:
a job queue designers can claim, sales/payment tracking, tickets, HR
(infractions/promotions/LOA), Robux game-pass payments with auto price
management, group payout requests, a package catalog, store credit,
watermarking, a tax calculator, giveaways, and styled dashboard panels.

**Configuration lives entirely in `.env`.** There's no in-Discord
setup wizard — fill out `.env` once, deploy commands, and it's ready.
Everything else is stored in local JSON files under `/data` (no
database server needed).

## 1. Install

```bash
npm install
cp .env.example .env
```

Now open `.env` and fill it out. It's long but every line is
commented — work through it section by section:

- **Discord** — `BOT_TOKEN`, `CLIENT_ID`, `GUILD_ID` (required)
- **Executive team** — `EXECUTIVE_ROLE_IDS` / `EXECUTIVE_USER_IDS`, for approving payouts and `/package setprice` (see below — deliberately env-only)
- **Branding** — brand name, colors, banner/footer images, prefix
- **Roles** — staff, manager, HR, credit manager, payout manager, quality control, ticket staff (comma-separated — a role can be in more than one list)
- **Commission** — `COMMISSION_RATES` maps a role to the % of the after-tax price a designer with that role keeps, e.g.:
  ```
  COMMISSION_RATES=1497420135814791301:75,1497420194807808174:70,1497420310599700560:60,1497420258900709426:50
  ```
  `DEFAULT_COMMISSION_RATE` is used for anyone with none of those roles (0 by default — no configured role means no automatic earning credit).
- **Channels** — every channel the bot posts to (order log, tickets, applications, LOA, honeypot, giveaways, etc.) — right-click a channel → Copy Channel ID (needs Developer Mode on in Discord settings)
- **Roblox** — group ID, universe ID, game pass pool, API key/cookie — see [Payments](#payments) below

## 2. Deploy slash commands

```bash
npm run deploy          # to GUILD_ID, appears instantly — use this while testing
npm run deploy:global   # to all servers, can take up to an hour to show up
```

Run this again any time you add or change a command.

## 3. Run it

```bash
npm start
```

That's the whole setup. If you need to change something later, edit
`.env` and restart the bot.

## Executive team (env-only, on purpose)

Approving/paying a `/payout request` (the Mark Paid, Deny, and Try
Auto-Send buttons) and `/package setprice` are gated on
`EXECUTIVE_ROLE_IDS` / `EXECUTIVE_USER_IDS` in `.env` — the one thing
that's intentionally *not* configurable via any Discord command.
Money-moving actions shouldn't be grantable by anyone with access to
change bot config in Discord; only whoever controls the hosting
environment can add someone to the executive list.

## The job queue (`/order add` / `/order list`)

Supervisors post work with `/order add`: order type, quantity (how many
designers/copies are needed), which designer role it's for, notes, and
up to 5 reference images. This announces the job (pinging the designer
role) and creates that many independently-claimable **instances** —
e.g. quantity 5 means 5 different designers can each claim one copy of
the same job.

Designers browse open instances with `/order list` (one card per
instance) and click:
- **Send Images** — reveals the reference images attached at creation
- **Request** — claims it. Only members with the job's designer role can
  request it. This posts to `ORDER_REQUESTS_CHANNEL_ID` where a
  supervisor clicks **Accept** (assigns the designer) or **Deny**
  (reopens it).
- **Delete** — removes that instance (staff or whoever posted the job).

This is a separate system from `/order log|status|update|view|history|reset`,
which is the money/tax sales ledger below.

## Sales ledger & commission

`/order log` — log a completed sale (customer, product, price with
tax). It computes the designer's earning using `COMMISSION_RATES`:
whichever of the logging staff member's roles has the highest
configured rate determines what % of the after-tax price they keep.
The dashboard's **Order Now** button opens a form and creates a private order
channel under `ORDER_CATEGORY_ID`. Customers can provide the product, deadline,
budget, details, and references directly in that channel. `/order status` checks
an order's current status for any user. `/order update` sets Paid/Void/etc. for
staff and refreshes the original order-log message. `/order view`, `/order history`, `/order reset`, and
`/earnings` round out the ledger. `/paymentrequest` is a richer
version of the same idea matching a payment-link-style workflow
(payment link, Roblox usernames, price breakdown, Paid/Decline).

## Payments

`/payment request price:<amount>` auto-picks whichever game pass from
your `PAYMENT_GAMEPASS_IDS` pool isn't currently reserved, sets its
price via Roblox's official Open Cloud API, reserves it, and hands back
both the payment link **and** the game's join link (if `GAME_PLACE_ID`
is set) — useful because buyers under 13 sometimes can't use a direct
purchase link and need to join the experience and buy it in-game
instead. No founder rank needs to touch anything. A reservation
auto-expires after 6 hours so an abandoned order doesn't permanently
lock a slot; `/payment release` frees one up early, and `/payment
pool` shows the status of every configured slot.

## Payouts

Rather than fully automating group payouts (see the honest limitation
below on why that's unreliable), `/payout` is a **request queue**:
anyone runs `/payout request amount:<> robux_username:<> reason:<>`,
which posts to `PAYOUT_REQUESTS_CHANNEL_ID`. From there an executive
clicks:
- **Mark Paid** — once they've sent the Robux manually on roblox.com
- **Deny**
- **Try Auto-Send** — optional: attempts the same Roblox group-payout
  API call a fully-automated version of this feature would use. If
  Roblox accepts it, the request is marked Paid for you. If Roblox
  demands a security challenge (increasingly common), it says so and
  leaves the request pending for manual handling — nothing is lost or
  silently retried.

`/payout list` (executive-only) shows pending/paid/denied requests at
a glance.

## Packages

A lightweight product-catalog + approval workflow:
- `/package create` — name, price, description, up to 5 photos → saved as a draft
- `/package request` — submit your draft for approval (posts to `PACKAGE_REVIEW_CHANNEL_ID` with Approve/Deny/Edit Price buttons)
- `/package setprice` — change the price of **any** package, any time — executive team only
- `/package list` / `/package view` — browse
- `/package collect` — canned pickup instructions for a purchased package

## Store credit

`/credit add|remove` (with an optional reason, logged for `/credit
history`), `/credit view`, `/credit history`, and `/credit
leaderboard`. If `AUTO_CREDIT_PERCENT` is set above 0, every detected
group purchase automatically awards that percentage of the sale as
store credit to the buyer's linked Discord account (via Bloxlink) — a
simple built-in loyalty/rewards program.

## Bundles

`/bundle request` — bundle type, total after tax, notes → posted for
approval (Approve/Deny, manager+). Approved bundles are automatically
posted into `BUNDLE_THREAD_ID`.

## Portfolio

`/portfolio add|view|remove` for general pieces, plus `/portfolio
profile designer:<user> specialties:<text>` which auto-generates a
showcase panel for that designer (mentions them, lists specialties,
and pulls in any pieces tagged to them).

## Quality control

`/qc submit` — a designer (anyone with a role listed in
`COMMISSION_RATES`) or staff member attaches up to 5 product photos
and posts them to `QC_CHANNEL_ID`, pinging `QC_ROLE_IDS`. It's the
same kind of card as an order/payout request: Accept/Deny buttons,
and the title updates in place to "✅ Accepted" or "❌ Denied" once
reviewed. A discussion thread is created on the message automatically
so QC can ask the designer questions without cluttering the channel.

## Tickets

`/panel type:tickets` (or the `-tickets` shortcut) posts the support
panel; clicking **Help** opens a modal and creates a private ticket
channel. Claiming and closing a ticket is restricted to
`TICKET_STAFF_ROLE_IDS` — set this to a dedicated ticket-support role
if you want it separate from general `STAFF_ROLE_IDS` (leave it blank
to just use `STAFF_ROLE_IDS`). The ticket's own opener can also close
it themselves. Closing posts a transcript to `TRANSCRIPT_CHANNEL_ID`
if set, then deletes the channel.

The same dashboard also has an **Apply** button (Creative Team
application: why you want to join, activity 1-10, design experience,
Roblox username, portfolio link — posted to `APPLICATIONS_CHANNEL_ID`
with Accept/Deny) and a **Request LOA** button (same as `/loa
request`, just as a modal instead of typing dates as command options).

## Fun

- `/release` — post a free download (a PSD, a template, whatever) that
  stays locked behind a reaction goal. Members click **React**; once
  enough unique people have clicked, the bot reveals "🎉 Goal
  reached!" and re-posts the file as a fresh attachment.
- `/giveaway start` — prize, duration (`30m`, `2h`, `1d`), winner
  count. People click **Enter**; when the timer runs out the bot
  auto-picks winner(s) and announces them. `/giveaway reroll` picks
  new winners after the fact. Optionally make it a **sponsored
  giveaway**: `sponsor` (name) + `sponsor_invite` (a `discord.gg` link)
  adds sponsor credit to the embed and a "Join {Sponsor}" button. You
  can also have the announcement `ping` a specific role, `@here`, or
  `@everyone` — the two broad pings require a manager role, to keep
  giveaways from being able to spam the whole server.
- `/fact` — a random fun fact.
- `/wanted` — generates a "WANTED" poster image for yourself or
  someone else, with an optional reward amount.
- `/reverse` — flips any text backwards.
- `/8ball` — ask the magic 8-ball a question.
- `/coinflip` — heads or tails.
- `/roll` — dice roller, e.g. `2d6` or `d20`.
- `/rps` — rock-paper-scissors against the bot.
- `/ship` — a compatibility score between two people (same pair always gets the same score).
- `/wouldyourather` — a random would-you-rather prompt.
- `/avatar` — full-size avatar of yourself or someone else.

## Everything else

`/tax` (Roblox's 30% marketplace tax, both directions), `/pricelist`,
`/quote` (interactive calculator), `/watermark` (faded tiled brand
text by default), `/infract`, `/promote`, `/logs`, `/loa`,
`/addstaff`, `/affiliate`, `/service`, `/text edit`, `/panel
type:<...>` (dashboard/guidelines/order-status/tickets/pricelist/
portfolio/affiliations/honeypot), prefix shortcuts (`-dashboard`,
`-pricelist`, etc. — staff only, deletes the trigger message), a
honeypot trap channel (auto-softban), `/help`, `/ping`.

Any command that mainly produces a public embed/panel (pricelist, tax,
portfolio, panels, prefix shortcuts) deletes the triggering
command/message and posts the result as a normal channel message — no
"used /command" line left behind.

## Privacy defaults

A few things are deliberately locked down and ephemeral by default,
even though nothing explicitly asked for it: `/earnings` and `/credit
view|history` only show your own numbers unless you're a
manager/payout-manager/credit-manager — financial info shouldn't be
world-readable by default. `/package list|view` only shows drafts and
pending submissions to staff; customers only ever see `approved`
packages. Autocomplete on `/payment` won't suggest anything to
non-managers, since the suggestions themselves (gamepass IDs,
reservation notes) are internal info.

## Honest limitations — please read

**Payouts.** "Try Auto-Send" calls Roblox's documented
`POST /v1/groups/{groupId}/payouts` endpoint with a cookie + CSRF
token — the same thing the Roblox website does. As of 2026, Roblox
increasingly requires an interactive security challenge (2FA / "chef"
challenge) on this endpoint, even with a valid cookie, and this bot
**does not** attempt to solve or bypass that challenge. That's exactly
why `/payout` is a request queue rather than a fully-automated send:
when auto-send fails (which, currently, is often), the request just
sits there as **Pending** for someone to pay manually on roblox.com
and click **Mark Paid** — nothing is lost, nothing silently retries.
Test auto-send with a small amount first if you want to try it at all.

**`/payment request` (game pass pricing).** Uses Roblox's official
Open Cloud game-passes API, which supports either an Open Cloud API
key (recommended, scope it narrowly) or a cookie. This one isn't
subject to the same 2FA-challenge issue as payouts.

**Purchase monitoring** polls the group's transaction feed every 30
seconds using `noblox.js` — needs `ROBLOX_COOKIE` and `ROBLOX_GROUP_ID`
set, plus `PURCHASE_LOG_CHANNEL_ID`. It does not replay a group's full
sales history the first time it runs.

**Everything is stored in flat JSON files** under `/data`, one file
per data type, keyed by server ID. Fine for a single shop's scale;
back that folder up periodically.

## Project layout

```
commands/    one file per slash command (data + execute + optional autocomplete)
events/      Discord.js event handlers (ready, interactionCreate, messageCreate, guildMemberAdd)
services/    background loops (purchase monitor, LOA auto-expiry, giveaway scheduler)
utils/       storage, config, permissions, and business logic shared across commands
assets/      watermark.png (used only by `/watermark style:logo`)
data/        JSON storage — gitignored, created automatically
```
