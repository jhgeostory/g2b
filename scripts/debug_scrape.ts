import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

// Capture screenshots dir
const debugDir = path.join(process.cwd(), 'debug_output');
if (!fs.existsSync(debugDir)) {
    fs.mkdirSync(debugDir);
}

const TARGET_AGENCY_CODE = '1613436';
const G2B_URL = 'https://www.g2b.go.kr/';

async function debugScrape() {
    console.log('Starting DEBUG scraper...');
    const browser = await puppeteer.launch({
        headless: true, // Keep headless for environment compatibility, rely on screenshots
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    try {
        // 1. Go to G2B
        await page.goto(G2B_URL, { waitUntil: 'networkidle0' });
        console.log('Navigated to G2B.');
        await page.screenshot({ path: path.join(debugDir, '01_homepage.png') });

        // 2. Click "발주목록"
        // Try explicit selector first if known, else text search
        let foundMenu = false;
        const frames = page.frames();
        console.log(`Open frames: ${frames.length}`);

        // Try finding logic
        const menus = await page.$$('a, span, li');
        for (const menu of menus) {
            const text = await page.evaluate(el => el.textContent?.trim(), menu);
            if (text === '발주목록') {
                console.log('Found "발주목록" button.');
                await page.evaluate(el => el.click(), menu);
                foundMenu = true;
                break;
            }
        }

        if (!foundMenu) {
            console.error('FAILED to find "발주목록".');
            await page.screenshot({ path: path.join(debugDir, 'ERROR_no_menu.png') });
            return;
        }

        await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => { });
        console.log('Entered Order List page.');
        await page.screenshot({ path: path.join(debugDir, '02_order_list.png') });

        // 3. Detailed Search and Agency Code
        // Check if we need to click "Detailed Search"
        // Just try to find the inputs directly first.

        // We'll trust the previous logic's flow but capture the state
        const detailedBtns = await page.$$('a, button, span');
        for (const btn of detailedBtns) {
            const text = await page.evaluate(el => el.textContent?.trim(), btn);
            if (text === '상세조건') {
                await btn.click();
                await new Promise(r => setTimeout(r, 1000));
                break;
            }
        }
        await page.screenshot({ path: path.join(debugDir, '03_detailed_open.png') });

        // Search for agency popup button
        let openedPopup = false;
        await page.evaluate(() => {
            const labels = Array.from(document.querySelectorAll('label'));
            const targetLabel = labels.find(l => l.innerText.includes('수요기관'));
            if (targetLabel) {
                const container = targetLabel.parentElement?.parentElement;
                const btn = container?.querySelector('button, input[type="image"], a.btn_search');
                if (btn instanceof HTMLElement) {
                    btn.click();
                }
            }
        });

        if (!openedPopup) console.log('Attempted to open popup via JS.');

        await new Promise(r => setTimeout(r, 2000));
        await page.screenshot({ path: path.join(debugDir, '04_popup_open.png') });

        // Handle Popup Input
        // Try to find the input in the page (it might be a layer)
        const codeInput = await page.$('input[id*="ibxSrchDmstCd"]');
        if (codeInput) {
            console.log('Found Agency Code Input.');
            await codeInput.type(TARGET_AGENCY_CODE);
            await codeInput.press('Enter');
            await new Promise(r => setTimeout(r, 1500));
            await page.screenshot({ path: path.join(debugDir, '05_popup_search_result.png') });

            // Select first result
            const firstResult = await page.$('.gridBody a');
            if (firstResult) {
                console.log('Found an agency result to click.');
                await firstResult.click();
            } else {
                console.log('No agency result link found in popup. Trying specific selector...');
                // Fallback
            }
        } else {
            console.error('Could not find Agency Code Input (ibxSrchDmstCd).');
            // Dump all inputs for debugging
            const inputs = await page.evaluate(() => Array.from(document.querySelectorAll('input')).map(i => ({ id: i.id, name: i.name, class: i.className })));
            console.log('Available inputs:', JSON.stringify(inputs, null, 2));
        }

        await new Promise(r => setTimeout(r, 1000));
        await page.screenshot({ path: path.join(debugDir, '06_popup_closed.png') });

        // Click Main Search
        const searchBtns = await page.$$('a, button');
        for (const btn of searchBtns) {
            const text = await page.evaluate(el => el.textContent?.trim(), btn);
            if (text === '검색' || text === '조회') {
                await btn.click();
                console.log('Clicked Main Search button.');
                break;
            }
        }

        await new Promise(r => setTimeout(r, 4000)); // Wait plenty
        await page.screenshot({ path: path.join(debugDir, '07_search_results.png') });

        // Extract Results - DEBUGGING SELECTORS
        const resultDebug = await page.evaluate(() => {
            const tables = Array.from(document.querySelectorAll('table'));
            const rows = Array.from(document.querySelectorAll('table tbody tr'));

            return {
                tableCount: tables.length,
                rowCount: rows.length,
                firstRowHTML: rows.length > 0 ? rows[0].innerHTML : 'N/A',
                bodyText: document.body.innerText.substring(0, 500) // snippet
            };
        });

        console.log('Result Debug Info:', resultDebug);

    } catch (error) {
        console.error('Detailed Error:', error);
    } finally {
        await browser.close();
    }
}

debugScrape();
