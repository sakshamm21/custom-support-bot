# Custom Support Bot — End-to-End Build Plan

As of 2026-10-10. Living version (with diagrams): https://claude.ai/code/artifact/c52bcf5c-86ce-4eb2-87da-ff8f72311ddd
This file is the copy coding sessions read. Tick milestones here as they ship.

## Overview

One admin app where you build and run a support bot for each client. Every bot gets the client's context, their data in any format, live actions on their systems and web lookups. It answers on several channels, learns from questions it couldn't answer, and is tested before any change goes live.

**Already built** (13 passing tests):

- Admin with password login; clients with context, model, web search, API tools and widget settings
- Ingestion of PDF, CSV, JSON, Markdown, TXT, HTML and websites; hybrid vector + keyword search
- Chat API, embeddable widget, conversation logs, JSON import/export
- Database live on Supabase (`supabase-gray-ladder`)

**Who uses what:**

| Person | Uses | For |
| --- | --- | --- |
| You and teammates | Admin app | Create bots, add data, test, publish, watch analytics, answer gaps |
| Your clients (optional, Phase 5) | Client portal | See conversations and stats, answer knowledge gaps, approve changes |
| Their customers | Website widget, chat link, WhatsApp, Instagram, Telegram | Get answers and get things done |

**Principles:** one codebase where clients differ only in configuration; nothing goes live without passing its tests; each client's data is isolated; every answer can be traced to its source.

## What every bot can do

Every client bot gets the full feature set below; you switch pieces on or off per bot.

| Area | Feature | What it does | Phase |
| --- | --- | --- | --- |
| Knowledge | Any-format ingestion | PDF (scanned too, via OCR), Word, PowerPoint, Excel, CSV, JSON, HTML, Markdown, images, audio and video (transcribed), websites, YouTube | 2 |
| Knowledge | Live sources with auto-sync | Google Drive, Docs and Sheets, Notion, Shopify catalogue, Zendesk or Freshdesk help centre; scheduled re-crawl that only re-processes changed pages | 2 |
| Knowledge | Structured data lookup | Spreadsheets and catalogues kept as real tables, so the bot can filter, sort and count ("blue shirts under ₹999 in size M") instead of guessing from text | 2 |
| Knowledge | Approved answers | Hand-written Q&A pairs that take priority over everything else | 2 |
| Answers | Smarter retrieval | Rewrites vague follow-ups, adds context to every chunk, re-ranks results, checks the answer against sources and cites them | 2 |
| Answers | Confidence-based hand-off | Low confidence means "let me get a person", never a guess | 2 |
| Answers | Streaming replies | Words appear as they're written, with step status such as "Checking your order…" | 1 |
| Answers | Page awareness and memory | Knows which page the visitor is on; remembers the conversation and returning visitors | 3 |
| Answers | Languages | Replies in the customer's language, including Hindi and Hinglish | 3 |
| Actions | Integration library | Shopify, WooCommerce, Razorpay, Stripe, Cal.com, Calendly, Google Sheets, Freshdesk, Zendesk, HubSpot, generic webhook | 3 |
| Actions | OpenAPI import | Paste a client's API spec and tools are generated | 3 |
| Actions | Confirmed write actions | Cancel, reschedule, raise a ticket; the customer confirms first | 3 |
| Actions | Customer identity check | Signed login token from the client's site, or an email/phone OTP, before showing account data | 3 |
| Actions | Lead capture | Collects name, phone, email on buying intent; sends to a Sheet, CRM or webhook | 3 |
| Actions | Rich replies | Buttons, product cards, forms, booking-slot pickers inside the chat | 3 |
| Channels | Everywhere the customer is | Website widget, hosted chat page, REST API, WhatsApp, Instagram DMs, Telegram | 1 and 4 |
| Channels | Human hand-off | Alerts staff by email, Slack or WhatsApp with a summary; staff can take over the live chat | 3 |
| Admin | One-link onboarding | Paste a website; get a ready bot with context, colours, starter questions and tests | 2 |
| Admin | Knowledge-gap inbox | Groups unanswered questions; answer once and the bot knows it | 2 |
| Admin | Draft and publish | Edit safely, publish a version, roll back in one click | 1 |
| Admin | Team and client logins | Roles for you, teammates and read-only client portals | 1 and 5 |
| Quality | Test suites | Auto-generated test questions per bot, run before every publish | 2 and 5 |
| Quality | Model comparison | Same tests on several models, cost against score | 5 |
| Business | Analytics | Resolution rate, hand-off rate, thumbs up/down, top topics, cost per bot | 5 |
| Business | Usage limits and billing export | Monthly message caps per client; usage report you invoice from | 5 |

