const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  
  try {
    await page.goto('http://localhost:3004/student', { waitUntil: 'networkidle0' });
    const text = await page.evaluate(() => document.body.innerText);
    console.log('PAGE TEXT:', text);
  } catch (e) {
    console.log('ERROR:', e.message);
  }
  
  await browser.close();
})();
