# Aetos One Books — code conventions (read before writing any code)

Stack: Next.js 16 (App Router, RSC), TypeScript strict, Tailwind v4, Prisma 7,
PostgreSQL 16, Radix primitives. No `any`, no `@ts-ignore`, no `console.log` in
shipped code.

## Where things live

```
src/app/(app)/<module>/        pages for one module (RSC by default)
src/app/(app)/<module>/actions.ts   'use server' mutations for that module
src/app/api/<module>/route.ts  REST surface (API tokens, integrations, webhooks)
src/server/<module>.ts         domain services — the business logic
src/server/reports/*.ts        read-only report builders
src/components/ui/*            design-system primitives (do not fork; extend)
src/components/app/*           shell: sidebar, topbar, palette, page header
src/lib/*                      framework-level helpers (money, crypto, env, db)
```

## Isolation — the rule that overrides everything

One org == one isolated environment (its own Postgres database, or its own
schema at SCHEMA tier). **Tenant tables carry no `org_id` / `company_id`
column.** Never add one, never filter by one.

Get the tenant client only through the request context:

```ts
import { getAppContext } from '@/server/context'
const { db, session, settings, features } = await getAppContext()
```

`db` is bound to the caller's org and cannot reach another. Never construct a
PrismaClient in a page, an action or a route, and never accept a connection
string, database name or org id from the client.

## Money

`Decimal` from `decimal.js`, via `@/lib/money`. Never `number` for an amount.
Round per line with `extend()`, then sum — never sum then round. Render with
`formatMoney(value, currency)`. Columns of numbers use `numeric` on
`TableHead`/`TableCell` (tabular figures, right aligned).

## Posting to the ledger

Nothing writes `transaction_lines` directly. Every document posts through
`postJournalEntry()` in `@/server/ledger`, inside the same Prisma transaction
that writes the document, so a document and its GL effect commit together.
Voiding is `reverseTransaction()` — never an update, never a delete. Control
accounts are resolved by number through `controlAccountId(db, CONTROL_ACCOUNTS.X)`,
never by name.

## Server actions

```ts
'use server'
export async function createThing(input: unknown) {
  const { db, session } = await getAppContext()
  const data = ThingSchema.parse(input)          // zod at the boundary, always
  requireRole(principalFrom(session), 'BOOKKEEPER')
  const thing = await db.$transaction(async (tx) => { ... })
  revalidatePath('/things')
  return { ok: true as const, id: thing.id }
}
```

Return `{ ok: false, error: string }` for expected failures (validation,
closed period, duplicate number). Throw only for programming errors. Never
leak a Prisma error message to the UI.

## Pages

- Server Components fetch; Client Components only where interaction demands it
  (`'use client'` as low in the tree as possible).
- Every list page: `PageHeader` + a filter row + a `DataTable` + `EmptyState`.
- Every list is paginated server-side (default 50) with sortable columns and a
  text filter; never render an unbounded list.
- Every destructive action uses a `Dialog` confirmation — never `window.confirm`.
- Every form field has a real `<Label htmlFor>`; errors render next to the field
  and are announced (`role="alert"`).
- Loading states use `loading.tsx` with `Skeleton`, not spinners.

## Accessibility (WCAG 2.1 AA — non-negotiable)

Labelled controls, visible focus (`:focus-visible` is already styled globally,
never `outline: none`), `aria-sort` on sortable headers, keyboard reachable
rows, AA contrast in both themes, and no colour-only status (pair a colour with
a word or an icon).

## Theming and white-label

Use semantic tokens only: `bg-card`, `text-muted-foreground`, `border`,
`text-primary`, `text-debit`, `text-credit`, `text-positive`, `text-negative`,
`--chart-1..6`. Never a literal colour (`bg-blue-500`), never a hex code. The
org's brand overrides `--brand-primary` at runtime; hard-coded colours break
white-labelling.

## Naming and copy

- UI copy is sentence case, plain, and specific: "Create invoice", not "Submit".
- Errors say what happened and what to do: "This period is closed. Change the
  date or ask an admin to move the closing date."
- Use the org's terminology: nonprofit mode renders customer→donor,
  invoice→pledge. Read it from `settings`.

## Quality bar

Type-check (`npm run typecheck`) and build (`npm run build`) must pass before
a module is considered done. No placeholder pages, no "TODO" left behind, no
module that renders but cannot write.
