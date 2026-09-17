# Superseded migration history

These are the migrations as they stood up to 0008. They are kept for reference only and
are NOT applied by `npm run db:migrate`.

They were replaced on 17 Sep 2026 because the history had drifted badly from reality:
13 tables (teams, team_members, refresh_tokens, canned_responses, saved_views,
conversation_notes, campaign_steps, campaign_recipients, automation_rules, ad_campaigns,
social_posts, partner_members, partner_invites) and ~20 columns existed only in the dev
database, created by `drizzle-kit push` during development. `push` updates the snapshot
files under meta/ without writing any SQL, so `generate` believed there was nothing to
emit and the history could no longer rebuild the database.

The practical effect: a fresh install — production, CI, or a self-hosted customer — got a
schema missing a third of the product. The replacement is a single squashed baseline
(0000_baseline) generated from schema.ts with `drizzle-kit export`.

Lesson for this project: use `drizzle-kit generate` + `db:migrate`. Never `drizzle-kit push`.
