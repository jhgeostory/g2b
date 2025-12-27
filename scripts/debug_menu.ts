
import puppeteer from 'puppeteer';

(async () => {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();

    console.log('Navigating to G2B Home...');
    await page.goto('https://www.g2b.go.kr/index.jsp', { waitUntil: 'networkidle0' });

    console.log('Searching for menu items...');

    // Dump "입찰정보" menu item
    const bidInfoParams = await page.evaluate(() => {
        // Look for top menu "입찰정보"
        const el = Array.from(document.querySelectorAll('a, li, span, div')).find(e => e.textContent?.includes('입찰정보'));
        return el ? {
            text: el.textContent,
            html: el.outerHTML,
            onclick: el.getAttribute('onclick'),
            href: (el as HTMLAnchorElement).href
        } : null;
    });
    console.log('[Debug] "입찰정보" Menu Item:', bidInfoParams);

    // Dump "공고현황" or "물품" sub-menu item
    // Note: Submenus might be hidden or loaded dynamically. 
    // We'll try to find them in the entire DOM.
    const subMenuParams = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('a, li, span, div'));
        return els
            .filter(e => e.textContent?.includes('공고현황') || e.textContent?.includes('물품'))
            .slice(0, 5)
            .map(el => ({
                text: el.textContent?.trim(),
                tagName: el.tagName,
                onclick: el.getAttribute('onclick'),
                href: (el as HTMLAnchorElement).href,
                // html: el.outerHTML.substring(0, 200) // Too long
            }));
    });
    console.log('[Debug] "공고현황/물품" Items found:', subMenuParams);

    // Also look for Global Search Bar form action
    const searchForm = await page.evaluate(() => {
        const form = document.querySelector('form[name="search"]'); // generic guess
        if (!form) return null;
        return {
            action: form.getAttribute('action'),
            name: form.getAttribute('name'),
            method: form.getAttribute('method')
        };
    });
    console.log('[Debug] Global Search Form:', searchForm);

    await browser.close();
})();
