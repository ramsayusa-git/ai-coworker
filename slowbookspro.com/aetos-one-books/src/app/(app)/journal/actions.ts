'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getAppContext } from '@/server/context'
import { principalFrom } from '@/server/auth'
import { requireRole } from '@/lib/rbac'
import { actionError, DomainError } from '@/server/accounts'
import { postJournalEntry } from '@/server/ledger'
import { assertNotReconciled, utcDate, voidPosting } from '@/server/banking'

const LineSchema = z.object({
  accountId: z.coerce.number().int().positive(),
  debit: z.string().trim().default(''),
  credit: z.string().trim().default(''),
  description: z.string().trim().max(300).nullish(),
  classId: z.coerce.number().int().positive().nullish(),
  jobId: z.coerce.number().int().positive().nullish(),
})

const EntrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
  description: z.string().trim().min(1, 'Describe what this entry is for').max(500),
  reference: z.string().trim().max(100).nullish(),
  classId: z.coerce.number().int().positive().nullish(),
  jobId: z.coerce.number().int().positive().nullish(),
  lines: z.array(LineSchema).min(2, 'A journal entry needs at least two lines'),
})

const decimalish = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return '0'
  if (!/^-?\d*(\.\d*)?$/.test(trimmed)) throw new DomainError(`"${value}" is not an amount.`)
  return trimmed
}

export async function createJournalEntryAction(input: unknown) {
  try {
    const { db, session } = await getAppContext()
    requireRole(principalFrom(session), 'BOOKKEEPER')
    const data = EntrySchema.parse(input)

    const lines = data.lines
      .map((line) => ({
        accountId: line.accountId,
        debit: decimalish(line.debit),
        credit: decimalish(line.credit),
        description: line.description ?? null,
        classId: line.classId ?? null,
        jobId: line.jobId ?? null,
      }))
      .filter((line) => line.debit !== '0' || line.credit !== '0')

    if (lines.length < 2) {
      return { ok: false as const, error: 'A journal entry needs at least two lines with an amount.' }
    }
    for (const line of lines) {
      if (line.debit !== '0' && line.credit !== '0') {
        return {
          ok: false as const,
          error: 'Each line is either a debit or a credit, never both. Clear one side.',
        }
      }
    }

    const entry = await db.$transaction(async (tx) =>
      postJournalEntry(tx, {
        date: utcDate(data.date),
        description: data.description,
        reference: data.reference ?? '',
        sourceType: 'manual',
        classId: data.classId ?? null,
        jobId: data.jobId ?? null,
        lines,
      }),
    )

    revalidatePath('/journal')
    revalidatePath('/accounts')
    revalidatePath('/banking')
    return { ok: true as const, id: entry.id }
  } catch (error) {
    return actionError(error)
  }
}

export async function reverseJournalEntryAction(input: unknown) {
  try {
    const { db, session } = await getAppContext()
    requireRole(principalFrom(session), 'BOOKKEEPER')
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(input)

    const entry = await db.transaction.findUnique({ where: { id }, include: { reversalOf: true } })
    if (!entry) return { ok: false as const, error: 'That entry no longer exists.' }
    if (entry.isVoided) return { ok: false as const, error: 'This entry is already reversed.' }
    if (entry.reversalOf) {
      return { ok: false as const, error: 'A reversal cannot itself be reversed.' }
    }
    await assertNotReconciled(db, id)

    const reversal = await voidPosting(db, id)
    revalidatePath('/journal')
    revalidatePath('/accounts')
    revalidatePath('/banking')
    return { ok: true as const, id: reversal.id }
  } catch (error) {
    return actionError(error)
  }
}
