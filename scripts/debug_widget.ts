
import puppeteer from 'puppeteer';

(async () => {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.goto('https://www.g2b.go.kr/index.jsp', { waitUntil: 'networkidle0' });

    console.log('--- Searching for Main Page Widget Inputs ---');
    const widgetInfo = await page.evaluate(() => {
        // Find label or text "검색어"
        const labels = Array.from(document.querySelectorAll('label, span, div, th'));
        const target = labels.find(el => el.textContent?.includes('검색어') && el.children.length === 0);

        if (!target) return 'Label "검색어" not found';

        // Find nearest input
        const container = target.closest('div.w2group') || target.parentElement?.parentElement;
        if (!container) return 'Container not found';

        const input: any = container.querySelector('input[type="text"]');
        const btn: any = container.querySelector('button, a, img[alt*="검색"]');

        return {
            label: target.textContent,
            containerClass: container.className,
            inputId: input?.id,
            inputName: input?.name,
            btnText: btn?.textContent || btn?.getAttribute('alt'),
            btnId: btn?.id
        };
    });
    console.log(widgetInfo);

    await browser.close();
})();
