import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

async function debugHtml() {
    console.log('Starting HTML Debugger...');
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    try {
        // 1. Go to G2B
        await page.goto('https://www.g2b.go.kr/', { waitUntil: 'networkidle0' });

        // 2. Navigate to Order List
        console.log('Navigating to Order List...');

        // Click "발주" if exists
        const topMenus = await page.$$('li, a, span');
        for (const menu of topMenus) {
            const text = await page.evaluate(el => el.textContent?.trim(), menu);
            if (text === '발주') {
                await page.evaluate(el => el.click(), menu);
                await new Promise(r => setTimeout(r, 1000));
                break;
            }
        }

        // Click "발주목록"
        const subMenus = await page.$$('li, a, span');
        for (const menu of subMenus) {
            const text = await page.evaluate(el => el.textContent?.trim(), menu);
            if (text === '발주목록') {
                await page.evaluate(el => el.click(), menu);
                break;
            }
        }

        console.log('Waiting for content...');
        await new Promise(r => setTimeout(r, 5000)); // Wait for load

        // 3. Find Frame with "수요기관"
        const frames = page.frames();
        let targetFrame = page.mainFrame();

        for (const frame of frames) {
            const hasText = await frame.evaluate(() => document.body.innerText.includes('수요기관'));
            if (hasText) {
                targetFrame = frame;
                console.log(`Found target frame: ${frame.url()}`);
                break;
            }
        }

        // 4. Dump HTML
        console.log('Dumping HTML...');
        const html = await targetFrame.content();

        // Save to file
        const dumpPath = path.join(process.cwd(), 'debug_page_dump.html');
        fs.writeFileSync(dumpPath, html);
        console.log(`HTML saved to ${dumpPath}`);

        // Also log a snippet around "수요기관"
        const snippet = await targetFrame.evaluate(() => {
            const bodyHtml = document.body.innerHTML;
            const idx = bodyHtml.indexOf('수요기관');
            if (idx !== -1) {
                return bodyHtml.substring(idx - 500, idx + 1000);
            }
            return 'Text "수요기관" not found in HTML source';
        });
        console.log('Snippet around "수요기관":');
        console.log(snippet);

    } catch (err) {
        console.error(err);
    } finally {
        await browser.close();
    }
}

debugHtml();