## Architecture

One Next.js app on Vercel serves every channel and the admin; one answer engine handles every bot; all state lives in Supabase; slow work runs as Trigger.dev jobs.

Components (arrow = calls):

- **Customers** (widget, chat link, REST API, WhatsApp, Instagram, Telegram) → **Chat API and channels** (streams to the widget; verifies WhatsApp/Telegram webhooks)
- **Chat API** → **Guard services** (Upstash rate limits, Turnstile; Resend for emails and codes)
- **Chat API** → **Answer engine** (rewrites, searches, re-ranks, answers calling tools, checks grounding, cites, logs cost and confidence)
- **Answer engine** → **Client systems and web** (Shopify, Razorpay, Cal.com, help desks, allowed sites)
- **Answer engine** → **OpenRouter** (GPT-6 Luna and other models, embeddings, re-rank, OCR, speech, web search)
- **You and your team** (admin, live inbox; client viewers later) → **Admin app and API** (bots, knowledge, tools, inbox, gaps, tests, publish/rollback) → Answer engine (playground, tests)
- **Admin API** → **Trigger.dev jobs** (ingest, sync, OCR, embed, group gaps, run tests) → OpenRouter
- Everything on Vercel and Trigger.dev → **Supabase** (Postgres + pgvector: bots, versions, chunks, data tables, conversations, gaps, tests · Storage: original files · Auth: team logins · Realtime: live inbox · Vault: per-bot secrets)

**How a customer message flows:**

1. The customer writes in the widget, WhatsApp or another channel. Webhook channels are verified and queued; the widget connects directly and streams.
2. The chat API checks rate limits and bot protection, then loads the bot's published version from Supabase.
3. The answer engine searches that bot's knowledge in Supabase and calls OpenRouter to rewrite, re-rank and answer.
4. Tools call the client's systems; write actions wait for the customer's click.
5. The reply streams back and is saved with its sources, cost and confidence. Low confidence feeds the gap inbox; a hand-off alerts staff, who reply from the admin inbox.
6. Separately, anything you add in the admin queues a Trigger.dev job that reads, chunks and embeds it into Supabase.

## Data model

Everything hangs off a **client** (the company) and its **bots** (usually one, sometimes a support bot plus a sales bot). Today's `clients` table becomes `bots`; a new `clients` table sits above it. All tables stay in one Postgres database, every row carries `bot_id` or `client_id`, and only the server touches them.

