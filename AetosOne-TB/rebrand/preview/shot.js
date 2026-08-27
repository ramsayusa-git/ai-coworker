const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1600,1000'],
    defaultViewport: { width: 1600, height: 1000 },
  });
  const page = await browser.newPage();

  await page.goto('http://localhost:4200/login', { waitUntil: 'networkidle2', timeout: 90000 });
  await page.type('#username-input', 'tenant@thingsboard.org');
  await page.type('#password-input', 'tenant');
  await page.keyboard.press('Enter');
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 90000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 8000));
  await page.screenshot({ path: '/tmp/shot/home.png' });
  console.log('home ->', page.url(), '| title:', await page.title());

  await page.goto('http://localhost:4200/devices', { waitUntil: 'networkidle2', timeout: 90000 });
  await new Promise(r => setTimeout(r, 5000));
  await page.screenshot({ path: '/tmp/shot/devices.png' });
  console.log('devices ok');

  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
