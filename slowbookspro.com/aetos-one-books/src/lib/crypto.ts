import 'server-only'
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'
import { env } from './env'

/**
 * Two-level key hierarchy:
 *
 *   MASTER_KEY (env, 32 bytes)
 *     └─ wraps each org's data key (OrgEnvironment.dataKeyWrapped)
 *          └─ encrypts that org's secrets: provider credentials, AI keys,
 *             attachment blobs at rest
 *   MASTER_KEY also encrypts each org's tenant DSN (OrgEnvironment.dsnEncrypted)
 *
 * One org's data key never decrypts another org's data, so a leaked tenant
 * backup is useless without the control plane.
 */

const ALG = 'aes-256-gcm'

function masterKey(): Buffer {
  if (!env.masterKey) {
    throw new Error(
      'MASTER_KEY is not set. Generate one with: openssl rand -base64 32',
    )
  }
  const key = Buffer.from(env.masterKey, 'base64')
  if (key.length !== 32) {
    throw new Error('MASTER_KEY must decode to exactly 32 bytes')
  }
  return key
}

/** Encrypt with an explicit 32-byte key. Output: v1.<iv>.<tag>.<ciphertext> */
export function encryptWith(key: Buffer, plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALG, key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join('.')
}

export function decryptWith(key: Buffer, payload: string): string {
  const [version, ivB64, tagB64, ctB64] = payload.split('.')
  if (version !== 'v1') throw new Error(`Unsupported ciphertext version ${version}`)
  const decipher = createDecipheriv(ALG, key, Buffer.from(ivB64, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

/** Encrypt with the installation master key (DSNs, wrapped org keys, TOTP). */
export const encryptMaster = (plaintext: string) => encryptWith(masterKey(), plaintext)
export const decryptMaster = (payload: string) => decryptWith(masterKey(), payload)

/** Mint a fresh 32-byte org data key, returned raw and wrapped. */
export function newOrgDataKey(): { raw: Buffer; wrapped: string } {
  const raw = randomBytes(32)
  return { raw, wrapped: encryptMaster(raw.toString('base64')) }
}

export function unwrapOrgDataKey(wrapped: string): Buffer {
  return Buffer.from(decryptMaster(wrapped), 'base64')
}

/** SHA-256 hex — used for session tokens, API tokens and file fingerprints. */
export const sha256 = (value: string | Buffer): string =>
  createHash('sha256').update(value).digest('hex')

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url')

/** Strong, printable password for generated database roles. */
export const randomPassword = () => randomBytes(24).toString('base64url')
