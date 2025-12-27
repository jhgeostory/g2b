
import puppeteer from 'puppeteer';
import fs from 'fs';

(async () => {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.goto('https://www.g2b.go.kr/index.jsp', { waitUntil: 'networkidle0' });

    // Close popups first to uncover inputs
    try {
        const frames = page.frames();
        for (const frame of frames) {
            const closeBtns = await frame.$$('div.close, button.close, a.close, img[alt="닫기"]');
            for (const btn of closeBtns) await btn.click().catch(() => { });
        }
    } catch (e) { }

    console.log('--- Dumping VIsible Inputs ---');
    const inputInfo = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input, textarea'));
        return inputs
            .filter((el: any) => {
                const style = window.getComputedStyle(el);
                return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
            })
            .map((el: any) => ({
                tag: el.tagName,
                id: el.id,
                name: el.name,
                type: el.type,
                placeholder: el.placeholder,
                title: el.title,
                className: el.className,
                outer: el.outerHTML.substring(0, 100)
            }));
    });

    console.log(JSON.stringify(inputInfo, null, 2));
    fs.writeFileSync('inputs_dump.json', JSON.stringify(inputInfo, null, 2));

    await browser.close();
})();
