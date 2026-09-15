import { chromium } from 'playwright'
import fs from 'node:fs/promises'

const OUT = '/home/claude/aob/docs/screenshots'
await fs.mkdir(OUT, { recursive: true })

const pages = [
  ['dashboard', '/dashboard'],
  ['invoices', '/invoices'],
  ['invoice-detail', null],
  ['customers', '/customers'],
  ['items', '/items'],
  ['accounts', '/accounts'],
  ['journal', '/journal'],
  ['banking', '/banking'],
  ['payments', '/payments'],
  ['estimates', '/estimates'],
]

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`)
})

await page.goto('http://localhost:3000/sign-in', { waitUntil: 'networkidle' })
await page.screenshot({ path: `${OUT}/01-sign-in.png` })

await page.fill('#username', 'admin')
await page.fill('#password', 'demo1234')
await Promise.all([
  page.waitForURL(/dashboard|select-company/, { timeout: 30000 }),
  page.click('button[type=submit]'),
])
if (page.url().includes('select-company')) {
  await page.screenshot({ path: `${OUT}/02-select-company.png` })
  await page.click('a:has-text("Demo Company")')
  await page.waitForURL(/dashboard/, { timeout: 30000 })
}

let i = 3
const report = []
for (const [name, path] of pages) {
  if (!path) continue
  const before = errors.length
  const res = await page.goto(`http://localhost:3000${path}`, {
    waitUntil: 'networkidle',
    timeout: 45000,
  }).catch((e) => ({ status: () => `ERR ${e.message.slice(0, 80)}` }))
  await page.waitForTimeout(600)
  const file = `${OUT}/${String(i).padStart(2, '0')}-${name}.png`
  await page.screenshot({ path: file, fullPage: true })
  const title = await page.locator('h1').first().textContent().catch(() => null)
  report.push({
    name,
    path,
    status: typeof res.status === 'function' ? res.status() : '?',
    h1: title?.trim() ?? null,
    newErrors: errors.slice(before),
  })
  i += 1
}

// Dark theme pass on the dashboard
await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle' })
await page.evaluate(() => {
  document.documentElement.classList.add('dark')
  localStorage.setItem('theme', 'dark')
})
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/90-dashboard-dark.png`, fullPage: true })

// Mobile width
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } })
const mp = await mobile.newPage()
await mp.goto('http://localhost:3000/sign-in', { waitUntil: 'networkidle' })
await mp.screenshot({ path: `${OUT}/91-mobile-sign-in.png`, fullPage: true })

console.log(JSON.stringify({ report, errorCount: errors.length, errors: errors.slice(0, 20) }, null, 2))
await browser.close()
await mobile.close()
