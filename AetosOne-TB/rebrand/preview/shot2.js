const puppeteer = require('puppeteer');

async function shot(browser, email, password, name) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 900 });
  await page.goto('http://localhost:4200/login', { waitUntil: 'networkidle2', timeout: 120000 });
  await page.type('#username-input', email);
  await page.type('#password-input', password);
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 12000));

  const toolbar = await page.evaluate(() => {
    const el = document.querySelector('mat-toolbar.tb-primary-toolbar');
    const btn = document.querySelector('.mat-mdc-unelevated-button.mat-accent, .mat-mdc-raised-button.mat-accent');
    return {
      toolbar: el ? getComputedStyle(el).backgroundColor : null,
      accent: btn ? getComputedStyle(btn).backgroundColor : null,
      title: document.title
    };
  });
  console.log(`${name}: toolbar=${toolbar.toolbar} accent=${toolbar.accent} title="${toolbar.title}"`);

  await page.screenshot({ path: `/tmp/shot/${name}.png` });
  await page.close();
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
    protocolTimeout: 180000
  });
  await shot(browser, 'tenant@thingsboard.org', 'tenant', 'tenant_contoso');
  await shot(browser, 'admin@acme.test', 'acme12345', 'tenant_acme');
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
