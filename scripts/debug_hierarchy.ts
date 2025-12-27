
import puppeteer from 'puppeteer';

(async () => {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-popup-blocking'],
    });
    const page = await browser.newPage();

    console.log('Navigating to G2B Home...');
    await page.goto('https://www.g2b.go.kr/index.jsp', { waitUntil: 'networkidle0' });

    console.log('Searching for "입찰정보" element hierarchy...');

    const hierarchy = await page.evaluate(() => {
        // Find the text node (or element containing text)
        const all = document.querySelectorAll('*');
        let target = null;
        for (const el of all) {
            // distinctive text, excluding huge containers
            if (el.children.length === 0 && el.textContent?.includes('입찰정보')) {
                target = el;
                break;
            }
        }

        if (!target) return 'Text "입찰정보" not found in discrete element.';

        const chain = [];
        let curr: any = target;
        for (let i = 0; i < 7; i++) {
            if (!curr) break;
            chain.push({
                tagName: curr.tagName,
                id: curr.id,
                className: curr.className,
                href: (curr as HTMLAnchorElement).href || null,
                onclick: curr.getAttribute('onclick'),
                text: curr.textContent?.trim().substring(0, 20)
            });
            curr = curr.parentElement;
        }
        return chain;
    });

    console.log('Hierarchy for "입찰정보":');
    console.table(hierarchy);

    const announceHierarchy = await page.evaluate(() => {
        // Find "공고현황" or "물품"
        const all = document.querySelectorAll('*');
        let target = null;
        for (const el of all) {
            if (el.children.length === 0 && (el.textContent === '공고현황' || el.textContent === '물품')) {
                target = el;
                break;
            }
        }
        if (!target) return 'Text "공고현황" or "물품" not found.';

        const chain = [];
        let curr: any = target;
        for (let i = 0; i < 7; i++) {
            if (!curr) break;
            chain.push({
                tagName: curr.tagName,
                id: curr.id,
                className: curr.className,
                href: (curr as HTMLAnchorElement).href || null,
                onclick: curr.getAttribute('onclick'),
                text: curr.textContent?.trim().substring(0, 20)
            });
            curr = curr.parentElement;
        }
        return chain;
    });

    console.log('Hierarchy for "공고현황/물품":');
    console.table(announceHierarchy);

    await browser.close();
})();
