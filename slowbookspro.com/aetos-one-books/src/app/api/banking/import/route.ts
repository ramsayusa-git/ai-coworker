import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAppContext } from '@/server/context'
import { AuthError, principalFrom } from '@/server/auth'
import { ForbiddenError, requireRole } from '@/lib/rbac'
import { DomainError } from '@/server/accounts'
import {
  CSV_FORMAT_LABEL,
  MAX_IMPORT_BYTES,
  importStatement,
  isoDate,
  previewStatement,
} from '@/server/banking'
import type { ImportChannel } from '@/generated/tenant/client'

/**
 * Statement upload. The file never reaches a server action — a multipart body
 * belongs on a route, where the size can be refused before it is read into
 * memory and where the extension and media type are checked before anything is
 * parsed.
 *
 * `mode=preview` parses and returns what was found without writing a row;
 * `mode=import` writes the batch, dedups per line, applies the rules and runs
 * the auto-match pass.
 */

export const runtime = 'nodejs'

const ALLOWED: Record<string, ImportChannel> = {
  ofx: 'OFX',
  qfx: 'QFX',
  csv: 'CSV',
}

// Browsers are inconsistent about OFX/QFX, so the extension decides the channel
// and the media type only has to be plausibly text.
const ALLOWED_MIME = new Set([
  'text/csv',
  'text/plain',
  'text/comma-separated-values',
  'application/csv',
  'application/vnd.ms-excel',
  'application/x-ofx',
  'application/ofx',
  'application/x-qfx',
  'application/qfx',
  'application/octet-stream',
  '',
])

const RequestSchema = z.object({
  bankAccountId: z.coerce.number().int().positive(),
  mode: z.enum(['preview', 'import']).default('preview'),
})

const fail = (status: number, error: string) => NextResponse.json({ error }, { status })

export async function POST(request: Request) {
  try {
    const { db, session } = await getAppContext()
    requireRole(principalFrom(session), 'BOOKKEEPER')

    const contentType = request.headers.get('content-type') ?? ''
    if (!contentType.includes('multipart/form-data')) {
      return fail(415, 'Send the statement as a file upload.')
    }

    const declared = Number(request.headers.get('content-length') ?? 0)
    if (declared > MAX_IMPORT_BYTES) {
      return fail(413, 'That file is too large — the limit is 20 MB.')
    }

    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return fail(400, 'Choose a statement file to upload.')

    const parsed = RequestSchema.safeParse({
      bankAccountId: form.get('bankAccountId'),
      mode: form.get('mode') ?? 'preview',
    })
    if (!parsed.success) return fail(400, 'Choose which bank feed this statement belongs to.')

    if (file.size > MAX_IMPORT_BYTES) {
      return fail(413, 'That file is too large — the limit is 20 MB.')
    }
    if (file.size === 0) return fail(400, 'That file is empty.')

    const extension = (file.name.split('.').pop() ?? '').toLowerCase()
    const channel = ALLOWED[extension]
    if (!channel) {
      return fail(415, 'Upload a .ofx, .qfx or .csv statement exported from your bank.')
    }
    const mime = (file.type || '').toLowerCase().split(';')[0]!.trim()
    if (!ALLOWED_MIME.has(mime)) {
      return fail(415, `A ${mime} file is not a statement. Upload the .ofx, .qfx or .csv export.`)
    }

    const bytes = Buffer.from(await file.arrayBuffer())
    if (bytes.byteLength > MAX_IMPORT_BYTES) {
      return fail(413, 'That file is too large — the limit is 20 MB.')
    }

    // Banks export in both UTF-8 (often with a BOM) and Windows Latin-1; decode
    // strictly first and fall back rather than mangling accented payee names.
    let content: string
    try {
      content = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      content = new TextDecoder('latin1').decode(bytes)
    }

    const feed = await db.bankAccount.findUnique({ where: { id: parsed.data.bankAccountId } })
    if (!feed) return fail(404, 'That bank feed no longer exists.')
    if (!feed.accountId) return fail(400, 'Link this feed to a ledger account first.')

    if (parsed.data.mode === 'preview') {
      const preview = previewStatement(content, channel)
      return NextResponse.json({
        channel,
        format: preview.format ?? null,
        formatLabel: preview.format ? CSV_FORMAT_LABEL[preview.format] : channel,
        headers: preview.headers,
        error: preview.error,
        warnings: preview.errors,
        count: preview.rows.length,
        rows: preview.rows.slice(0, 25).map((row) => ({
          date: isoDate(row.date),
          amount: row.amount.toFixed(2),
          payee: row.payee,
          description: row.description,
          checkNumber: row.checkNumber ?? null,
          fee: row.fee ? row.fee.toFixed(2) : null,
        })),
      })
    }

    const summary = await importStatement(db, {
      bankAccountId: feed.id,
      content,
      fileName: file.name,
      channel,
    })

    return NextResponse.json({
      ...summary,
      formatLabel: summary.format ? CSV_FORMAT_LABEL[summary.format] : channel,
    })
  } catch (error) {
    if (error instanceof AuthError) return fail(401, 'Sign in again to import a statement.')
    if (error instanceof ForbiddenError) return fail(403, error.message)
    if (error instanceof DomainError) return fail(error.status, error.message)
    return fail(500, 'That statement could not be imported. Check the file and try again.')
  }
}
