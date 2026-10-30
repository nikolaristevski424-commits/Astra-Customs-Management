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
  (`assets/banners` contains the dashboard, guidelines, marketplace,
  order, status, tickets, portfolio, prices, applications, infraction, and
  promotion artwork)
- **Roles** — staff, manager, HR, credit manager, payout manager, quality control, ticket staff (comma-separated — a role can be in more than one list)
- **Commission** — `COMMISSION_RATES` maps a role to the % of the after-tax price a designer with that role keeps, e.g.:
  ```
  COMMISSION_RATES=1497420135814791301:75,1497420194807808174:70,1497420310599700560:60,1497420258900709426:50
  ```
  `DEFAULT_COMMISSION_RATE` is used for anyone with none of those roles (0 by default — no configured role means no automatic earning credit).
- **Channels** — every channel the bot posts to (order log, tickets, applications, LOA, honeypot, giveaways, etc.) — right-click a channel → Copy Channel ID (needs Developer Mode on in Discord settings)
- **Roblox** — group ID, universe ID, game pass pool, API key/cookie — see [Payments](#payments) below

## Roblox verification providers (Bloxlink first, RoGoid second)

Set the **two** API keys in Wispbyte's private `.env` and restart:

```env
BLOXLINK_API_KEY=YOUR_EXISTING_BLOXLINK_KEY
ROGOID_API_KEY=YOUR_EXISTING_ROGOID_KEY
```

No extra RoGoid URL or header settings are required. The bot uses the
documented `GET https://api.rogoid.xyz/v1/verifications/:discordId`
with `Authorization: Bearer <ROGOID_API_KEY>`, as described in
[RoGoid API docs](https://docs.rogoid.xyz/api/verifications/).
The API key is server-specific, read-only for this endpoint and subject to
RoGoid's published rate limit of 60 requests/minute per server.
Keep secrets in Wispbyte, never in GitHub.

**Important limitation:** RoGoid only documents a **Discord ID -> Roblox ID**
verification lookup. There is no documented Roblox ID -> Discord ID route.
The bot therefore checks buyers as follows:

1. Check Bloxlink's Roblox -> Discord lookup first.
2. If it finds nobody **and** the payment has a known reserved Discord customer,
   get that member's RoGoid verification by Discord ID.
3. Accept the RoGoid fallback only if its verified Roblox ID equals the
   actual Roblox buyer ID on the sale. A mismatch/404/network error or an
   unknown Discord customer requires manual review; never auto-deliver an order
   or credit an unknown buyer.
4. If Bloxlink returns an identity that conflicts with the reserved customer,
   do not silently replace it with RoGoid; require review.

`/health` shows whether the RoGoid key is set, but does not test it live.
Previously documented `ROGOID_ROBLOX_TO_DISCORD_URL`,
`ROGOID_DISCORD_TO_ROBLOX_URL`, `ROGOID_AUTH_HEADER`, and
`ROGOID_AUTH_SCHEME` settings are **no longer used** and may be removed
from your `.env`.

## Custom-emoji ticket dropdowns and connection health

Use `/panel tickets` after updating the bot. The panel now has a single
select menu with **Support Ticket**, **Management Ticket**, and **Report a User**,
each with the Astra Customs custom emoji
`<:ticketsupportroleicon:1559204224556863521>`.
The same ticket menu appears in the order, order-status and portfolio panels.
The opening order embed also displays a prominent short **Order ID** (`#1`,
`#2`, etc.) that matches the sales ledger. Staff can link a Roblox purchase
with `/payment request price:<Robux> order_id:<order number>`; when linked,
the purchase log shows that ID. Both the storefront order form and the
older `order_open_modal` form now create these real numbered ledger records.
Existing older ticket buttons continue working for compatibility.
A newly posted panel does not automatically delete previous messages; remove
old posts manually if you do not want duplicate panels.

`/health` is a **configuration/status summary**: "configured" means an
environment variable is present, not that the provider accepted it.
A manager can run `/health test_credentials:true` to perform **read-only**
GET checks and distinguish:
- Roblox cookie accepted or rejected, using Roblox's authenticated-user endpoint
- Bloxlink verified account found, account not linked, access denied, or API error
- RoGoid verified account found, not verified (404), invalid key (401), forbidden
  (403), rate limited (429), or unavailable
The checks are private, management-only, throttled per server to one run per
minute, and never print the configured credentials. The API key
`ROBLOX_API_KEY` is listed separately but is not live-tested by this command.
A valid cookie login does **not** guarantee group-finance permissions or payout
ability; valid verification lookup does **not** guarantee a completed purchase.
RoGoid's endpoint is built in (`https://api.rogoid.xyz/v1/verifications/:discordId`).
For RoGoid purchases, the bot checks Bloxlink first and falls back to comparing
the reserved customer's RoGoid-verified Roblox ID with the reported buyer.

## Independent orders, help tickets, and LOA access

Each member may have up to **3 simultaneously open help tickets** across
Support, Management, and Report a User, combined. Orders are tracked
separately and **do not count** toward the three-ticket allowance.
The order flow continues to allow one active order per member.
The cap is hardcoded (`MAX_OPEN_TICKETS=3`) and double-checked when
the record is created to prevent concurrent submissions bypassing it.

Users with any of these role IDs can run `/loa request` even if they are
not included in `STAFF_ROLE_IDS`: `1497420088456777859`,
`1565198911662985336`, `1565689738906574940`,
`1497415634915561603`. Existing staff/admin access remains.

## Private management and report tickets

Use `/panel tickets` to post a ticket panel with three buttons:
Support Ticket, Management Ticket, and Report a User.

Management and Report tickets open under Discord category `1565467577415639182`.
They use private permission overwrites; normal support tickets are unchanged.
Management reviewers use the configured manager/executive/ownership roles.
Reports can be seen and pinged by these role IDs only:
`1538963485667500144`, `1565167658377158777`,
and `1565198911662985336` (plus the opener and founder).

Closing a management ticket uploads its transcript to `1531632265812119552`.
Closing a report ticket uploads its transcript to `1531632326834913322`.
These confidential transcripts are **never sent to the generic support transcript channel**.
If the bot cannot post a confidential transcript, the ticket is kept open
so it can be retried after permissions are fixed. The bot needs View Channel,
Manage Channels, Send Messages, Embed Links and Read Message History as appropriate.
The report ping roles must be mentionable or the bot must have permission to mention them.

## Partnership Team tracking

The `/partnership` command now also accepts the configured Partnership Team
role(s), set using `PARTNERSHIP_TEAM_ROLE_ID` in Wispbyte.
Each successfully posted unique invite counts once toward the posting user's ledger
at **20 Robux per partnership**. Reposting the same invite does not add commission.
Counts and totals are stored in the bot's persistent `data` directory:

- `/partnership-stats mine` — personal counts and accrued amount
- `/partnership-stats user` — manager view of one team member
- `/partnership-stats leaderboard` — manager team totals

No automatic Robux is sent. Review completed partnerships before paying the
accumulated amounts; these totals are not proof that Robux has already been paid.
Historical partnerships from before this feature are not automatically backfilled.

## Demotion infraction

`/infract issue` includes **Demotion** as a punishment type in the normal HR log.
It posts and retains the infraction like other punishment types.
It **does not automatically remove or change Discord rank roles**; leadership must
make any role changes separately.

## Astra Customs-only server access

This is a private bot restricted to the official Astra Customs Discord guild `1488378242846036070`.
Slash commands, old message buttons/modals, purchase monitoring, and scheduled staff automation
are disabled in every other guild, even if the bot is still physically installed there.

Use `/servers list` inside Astra Customs to privately see its connected guilds and their IDs.
Only Discord user `1255248600850497568` can use `/server leave server_id:<ID> confirm:true`
(or the plural alias `/servers leave`) to remove the bot from another guild.
The official Astra Customs guild cannot be removed with these commands.

Wispbyte option `AUTO_LEAVE_OTHER_GUILDS=0` (default) keeps other guilds connected
but blocked until removed manually. Set `AUTO_LEAVE_OTHER_GUILDS=1` and restart
to make the bot automatically leave all other guilds and reject future joins.
Changing this setting does not authorize anyone to use `/server leave`.

## Payout calculation

Designers submit `/payout request total_price:<gross customer price>`, their Roblox name,
the original payment URL, and the customer's Discord username.
The bot applies a 30% Roblox deduction, floors to whole Robux, then pays the
highest matching configured designer role percentage (80%, 85%, 90%, or 95%)
of the after-tax amount, also rounded down. The saved review embeds show
the gross price, tax, after-tax proceeds, matched role/rate, and payout.

`COMMISSION_RATES=1497420258900709426:80,1497420310599700560:85,1497420194807808174:90,1497420135814791301:95`

These are *estimates based on entered purchase prices*, not evidence of payment.
Management must confirm the transaction, buyer, and actual net Robux before paying.
Old pending payout requests keep their existing payout amount and remain readable.

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
`/earnings` round out the ledger.

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

Staff can use `/payment link check` with an asset type, asset ID, and Roblox
username to verify ownership before sending a payment link. If the user owns
the item, the bot returns the matching Game Pass or catalog purchase link. If
the inventory is private, the username cannot be found, or the item is not
owned, no payment link is sent. `/payment link get` retrieves a configured
pool Game Pass link without changing its price.

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
- `/package create` — name, price, description, up to 5 photos, and up to 5 delivery files → saved as a draft
- `/package request` — submit your draft for approval (posts to `PACKAGE_REVIEW_CHANNEL_ID` with Approve/Deny/Edit Price buttons)
- `/package setprice` — change the price of **any** package, any time — executive team only
- `/package list` / `/package view` — browse
- `/package collect` — canned pickup instructions for a purchased package

To automate delivery, create a payment link with `/payment request`, choose the
approved `package_id`, and optionally choose the Discord `customer`. When the
configured Roblox purchase monitor sees that exact payment Game Pass sold, it
DMs the package files automatically. The buyer must either be selected as the
customer when the link is created or be linked through Bloxlink. When Bloxlink
cannot find a match, RoGoid can verify a **selected Discord customer** by
checking that the customer's verified Roblox ID matches the actual buyer.
Otherwise, the purchase is logged for manual delivery.

## Store credit

`/credit add|remove` (with an optional reason, logged for `/credit
history`), `/credit view`, `/credit history`, and `/credit
leaderboard`. If `AUTO_CREDIT_PERCENT` is set above 0, every detected
group purchase automatically awards that percentage of the sale as
store credit to the buyer's verified Discord account (Bloxlink or an
order-linked RoGoid match) — a
simple built-in loyalty/rewards program.

`/economy balance|daily|work|pay|coinflip|leaderboard` is a separate virtual
Astra Coins system for fun. Astra Coins have no Robux value and cannot be used
as store credit.

## Discounts

Executives can create automatic discount codes with `/discounts create` by
choosing a percentage or fixed Robux reduction, a UTC expiry date, and a total
usage limit. Members can view active codes with `/discounts list` and preview
and redeem one with `/discounts redeem`. `/payment request` accepts an optional
`discount_code`; when valid, the bot lowers the Roblox game-pass price, sends
the discounted payment link, and records the use automatically after Roblox
accepts the price update. Each member can redeem a code once.

## Bundles

Packages and bundles use one shared review destination. Set
`PACKAGE_BUNDLE_CHANNEL_ID` to a Discord **Forum channel** (recommended) or
regular text channel. `/package request` and `/bundle request` each create a
new thread there and put the approval embed/buttons in that thread. Managers
can Approve or Deny from the thread. The older `BUNDLE_REVIEW_CHANNEL_ID` and
`PACKAGE_REVIEW_CHANNEL_ID` values remain fallback options for existing setups;
`BUNDLE_THREAD_ID` is no longer used.

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

`/panel tickets` (or the `-tickets` shortcut) posts the support
panel; clicking **Help** opens a modal and creates a private ticket
channel. Claiming and closing a ticket is restricted to
`TICKET_STAFF_ROLE_IDS` — set this to a dedicated ticket-support role
if you want it separate from general `STAFF_ROLE_IDS` (leave it blank
to just use `STAFF_ROLE_IDS`). The ticket opener and invited members can
also manage its close request. Use `/close request` to post a public
request with **Close Ticket Now** and **Keep Ticket Open** buttons. If no
one responds within 24 hours, the ticket closes automatically. A closing
ticket gets a complete text transcript (including attachments) in
`TRANSCRIPT_CHANNEL_ID` when configured and a transcript DM to its opener
before the channel is deleted. `/add user:<member>` grants a member
private access to that ticket.

## Payout requests

`/payout request` is available to administrators and members with the
`PAYOUT_REQUESTER_ROLE_IDS` role. The default requester role is
`1497420088456777859`; change the comma-separated environment value to
customize it. Reviewing, denying, and auto-sending requests remain
restricted to the executive team. A reviewer must include a reason when marking
a request Paid or Denied. The request embed turns green when paid and red when
denied, and the requester receives a decision DM with the same status and reason.

## Activity checks

`/activity check` snapshots the selected role's members when posted.
Members have 24 hours to click the response button; after the deadline,
any snapshot members who did not respond receive a **Notice** infraction.
The activity panel displays a relative Discord timestamp for when those
Notices are due. Each Notice is announced with a separate user mention in
the configured infractions channel, followed by its infraction panel.

HR can issue an infraction with `/infract issue`. Choose whether the
issuer should be shown or the infraction should be anonymous; the issuer
is still retained in the internal infraction record for audit purposes.
Manual and activity-check infractions ping the affected member in a
separate message outside the Components V2 infraction panel.
The infraction panel shows its active status and is updated with a yellow void
notice when the infraction is voided. `/promote issue` publishes a green
promotion announcement; `/promote void` retains the record in the audit history
and updates its announcement in red, including the optional void reason.

## Applications

The applications panel shows availability for **Customer Support** (staff)
and **Creative Team** (designer). Staff can run
`/application status application:<application> status:<open|delayed|closed>`
to control either application. Closed applications have a disabled panel
button, and both opening a form and submitting it check the current status.
Changing the status refreshes the last applications panel posted by the bot.
The panel buttons open tailored five-question forms and post results to
`APPLICATIONS_CHANNEL_ID`. Reviewers are pinged using
`APPLICATION_REVIEWER_ROLE_ID` (comma-separated for multiple roles); only
those roles (or an administrator) can Accept/Deny. Accepted applicants
receive the matching role from `STAFF_APPLICATION_ACCEPT_ROLE_ID` or
`DESIGNER_APPLICATION_ACCEPT_ROLE_ID`.
Reviewers must provide a reason when accepting or denying. The application
submission, result-channel notice, and applicant DM show the decision in green
or red and include that reason. Every submission receives a confirmation DM,
and decisions are copied to `APPLICATION_RESULTS_CHANNEL_ID` when configured. The
dashboard also has a **Request LOA** button (same as `/loa request`, just as a
modal instead of typing dates as command options).

The purchase monitor polls Roblox group transactions at a controlled rate.
Transient Roblox HTTP 5xx responses are logged as upstream failures and retried
with exponential backoff; the backoff state is persisted so restarts do not
reset the retry delay.

## Guidelines and advertising

`/panel guidelines` posts the complete server guidelines and provides buttons
for the guidelines, order regulations, and careers information. `/ad` posts a
branded Astra Customs advertisement with buttons for ordering, staff and
designer applications, and joining the Discord. `/ad` is restricted to staff.

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
`/addstaff`, `/affiliate`, `/status`, `/text edit`, `/panel
dashboard|prices|tickets|portfolio|guidelines|order-status|affiliations|honeypot`, prefix shortcuts (`-dashboard`,
`-pricelist`, etc. — staff only, deletes the trigger message), a
honeypot trap channel (auto-softban), `/help`, `/ping`.

Any command that mainly produces a public embed/panel (pricelist, tax,

All `/panel` publishing commands are restricted to configured executives (or
Discord administrators). Configure `EXECUTIVE_ROLE_IDS` or
`EXECUTIVE_USER_IDS` in `.env`.
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

**Purchase monitoring** checks each unique configured group at most once
per minute, requests only the 100 newest transactions, and backs off on
Roblox rate limits. It needs `ROBLOX_COOKIE` and `ROBLOX_GROUP_ID` set,
plus `PURCHASE_LOG_CHANNEL_ID`. The transaction watermark is persisted so
restarts do not replay sales already processed; it does not replay the
group's existing transaction history when first enabled.

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
