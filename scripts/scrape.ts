import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables from .env file (for local testing)
dotenv.config();

// Supabase setup
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: SUPABASE_URL and SUPABASE_KEY are required.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Discord Webhook setup
const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;

interface Announcement {
    id: string; // 공고번호-차수 using as unique ID
    title: string;
    link: string;
    date: string;
    agency: string;
    status: string;
}

const TARGET_AGENCY_CODE = '1613436'; // 국토교통부 국토지리정보원
const G2B_URL = 'https://www.g2b.go.kr/';

async function scrapeG2B(): Promise<Announcement[]> {
    console.log('Starting scraper...');
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'], // Required for GitHub Actions
    });
    const page = await browser.newPage();

    try {
        // 1. Go to G2B
        await page.goto(G2B_URL, { waitUntil: 'networkidle0' });
        console.log('Navigated to G2B homepage.');

        // 2. Click "발주목록" -> Depending on UI, might need to navigate via frame or direct link
        // The previous research showed we can find it by text.
        // However, G2B allows direct URL parameters sometimes, but usually it's stateful.
        // Let's use the UI interaction flow discovered.

        // Find '발주목록' in the menu or sitemap.
        // Research result: Click "발주" menu then "발주목록".
        // Or we can try to execute JS to find the link.

        // Wait for the main frame/content
        const frame = page.mainFrame();

        // Attempt to locate the "발주" menu.
        // NOTE: G2B is framed. We might need to handle frames.
        // But the research said "URL does not change", implying SPA or Frames.
        // Research said "single-page application (SPA) architecture or POST requests".

        // Let's rely on the specific ID navigation if possible, but IDs are dynamic?
        // Research: "Detailed Search Toggle: id='wq_uuid_2652_btnSearchToggle'" -> UUID suggests dynamic.
        // So we must use robust selectors (text-based or class-based).

        // Navigate to Order List Page
        // Try to click "발주" -> "발주목록" using text
        // 2. Navigation Sequence: "발주" -> "발주목록"
        console.log('Attempting navigation: 발주 -> 발주목록');

        // Step A: Click "발주" (Top Menu)
        const topMenus = await page.$$('li, a, span');
        let orderMenu;
        for (const menu of topMenus) {
            // Strict check: specifically "발주"
            const text = await page.evaluate(el => el.textContent?.trim(), menu);
            if (text === '발주') {
                orderMenu = menu;
                break;
            }
        }

        if (orderMenu) {
            console.log('Found "발주" menu. Clicking...');
            await page.evaluate(el => el.click(), orderMenu);
            await new Promise(r => setTimeout(r, 1000)); // Wait for submenu
        } else {
            console.warn('Could not find specific "발주" menu. Trying direct "발주목록" search...');
        }

        // Step B: Click "발주목록"
        const subMenus = await page.$$('li, a, span');
        let orderListBtn;
        for (const menu of subMenus) {
            const text = await page.evaluate(el => el.textContent?.trim(), menu);
            if (text === '발주목록') {
                orderListBtn = menu;
                break;
            }
        }

        if (orderListBtn) {
            console.log('Found "발주목록" button. Clicking...');
            await page.evaluate(el => el.click(), orderListBtn);

            // Wait for navigation confirmation
            console.log('Waiting for Order List page to load...');
            let onOrderListPage = false;

            for (let i = 0; i < 15; i++) { // Wait up to 15s
                await new Promise(r => setTimeout(r, 1000));
                // Check for list-specific keywords in the entire page (including frames)
                onOrderListPage = await page.evaluate(() => {
                    const text = document.body.innerText;
                    // Keywords found on the Order List / Announcement List page
                    return text.includes('공고명') || text.includes('공고번호') || text.includes('입찰마감일시');
                });

                // Also check frames
                if (!onOrderListPage) {
                    for (const frame of page.frames()) {
                        const frameText = await frame.evaluate(() => document.body.innerText).catch(() => '');
                        if (frameText.includes('공고명') && frameText.includes('공고번호')) {
                            onOrderListPage = true;
                            break;
                        }
                    }
                }

                if (onOrderListPage) {
                    console.log('Verified arrival on Order List page.');
                    break;
                }
            }

            if (!onOrderListPage) {
                console.warn('FAILED to verify navigation to Order List page.');
                // Dump current page text for debug
                const currentText = await page.evaluate(() => document.body.innerText.substring(0, 500).replace(/\s+/g, ' '));
                console.log('Current Page Text Dump:', currentText);
                throw new Error('Navigation failed - stuck on previous page.');
            }

        } else {
            throw new Error('Could not find "발주목록" menu.');
        }

        // 3. Wait for the content to actually load (SPA/Frame loading)
        console.log('Waiting for "수요기관" text to appear in any frame...');

        try {
            await page.waitForFunction(() => {
                // Check main document and all iframes
                const checkFrames = (win: Window): boolean => {
                    try {
                        if (win.document.body.innerText.includes('수요기관')) return true;
                        for (let i = 0; i < win.frames.length; i++) {
                            if (checkFrames(win.frames[i])) return true;
                        }
                    } catch (e) { /* cross-origin issues ignored */ }
                    return false;
                };
                return checkFrames(window);
            }, { timeout: 30000 }); // Wait up to 30s
            console.log('Detected "수요기관" text on page!');
        } catch (e) {
            console.warn('Timeout waiting for "수요기관" text - page might not have loaded correctly.');
        }

        // Identify the exact frame
        console.log('Identifying content frame...');
        let targetFrame = null;
        const frames = page.frames();

        for (const frame of frames) {
            try {
                const hasContent = await frame.evaluate(() => document.body.innerText.includes('수요기관'));
                if (hasContent) {
                    targetFrame = frame;
                    console.log(`Found content frame: "${frame.name()}" (${frame.url()})`);
                    break;
                }
            } catch (e) { }
        }

        if (!targetFrame) {
            console.warn('Could not pinpoint frame object despite text check. Using main frame.');
            targetFrame = page.mainFrame();
        }

        // 3. Open Detailed Conditions (상세조건) using targetFrame
        // Check if "수요기관" label is already visible
        let isDetailedOpen = await targetFrame.evaluate(() => {
            const labels = Array.from(document.querySelectorAll('label, th, td'));
            return labels.some(l => (l as HTMLElement).style.display !== 'none' && l.textContent?.includes('수요기관'));
        });

        if (!isDetailedOpen) {
            console.log('Detailed search seems closed. Attempting to open...');

            // Try ID-based toggle selector
            const toggleBtn = await targetFrame.$('[id*="btnSearchToggle"]');
            if (toggleBtn) {
                console.log('Found Detailed Search Toggle by ID. Clicking...');
                await targetFrame.evaluate(el => (el as HTMLElement).click(), toggleBtn);
                await new Promise(r => setTimeout(r, 1000));
            } else {
                console.log('Toggle ID not found. Trying text fallback...');
                const detailedBtns = await targetFrame.$$('a, button, span, div');
                for (const btn of detailedBtns) {
                    const text = await targetFrame.evaluate(el => el.textContent?.trim(), btn);
                    if (text === '상세조건' || text === '상세조건 열기' || text?.includes('상세조건')) {
                        await targetFrame.evaluate(el => (el as HTMLElement).click(), btn);
                        break;
                    }
                }
            }
        } else {
            console.log('Detailed search appears to be already open.');
        }

        // Wait a bit
        await new Promise(r => setTimeout(r, 1000));

        // 4. Find Agency Code Input
        console.log('Looking for Agency Search trigger...');

        // Strategy: Try specific ID first, then fallback to label
        const triggerClicked = await targetFrame.evaluate(() => {
            // Known ID from research: mf_wfm_container_btnSrchPrcrmntInstt
            // We look for any element containing 'btnSrchPrcrmntInstt' in ID
            const bs = document.querySelectorAll('*');
            let btn = null;
            for (const b of bs) {
                if (b.id && (b.id.includes('btnSrchPrcrmntInstt') || b.id.includes('btnSrchDemand'))) {
                    btn = b;
                    break;
                }
            }

            if (btn instanceof HTMLElement) {
                btn.click();
                return true;
            }

            return false;
        });

        if (!triggerClicked) {
            console.log('ID-based trigger not found. Trying label-based...');
            // Fallback: Label search (Redundant but safe)
            const nearbyTriggerClicked = await targetFrame.evaluate(() => {
                const labels = Array.from(document.querySelectorAll('label, th, td'));
                const targetLabel = labels.find(l => l.textContent?.includes('수요기관'));
                if (targetLabel) {
                    const container = targetLabel.closest('tr') || targetLabel.parentElement?.parentElement;
                    if (container) {
                        const genericBtn = container.querySelector('button, a[class*="btn"], input[type="image"]');
                        if (genericBtn instanceof HTMLElement) {
                            genericBtn.click();
                            return true;
                        }
                    }
                }
                return false;
            });

            if (!nearbyTriggerClicked) {
                console.warn('Could not find Agency Search trigger button via Fallback.');
            } else {
                console.log('Clicked Agency Search trigger via Fallback.');
            }
        } else {
            console.log('Clicked Agency Search trigger by ID.');
        }

        // Wait for popup frame to appear
        console.log('Waiting for popup frame...');
        let popupFrame = null;

        // We poll for the frame because it is created dynamically
        for (let i = 0; i < 10; i++) { // 10 attempts
            await new Promise(r => setTimeout(r, 1000));
            const frames = page.frames();
            for (const f of frames) {
                // Check for the specific input ID in the frame
                try {
                    const hasInput = await f.$('[id*="ibxSrchDmstCd"]');
                    if (hasInput) {
                        popupFrame = f;
                        break;
                    }
                } catch (e) { }
            }
            if (popupFrame) {
                console.log('Found popup frame!');
                break;
            }
        }

        // If still not found, check if it's in the targetFrame itself (layer popup without iframe)
        const context = popupFrame || targetFrame;

        const codeInput = await context.$('input[id*="ibxSrchDmstCd"]');
        if (codeInput) {
            console.log('Found Agency Code Input. Typing...');
            await codeInput.type(TARGET_AGENCY_CODE);
            await codeInput.press('Enter');
            await new Promise(r => setTimeout(r, 1500));

            // Search button in popup (optional, Enter usually works)
            const popupSearchBtn = await context.$('[id*="btnS0001"], [id*="btnSearch"]');
            if (popupSearchBtn) {
                // Optional click to be sure
                // await popupSearchBtn.click();
            }

            await new Promise(r => setTimeout(r, 1500));

            // Select first result
            // The results are usually in a grid/table
            // Selector: .gridBody a
            const firstResult = await context.$('.gridBody a, .gridBody span[class*="click"]');
            if (firstResult) {
                console.log('Selecting agency from list...');
                await firstResult.click();
            } else {
                console.warn('No result link found in popup. Checking for any clickable cell...');
                // Try clicking grid row
                await context.evaluate(() => {
                    const cell = document.querySelector('.gridBody td, .w2grid_body_table td');
                    if (cell instanceof HTMLElement) cell.click();
                });
            }
        } else {
            console.warn('Could not interact with agency search popup. Input not found.');
        }

        // Wait for popup to close / context update
        await new Promise(r => setTimeout(r, 1500));

        // 5. Click Main Search in targetFrame
        console.log('Clicking Main Search...');
        const searchBtns = await targetFrame.$$('a, button, input[type="submit"]');
        let mainSearchClicked = false;
        for (const btn of searchBtns) {
            // Check ID first: mf_wfm_container_btnS0001
            const id = await targetFrame.evaluate(el => el.id, btn);
            if (id && (id.includes('btnS0001') || id.includes('btnSearch'))) {
                await targetFrame.evaluate(el => el.click(), btn);
                mainSearchClicked = true;
                console.log('Clicked Main Search by ID.');
                break;
            }
        }

        if (!mainSearchClicked) {
            // Fallback by text
            for (const btn of searchBtns) {
                const text = await targetFrame.evaluate(el => el.textContent?.trim() || (el as HTMLInputElement).value, btn);
                if (text === '검색' || text === '조회') {
                    await targetFrame.evaluate(el => el.click(), btn);
                    break;
                }
            }
        }

        await new Promise(r => setTimeout(r, 3000));


        // 6. Extract Results from targetFrame
        console.log('Extracting results...');
        const announcements: Announcement[] = await targetFrame.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('table tbody tr'));
            const results: Announcement[] = [];

            rows.forEach(row => {
                const cols = row.querySelectorAll('td');
                if (cols.length < 5) return;

                const titleEl = row.querySelector('div.tl a') || row.querySelector('td.tl a') || row.querySelector('a');
                if (!titleEl) return;

                const title = titleEl.textContent?.trim() || '';
                let link = (titleEl as HTMLAnchorElement).href;

                const texts = Array.from(cols).map(c => c.textContent?.trim() || '');
                const dateStr = texts.find(t => /^\d{4}\/\d{2}\/\d{2}/.test(t)) || '';
                const agency = texts.find(t => t.includes('국토지리정보원') || t.includes('수요기관')) || 'Unknown';

                let id = '';
                if (link.includes('bidno=')) {
                    const match = link.match(/bidno=(\d+)&/);
                    if (match) id = match[1];
                } else {
                    id = title + '_' + dateStr;
                }

                // Only add if it looks like a valid row
                if (title) {
                    results.push({
                        id,
                        title,
                        link,
                        date: dateStr,
                        agency,
                        status: 'Open'
                    });
                }
            });
            return results;
        });

        console.log(`Found ${announcements.length} announcements.`);
        return announcements;

    } catch (error) {
        console.error('Error during scraping:', error);
        return [];
    } finally {
        await browser.close();
    }
}

