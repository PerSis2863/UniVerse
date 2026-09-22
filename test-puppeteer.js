const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const response = await page.goto('https://universeimpact.vercel.app/login', { waitUntil: 'networkidle0' });
  
  const content = await page.content();
  if (content.includes("This page couldn't load")) {
    console.log("CLERK ERROR STILL PRESENT!");
  } else if (content.includes("clerk")) {
    console.log("CLERK LOADED SUCCESSFULLY!");
  } else {
    console.log("UNKNOWN STATE");
  }
  
  await browser.close();
})();
