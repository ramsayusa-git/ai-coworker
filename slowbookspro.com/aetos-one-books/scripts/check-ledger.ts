/** Integrity check: the ledger must balance, and every entry within itself. */
import 'dotenv/config'
import { controlDb } from '../src/lib/control-db'
import { tenantDb } from '../src/lib/tenant-db'
import { trialBalance } from '../src/server/ledger'

async function main() {
 const slug = process.argv[process.argv.indexOf('--org') + 1] ?? 'demo'
const org = await controlDb.org.findUniqueOrThrow({ where: { slug } })
const db = await tenantDb(org.id)

const tb = await trialBalance(db, new Date())
console.log('Trial balance  debits', tb.totalDebit.toFixed(2), ' credits', tb.totalCredit.toFixed(2))
console.log('Balanced:', tb.totalDebit.equals(tb.totalCredit))

const unbalanced = await db.$queryRawUnsafe<{ id: number; d: string; c: string }[]>(
  `SELECT t.id, SUM(l.debit)::text AS d, SUM(l.credit)::text AS c
     FROM transactions t JOIN transaction_lines l ON l.transaction_id = t.id
    GROUP BY t.id HAVING SUM(l.debit) <> SUM(l.credit)`,
)
console.log('Unbalanced entries:', unbalanced.length)
if (unbalanced.length) console.log(unbalanced.slice(0, 5))
await controlDb.$disconnect()
process.exit(unbalanced.length === 0 && tb.totalDebit.equals(tb.totalCredit) ? 0 : 1)
}
main()