async function sendDiscordNotification(items: Announcement[]) {
    if (!discordWebhookUrl) {
        console.log('DISCORD_WEBHOOK_URL is not set. Skipping notification.');
        return;
    }

    const embeds = items.map(item => ({
        title: `[신규 공고] ${item.title}`,
        url: item.link,
        color: 0x00ff00, // Green
        fields: [
            { name: '진행일자', value: item.date, inline: true },
            { name: '수요기관', value: item.agency, inline: true },
        ],
        footer: { text: `ID: ${item.id}` }
    }));

    // Discord limits embeds per message (max 10). Split if needed.
    const CHUNK_SIZE = 10;
    for (let i = 0; i < embeds.length; i += CHUNK_SIZE) {
        const chunk = embeds.slice(i, i + CHUNK_SIZE);

        try {
            const response = await fetch(discordWebhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: i === 0 ? `🔔 **${items.length}건의 새로운 발주 공고가 발견되었습니다!**` : undefined,
                    embeds: chunk
                })
            });

            if (!response.ok) {
                console.error(`Failed to send Discord notification: ${response.statusText}`);
            } else {
                console.log('Discord notification sent successfully.');
            }
        } catch (err) {
            console.error('Error sending Discord notification:', err);
        }
    }
}

async function run() {
    const items = await scrapeG2B();

    if (items.length === 0) {
        console.log('No items found.');
        process.exit(0);
    }

    const newItems: Announcement[] = [];

    for (const item of items) {
        // Check if exists in DB
        const { data: existing, error } = await supabase
            .from('announcements')
            .select('id')
            .eq('id', item.id)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
            console.error('Error checking DB:', error);
            continue;
        }

        if (!existing) {
            // New item
            console.log(`New item found: ${item.title}`);

            // Insert
            const { error: insertError } = await supabase
                .from('announcements')
                .insert({
                    id: item.id,
                    title: item.title,
                    link: item.link,
                    date: item.date,
                    agency: item.agency,
                    status: item.status,
                    is_sent: false
                });

            if (insertError) {
                console.error('Error inserting item:', insertError);
            } else {
                newItems.push(item);
            }
        }
    }

    // Send Discord Notification if there are new items
    if (newItems.length > 0) {
        await sendDiscordNotification(newItems);

        // Mark as sent
        const ids = newItems.map(i => i.id);
        await supabase.from('announcements').update({ is_sent: true }).in('id', ids);
    } else {
        console.log('No new items to notify.');
    }

    process.exit(0);
}

run();