| Table | Holds | Key columns |
| --- | --- | --- |
| `members` | You, teammates, client-portal users | auth user id, role (owner, editor, client viewer), client id for viewers |
| `clients` | The company | name, slug, monthly message cap, billing contact |
| `bots` | One bot | client id, slug, draft config, published version id |
| `bot_versions` | Frozen snapshot of a bot's config | version number, config (context, model, rules, tools, widget, channels), test score, published by/at |
| `secrets` | API keys and tokens per bot | name, encrypted value (Supabase Vault) |
| `sources` | Each data source | kind (file, url, site, drive, notion, shopify, help centre, qa, table), settings, sync schedule, last synced, status |
| `documents` | One file or page from a source | title, url, stored original, content hash, version |
| `chunks` | Searchable passages | document id, text, context line, embedding, keyword index, page/heading |
| `data_tables`, `data_rows` | Spreadsheets and catalogues as real tables | column schema; each row as JSON with an index for filtering |
| `qa_pairs` | Approved answers | question, answer, embedding, created from gap id |
| `tools` | Actions the bot can take | kind (http, openapi, integration, built-in), schema, needs confirmation, needs identity, secret refs |
| `channels` | Where the bot answers | kind (web, whatsapp, instagram, telegram, api), settings, webhook verify token |
| `conversations` | One chat | channel, visitor id, verified customer, status (bot, waiting, staff, closed), summary, rating |
| `messages` | Every turn | role (user, assistant, staff, tool), text, sources, tool calls, confidence, tokens, cost, latency |
| `gaps` | Grouped unanswered questions | label, example questions, count, status |
| `eval_cases`, `eval_runs` | Test questions and results | question, facts the answer must contain; score per version and model |
| `leads` | Captured contacts | fields, where it was sent |
| `usage_daily` | Daily roll-up for billing | messages, tokens, cost per bot |
| `audit_log` | Who changed what | member, action, before/after |

## Ingesting company data

Any input is turned into the same two things: clean Markdown passages for search, and real tables for anything row-shaped. Ingestion moves out of the web request into a background job, so large files and whole sites no longer time out.

**Pipeline, per source:**

