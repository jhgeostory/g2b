
import puppeteer from 'puppeteer';

(async () => {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.goto('https://www.g2b.go.kr/index.jsp', { waitUntil: 'networkidle0' });

    console.log('--- Inputs on Main Page ---');
    const inputs = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('input')).map((el: any) => ({
            id: el.id,
            name: el.name,
            placeholder: el.placeholder,
            title: el.title,
            type: el.type,
            isVisible: el.offsetParent !== null
        }));
    });
    console.table(inputs.filter(i => i.isVisible)); // Only show visible ones

    console.log('--- Buttons on Main Page ---');
    const buttons = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('button, a.btn_search, span.btn_search, img[alt*="검색"]')).map((el: any) => ({
            tagName: el.tagName,
            id: el.id,
            textContent: el.textContent?.trim(),
            className: el.className,
            onclick: el.getAttribute('onclick'),
            alt: el.getAttribute('alt')
        }));
    });
    console.table(buttons.slice(0, 20));

    await browser.close();
})();
