import { Decimal } from 'decimal.js'

/**
 * Money is Decimal end to end — never a JS number. Postgres stores
 * numeric(14,2) for amounts and numeric(14,4) for quantities and rates; the
 * boundary rounds once, at the end, half-up, exactly like the ledger expects.
 */

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP })

export type Money = Decimal
export const ZERO = new Decimal(0)

export const money = (value: Decimal.Value | null | undefined): Decimal =>
  new Decimal(value ?? 0)

/** Round to cents, half-up — the only rounding the ledger performs. */
export const cents = (value: Decimal.Value): Decimal => money(value).toDecimalPlaces(2)

/** Round a quantity/rate to 4dp. */
export const qty = (value: Decimal.Value): Decimal => money(value).toDecimalPlaces(4)

export const sum = (values: Decimal.Value[]): Decimal =>
  values.reduce<Decimal>((acc, v) => acc.plus(money(v)), ZERO)

export const isZero = (value: Decimal.Value): boolean => money(value).isZero()

/** Line extension: quantity x rate, rounded per line then summed (never the reverse). */
export const extend = (quantity: Decimal.Value, rate: Decimal.Value): Decimal =>
  cents(qty(quantity).times(money(rate)))

export function formatMoney(
  value: Decimal.Value | null | undefined,
  currency = 'USD',
  locale = 'en-US',
): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
    money(value).toNumber(),
  )
}

export function formatNumber(value: Decimal.Value | null | undefined, places = 2): string {
  return money(value).toFixed(places)
}