1. **Upload or connect.** Files go straight from the browser to Supabase Storage through a signed upload link (fixes today's ~4.5 MB request limit on Vercel). Connected sources store their settings and secret.
2. **Queue a job.** The admin shows progress live: queued, reading, chunking, embedding, ready, or failed with the reason.
3. **Read** the file with the right parser (table below) into Markdown that keeps headings, page numbers and tables.
4. **Split tables out.** Row-shaped data goes to `data_tables` / `data_rows`; a short description of each table is also indexed so search can find it.
5. **Chunk** by heading, about 400–800 tokens with a small overlap.
6. **Add context.** A cheap model writes one line per chunk saying where it sits ("Acme returns policy, damaged items"); this line is embedded with the chunk and markedly improves retrieval of short fragments.
7. **Embed and index**, skipping chunks whose content hash hasn't changed.
8. **Re-sync** on a schedule (daily or weekly per source): only changed pages are re-processed, and pages that disappeared are removed.

| Input | How it is read |
| --- | --- |
| PDF with text | `unpdf` (already in the code) |
| Scanned PDF, photos of documents | OpenRouter `file-parser` plugin with the `mistral-ocr` engine, $2 per 1,000 pages ([docs](https://openrouter.ai/docs/guides/overview/multimodal/pdfs)) |
| Word (.docx) | `mammoth` to Markdown |
| PowerPoint (.pptx) | Unzip and read slide text plus speaker notes |
| Excel, CSV, TSV | SheetJS / Papa Parse into a real table |
| JSON | Array of objects becomes a table; anything else becomes text |
| Websites | Existing crawler plus sitemap, with a readability pass to drop menus and footers |
| Images (product photos, infographics) | Vision model writes a description and extracts any text |
| Audio and video | OpenRouter `/audio/transcriptions` (Whisper models); long recordings split into short pieces ([docs](https://openrouter.ai/docs/guides/overview/multimodal/stt)) |
| YouTube | The video's captions |
| Google Drive, Docs, Sheets | Google Drive API with a folder the client shares with your service account |
| Notion | Notion API with an integration token from the client |
| Shopify | Admin API: products, variants, stock, policies and pages |
| Zendesk, Freshdesk help centres | Their public help-centre article APIs |
| Past tickets or chat exports | A model drafts Q&A pairs from them; you approve before they go live |

Open question: maximum upload size per file. Supabase Storage's free tier holds 1 GB in total, so 50 MB per file is a sensible starting cap.

## Retrieval and answering

The answer path becomes seven steps, aiming at the first words on screen within about 1.5 seconds and a full answer within 5. Today it is one search and one model call.

1. **Check the request.** Rate limit, bot protection on the widget (Cloudflare Turnstile), message length cap, language detection.
2. **Understand it.** A fast, cheap call rewrites the latest message into a standalone search query ("what about returns for that?" becomes "return policy for the Linen Duvet Cover") and labels the intent: question, account action, small talk, wants a human, or off topic.
3. **Approved answers first.** If an approved Q&A pair matches closely, use it as the primary source.
4. **Search in parallel.** Hybrid vector + keyword search for the top 30 passages, plus the list of the bot's data tables.
5. **Re-rank** the 30 down to the best 6. Cohere's rerank models are on OpenRouter at $0.001–0.0025 per search ([model page](https://openrouter.ai/cohere/rerank-4-fast)); that is more than the answer itself costs on GPT-6 Luna, so re-rank only when the top results score close together.
6. **Answer**, streaming, with the client's context, the 6 passages, the page the visitor is on and the verified customer (if any). The model can call:
   - `search_knowledge` for a second, different search
   - `query_table` to filter, sort or count a data table (a fixed set of operators turned into safe SQL; never free-form SQL)
   - the bot's API tools and integrations
   - `web_search` within allowed sites
   - `show_ui` for buttons, product cards, forms or booking slots
   - `capture_lead` and `handoff`
7. **Check grounding.** Each factual sentence must cite a source number. A cheap check confirms the cited passages support it; if not, the bot retries once, then hands off with the client's message.

Every answer is logged with its sources, tool calls, confidence, tokens, cost and time taken. Low confidence or a thumbs-down feeds the knowledge-gap inbox.

## Tools and actions

Tools come in four kinds, all stored the same way in `tools`, so the answer step treats them alike. Writing a tool by hand (today's only option) becomes the fallback.

| Kind | How you add it | Examples |
| --- | --- | --- |
| Built-in | Always available, switch on per bot | search knowledge, query a table, web search, show buttons/cards/forms, capture lead, hand off, verify identity |
| Integration | Pick from a list, fill a short connect form | Shopify, Razorpay, Cal.com (table below) |
| OpenAPI import | Paste the client's API spec URL, tick the operations to expose | Their custom order or booking API |
| Hand-written HTTP | JSON as today | Anything else |

**First integrations:**

| Integration | Read actions | Write actions (customer confirms) |
| --- | --- | --- |
| Shopify | Order status and tracking, product search, stock | Cancel an unfulfilled order |
| WooCommerce | Order status, product search | — |
| Razorpay | Payment and refund status | — |
| Stripe | Subscription, invoice and refund status | — |
| Cal.com, Calendly | Open slots | Book, reschedule, cancel |
| Google Sheets | Look up rows | Append a row (leads, requests) |
| Freshdesk, Zendesk | Ticket status | Create a ticket |
| HubSpot | — | Create a contact or deal |
| Webhook | — | Send any event to Zapier, Make or n8n, which reaches thousands of other apps |

**Safety rules built into every tool:**

- **Confirmation for writes.** The server holds the pending action and shows the customer a card ("Cancel order #1042? Yes / No"). Only the click runs it; the model cannot confirm on the customer's behalf.
- **Identity for personal data.** Tools marked "needs identity" run only for a verified customer: either the client's site passes a signed login token when it loads the widget, or the customer enters a one-time code sent by email or WhatsApp. Identity fields (email, customer id) are filled from the verified identity, never from the model.
- **Secrets stay server-side,** encrypted per bot, never shown to the model or the browser.
- **Limits:** 12-second timeout, trimmed responses, public addresses only, a per-tool rate limit, every call logged.
- **Test console** in the admin to run any tool with sample inputs before switching it on.

## Channels and human hand-off

One engine answers on every channel. Each channel is a thin adapter: it verifies the incoming webhook, turns the message into a common shape (bot, channel, customer id, text, attachments), queues it, and sends the reply back in that channel's format. Queuing matters because WhatsApp and Telegram expect the webhook to return immediately.

| Channel | How it connects | Cost to the client | Notes |
| --- | --- | --- | --- |
| Website widget | Script tag (built) | Free | Gains streaming, rich replies, page awareness |
| Hosted chat page and QR code | `/c/<bot>` link (built as `/embed/<bot>?standalone=1`) | Free | Share on receipts, Instagram bio, Google Business profile |
| REST API | Built | Free | For apps and custom front ends |
| WhatsApp | Meta WhatsApp Cloud API on the client's number | Replies within 24 hours of the customer's message are free; marketing messages are always charged ([Meta pricing](https://developers.facebook.com/docs/whatsapp/pricing)) | Needs the client's Meta Business verification; proactive updates need approved templates |
| Instagram DMs | Instagram Messaging API through a Meta app | Free | Needs an Instagram professional account linked to a Facebook page, and Meta app review |
| Telegram | Bot API token from BotFather | Free | Easiest channel; good first test of the adapter design |
| Email (later) | Inbound email forwarding to a webhook | Free tier of the email service | Replies by email; long threads summarised |

Rich replies degrade per channel: buttons become WhatsApp interactive buttons or Telegram inline keyboards, and plain numbered options elsewhere.

**Hand-off to a person:**

1. **Triggers:** the customer asks for a human; two low-confidence answers in a row; a sensitive topic the bot is told to escalate (complaints, refund disputes, legal); or a rule you set.
2. **The customer is told** what happens next, using the client's support hours.
3. **Staff are alerted** by email, Slack or WhatsApp with a three-line summary and a link.
4. **Staff reply from the live inbox** in the admin (Supabase Realtime). The bot stays silent in that chat until staff hand it back.
5. **Outside hours,** the bot collects contact details and opens a ticket (Freshdesk, Zendesk, Sheet or email).
6. **One click** turns a staff answer into an approved answer, so the bot handles that question next time.

## Admin and onboarding

You log into one admin, see every client at a glance, and open any bot to manage it. The target is under 5 minutes from a client's website URL to a live, tested bot.

**Admin layout:**

- **Home:** all clients with messages today, cost this month, failing tests, open gaps and failed syncs, so problems surface without opening each bot.
- **Client:** its bots, members, message cap and usage.
- **Bot**, in tabs:
  - Overview: key numbers for this bot
  - Setup: context, tone, rules, model
  - Knowledge: sources with sync status, data tables, approved answers
  - Tools, Channels, Widget
  - Playground: chat with a debug panel showing the rewritten query, passages found and their scores, tool calls, confidence, and cost of each reply
  - Inbox: live chats and hand-offs
  - Gaps, Tests, Versions (publish and roll back), Settings
- **Integrations catalogue, Team, Usage and billing.**

**One-link onboarding:**

1. Enter the company name and website (optionally drop in files).
2. A background job reads the sitemap and key pages: home, about, contact, FAQ, policies, pricing.
3. A model drafts:
   - company summary, tone, products or services
   - shipping, returns, refund and cancellation policies
   - contact details, hours, escalation rules
   - brand colour and logo, four starter questions
   - 20 test questions with the facts each answer must contain
   - suggested integrations (a Shopify store suggests Shopify; a Cal.com link suggests booking)
4. You review each drafted field beside the page it came from, and edit.
5. Run the tests, publish version 1, and get the install snippet, share link and QR code.

**Knowledge-gap loop:**

- **Signals:** hand-offs for low confidence, failed grounding checks, "I don't know" replies, thumbs-down, and customers rephrasing the same question.
- **Nightly job** groups similar questions into gaps with a label, count, examples and dates.
- **You or the client answer once:** the answer becomes an approved Q&A pair and a new test question. A "Draft answer" button proposes one from the knowledge and the web for you to approve.
- **Weekly email per client:** chats, resolution rate, new gaps.

## Quality, analytics and billing

Every bot has a test suite that must pass before a new version goes live, and every reply is costed so you can bill each client from real usage.

**Test suites:**

- **Where cases come from:** 20 generated at onboarding, one per answered gap, fixed thumbs-down chats, and your own.
- **What a case checks:** facts the answer must contain, things it must never say ("never promises a delivery date"), the tool it should call, and whether it should hand off.
- **Scoring:** a stronger model grades each answer on facts, citations, tone and rules; pass or fail per case, plus an overall score.
- **When it runs:**
  - on every publish, blocking it if the score drops more than 5 points or a critical case fails
  - nightly on the live version, catching broken syncs and integrations
  - on demand for model comparison
- **Shared red-team set** every bot must pass: prompt injection, off-topic requests, abuse, asking for another customer's data, competitor questions.
- **Model comparison:** the same suite on 3–4 models, showing score, response time and cost per 1,000 messages side by side.

**Analytics** (per bot, per client, and across all clients):

- Conversations and messages
- Resolution rate (no hand-off, no thumbs-down, no repeat within 24 hours) and hand-off rate
- Thumbs up/down, top topics (grouped weekly), open gaps
- Response time, cost per conversation
- Leads captured, actions completed (orders checked, bookings made)

**Billing:**

- `usage_daily` rolls up messages, tokens and cost per bot.
- Monthly cap per client: a warning at 80%; at 100% the bot shows the client's contact details instead of answering.
- Monthly usage export per client to invoice from.
- Expected model cost on GPT-6 Luna, with the extra rewrite and grounding calls: roughly $2 per 1,000 messages, plus about $0.007 per web search. This is an estimate to confirm against real logs in Phase 5.

## Security and privacy

The two risks that matter most are one client's data showing up in another client's bot, and a customer getting at someone else's account data. Each rule below closes one of those or a smaller risk.

| Area | Rule |
| --- | --- |
| Logins | Supabase Auth (email link or Google) replaces the single admin password; roles owner, editor and client viewer |
| Client isolation | Every query filters by bot; the client portal reads through row-level security tied to the viewer's client; an automated test proves bot A can never retrieve bot B's passages |
| Customer data | Account tools run only for a verified customer, with identity fields filled by the server; write actions need the customer's click |
| Secrets | Encrypted in Supabase Vault per bot, replacing today's `TOOL_` environment variables, which don't scale to many clients |
| Abuse | Allowed websites (built), Cloudflare Turnstile on the widget, rate limits per visitor, bot and conversation in a shared store (Upstash Redis) instead of per-server memory |
| Prompt injection | Documents, tool results and web pages are treated as data; a final check blocks replies that leak the system prompt, secrets or another customer's details |
| Personal data | Optional masking of card, Aadhaar, phone and email numbers in logs; retention period per client (for example, delete chats after 90 days); export or delete one customer's data on request, as India's Digital Personal Data Protection Act expects |
| Notice | The widget shows a one-line notice that chats are stored, linking to the client's privacy policy |
| Records and backups | Audit log of admin changes; a nightly database backup to storage via a scheduled GitHub Action, since Supabase's free plan has no automatic backups |

Cleanup before launch: drop the six unused template tables (`Chat`, `User`, `Message`, `Document`, `Suggestion`, `Vote`) in the Supabase project; they are publicly readable and writable today.

## Hosting and costs

Stay on Vercel + Supabase, add Trigger.dev for background jobs, and run free while building and piloting. Move Vercel and Supabase to paid plans (about $45 a month) when the first client pays: Vercel's free plan forbids commercial use ([fair use rules](https://vercel.com/docs/limits/fair-use-guidelines)), and Supabase's free plan pauses idle projects and has no automatic backups ([pricing](https://supabase.com/pricing)).

| Job | Service | Free tier | When to pay |
| --- | --- | --- | --- |
| Admin, chat API, widget | Vercel | Hobby: 1M function invocations and 4 hours active CPU a month; personal, non-commercial use only | Pro, $20/month with $20 usage credit, from the first paying client |
| Database, vectors, logins, files, live inbox | Supabase | 500 MB database, 1 GB files, 5 GB egress, 2 active projects; pauses after 1 week without activity; no automatic backups | Pro, from $25/month: 8 GB database, 100 GB files, daily backups kept 7 days |
| Ingestion, syncs, gap grouping, test runs | Trigger.dev | $5 monthly credit, 20 concurrent runs, no run time limit, 10 schedules ([pricing](https://trigger.dev/pricing)) | Hobby, $10/month, if jobs outgrow the credit |
| Models, embeddings, OCR, transcription, web search, re-ranking | OpenRouter | Pay per use | From day one (about $2 per 1,000 messages, estimated) |
| Rate limits | Upstash Redis | Free tier | Unlikely early |
| Emails (alerts, codes, weekly reports) | Resend | Free tier | Unlikely early |
| Bot protection | Cloudflare Turnstile | Free | — |
| Backups, keep-alive ping, tests on every push | GitHub Actions | Free for private repos within monthly minutes | — |

**Why Trigger.dev instead of Supabase Edge Functions for jobs:** Edge Functions allow only 2 seconds of CPU per request and 150 seconds of wall time on the free plan ([limits](https://supabase.com/docs/guides/functions/limits)); parsing a large PDF or crawling a site overruns that. Trigger.dev runs ordinary Node code with no time limit, so the existing parsers move over unchanged.

**Free-plan gotchas to handle now:**

- The Supabase project pauses after a week with no traffic: a daily GitHub Action pings it until real clients keep it busy.
- Your Supabase account is already at the 2-active-project limit (`free-agent-harness` and `supabase-gray-ladder`).
- No automatic backups: the nightly backup Action from the Security section covers this.

**Considered and set aside:** Cloudflare Workers' free plan allows only 10 ms of CPU per request ([limits](https://developers.cloudflare.com/workers/platform/limits/)), too tight for this app. Netlify's free plan (300 credits a month) doesn't state its commercial-use terms on its pricing page ([pricing](https://www.netlify.com/pricing/)), so check before relying on it.

**Running cost once paid:** about $45/month for Vercel Pro and Supabase Pro, plus model usage. One client at a modest monthly fee covers it; price plans per client so model usage is passed through.

## Build phases

Five phases in order, each ending at a gate that must be met before the next one starts. Phase 1 is plumbing the rest depends on; Phase 2 is where bots visibly get better and onboarding gets fast.

| Phase | Covers | Gate to pass before the next phase |
| --- | --- | --- |
| 1. Foundation | Team logins and roles; clients become bots; draft, publish, roll back; background jobs on Trigger.dev; direct uploads; streaming replies; encrypted per-bot secrets; shared rate limits; Turnstile | Current features work on the new structure; a 50 MB PDF ingests; rollback works |
| 2. Smarter answers, any data | All file types incl. OCR and audio; data tables with a query tool; contextual chunks, query rewrite, re-ranking, cited and checked answers; Drive, Notion, Shopify and help-centre sync; approved answers; one-link onboarding; knowledge-gap inbox; first test suites | A test client goes from URL to live bot in 5 minutes and scores 90%+ on its tests |
| 3. Actions and hand-off | Integration library, OpenAPI import, confirmed write actions; customer identity checks; lead capture; buttons, cards and forms; page awareness, memory, Hindi and Hinglish; hand-off and live inbox | On a Shopify test store, order lookup and a confirmed cancel work; hand-off reaches staff |
| 4. Channels | Telegram first (simplest), then WhatsApp and Instagram DMs; rich replies mapped to each channel; email later | The same test suite passes on the widget, Telegram and WhatsApp |
| 5. Quality and business | Publish blocked on test regressions; nightly runs; shared red-team tests; model comparison, analytics, usage caps, billing export; client portal, weekly client reports; move to paid hosting | First paying client live on paid hosting, receiving weekly reports |

Order inside a phase is flexible; the gates are not. If time is short, Phases 1 and 2 alone already make a product clients would pay for.

**Milestones** (one per coding session, roughly):

Phase 1 — Foundation

- [ ] 1.1 Supabase Auth logins with roles; retire `ADMIN_PASSWORD`
- [ ] 1.2 Migrate `clients` to `bots`; add `clients`, `members`, `bot_versions`, `secrets` (Vault), `audit_log`
- [ ] 1.3 Draft, publish and roll back; chat always serves the published version
- [ ] 1.4 Trigger.dev jobs; signed direct uploads to Storage; ingestion moved to jobs with live status
- [ ] 1.5 Streaming replies in the widget and playground
- [ ] 1.6 Upstash rate limits, Turnstile; GitHub Actions for tests on push, nightly backup, keep-alive ping

Phase 2 — Smarter answers, any data

- [ ] 2.1 Parsers for Word, PowerPoint, Excel, images, scanned PDFs (OCR), audio, YouTube
- [ ] 2.2 Data tables and the `query_table` tool
- [ ] 2.3 Contextual chunks, content-hash dedupe, scheduled re-sync
- [ ] 2.4 Answer pipeline: query rewrite, approved answers, re-ranking, grounding check with citations, confidence
- [ ] 2.5 Connectors: Google Drive/Docs/Sheets, Notion, Shopify catalogue, help centres
- [ ] 2.6 Playground debug panel
- [ ] 2.7 One-link onboarding wizard
- [ ] 2.8 Knowledge-gap inbox and first test suites

Phase 3 — Actions and hand-off

- [ ] 3.1 Tool framework: four kinds, secret references, test console
- [ ] 3.2 OpenAPI import
- [ ] 3.3 Integrations: Shopify, Razorpay, Cal.com first; the rest as clients need them
- [ ] 3.4 Confirmation cards for write actions
- [ ] 3.5 Customer identity: signed token from the client's site, or one-time code
- [ ] 3.6 Rich replies (`show_ui`) and lead capture
- [ ] 3.7 Page awareness, memory, Hindi and Hinglish
- [ ] 3.8 Hand-off: staff alerts, live inbox, outside-hours tickets

Phase 4 — Channels

- [ ] 4.1 Channel adapter layer, with Telegram as the first channel
- [ ] 4.2 WhatsApp Cloud API
- [ ] 4.3 Instagram DMs

Phase 5 — Quality and business

- [ ] 5.1 Publish blocked on test regressions; nightly runs; shared red-team set
- [ ] 5.2 Model comparison
- [ ] 5.3 Analytics dashboards
- [ ] 5.4 `usage_daily`, monthly caps, billing export
- [ ] 5.5 Client portal with row-level security; weekly client reports
- [ ] 5.6 Move to paid hosting

## Resuming later

Start each coding session by attaching the GitHub repo `sakshamm21/custom-support-bot` and saying: "Read `docs/PLAN.md` and continue from the next unticked milestone."

**Before Phase 1** (one short session):

- [ ] Import the repo in Vercel, connect `supabase-gray-ladder` under Storage, add `OPENROUTER_API_KEY` and `ADMIN_PASSWORD`, redeploy
- [ ] Create one test bot and check the widget works end to end, so there is a live baseline
- [ ] Drop the six unused template tables in Supabase

**Session rules:**

- One milestone per session; each ends with tests passing, a push to `main`, and Vercel deploying it.
- Database changes go in `supabase/migrations/` as numbered files and are committed with the code.
- Tick the milestone in `docs/PLAN.md` before ending the session.

**Accounts to create when their phase starts:**

| Account | Needed in | For |
| --- | --- | --- |
| Trigger.dev | Phase 1 | Background jobs |
| Upstash, Cloudflare | Phase 1 | Rate limits, Turnstile |
| Google Cloud service account | Phase 2 | Drive, Docs and Sheets sync |
| Shopify development store | Phase 2 | Testing catalogue sync and order actions |
| Resend | Phase 3 | Alert emails, one-time codes, weekly reports |
| Telegram (BotFather) | Phase 4 | First channel |
| Meta developer account | Phase 4 | WhatsApp and Instagram |

**Decisions still open:**

- [ ] Your price per client (setup fee plus monthly plan by message volume?)
- [ ] Maximum upload size per file (50 MB proposed)
- [ ] Which integrations your first clients need, which decides the order inside Phase 3
- [ ] A custom domain for the app, so the widget loads from your brand's address
