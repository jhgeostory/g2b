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

// Helper to close common G2B popups
async function closeMainPopups(page: any) {
    console.log('Attempting to close visible popups...');
    try {
        const frames = page.frames();
        for (const frame of frames) {
            const closeBtns = await frame.$$('a, button, div, span, img');
            for (const btn of closeBtns) {
                const text = await frame.evaluate((el: any) => el.textContent?.trim(), btn);
                const alt = await frame.evaluate((el: any) => el.getAttribute('alt'), btn);
                const className = await frame.evaluate((el: any) => el.className, btn);

                if (
                    text === '닫기' || text === '창닫기' || text?.includes('오늘 하루 열지') ||
                    alt === '닫기' || alt === '창닫기' ||
                    (className && typeof className === 'string' && className.includes('close'))
                ) {
                    try {
                        if (await frame.evaluate((el: any) => el.offsetParent !== null, btn)) {
                            console.log(`Closing popup in frame "${frame.name()}": ${text || alt || 'Icon'}`);
                            await frame.evaluate((el: any) => el.click(), btn);
                            await new Promise(r => setTimeout(r, 500));
                        }
                    } catch (e) { }
                }
            }
        }
    } catch (e) {
        console.log('Error closing popups:', e);
    }
};

async function scrapeG2B(): Promise<Announcement[]> {
    console.log('Starting scraper...');
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-popup-blocking'], // Added popup blocking disable
    });
    let page = await browser.newPage();

    // ... (lines skipped)

    try {
        // 1. Go to G2B
        await page.goto(G2B_URL, { waitUntil: 'networkidle0' });
        console.log('Navigated to G2B homepage.');

        // Close initial popups
        await closeMainPopups(page);

        // 2. Navigate to "입찰정보" -> "공고현황" (Public Bid Announcements)
        console.log('Attempting navigation: 입찰정보 -> 공고현황');

        let menuClicked = false;

        // Find "입찰정보" (Bid Info) menu item
        const frames = page.frames();
        // 2. Use Main Page Unified Search (Bypass Menu)
        console.log('Attempting Main Page Search (Bypassing Menu Navigation)...');

        // Ensure "Bid Announcement" mode is selected (Radio button)
        const modeRadio = await page.waitForSelector('input[type="radio"][title="입찰공고"]', { timeout: 2000 }).catch(() => null);
        if (modeRadio) {
            console.log('Ensuring "Bid Announcement" mode is selected...');
            await modeRadio.evaluate((el: any) => el.click());
            await new Promise(r => setTimeout(r, 500));
        }

        const mainSearchInput = await page.waitForSelector('input[title="검색어 입력"], input[placeholder="입찰공고"]', { timeout: 5000 }).catch(() => null);

        if (mainSearchInput) {
            console.log('Found Main Page Search Input. Typing Agency Code directly...');

            // Handle Alerts (e.g., "Enter search term")
            page.on('dialog', async dialog => {
                console.log(`DIALOG DETECTED: [${dialog.type()}] ${dialog.message()}`);
                await dialog.accept();
            });

            // Force focus/click
            await mainSearchInput.evaluate((el: any) => { el.focus(); el.click(); el.value = ''; });
            await new Promise(r => setTimeout(r, 200));
            await mainSearchInput.type(TARGET_AGENCY_CODE, { delay: 100 });
            await new Promise(r => setTimeout(r, 500));

            // Find the search button (magnifying glass) - Traverse up to find sibling button
            const searchBtn = await page.evaluateHandle((input: any) => {
                let container = input.parentElement;
                let btn = null;
                // Traverse up 4 levels to be safe
                for (let i = 0; i < 4; i++) {
                    if (!container) break;
                    btn = container.querySelector('.srch_sm') || container.querySelector('.btn_search') || container.querySelector('input[type="button"].srch_sm');
                    if (btn) break;
                    container = container.parentElement;
                }
                return btn;
            }, mainSearchInput);

            const newTargetPromise = browser.waitForTarget(target => target.opener() === page.target(), { timeout: 10000 }).catch(() => null);

            if (searchBtn.asElement()) {
                console.log('Found Search Button. Clicking...');
                await searchBtn.asElement()!.evaluate((el: any) => el.click());
            } else {
                console.log('Search Button not found. Trying Enter key...');
                await page.keyboard.press('Enter');
            }

            // Wait specifically for potential navigation or new tab
            const newTarget = await newTargetPromise;
            if (newTarget) {
                console.log('New tab/popup detected from Search! Switching context...');
                const newPage = await newTarget.page();
                if (newPage) {
                    page = newPage;
                    await page.bringToFront();
                }
            } else {
                // Check if a new page exists anyway (waitForTarget might have timed out or missed)
                const pages = await browser.pages();
                if (pages.length > 1) {
                    console.log(`Found ${pages.length} pages. Switching to the last one...`);
                    const lastPage = pages[pages.length - 1];
                    if (lastPage !== page) {
                        page = lastPage;
                        await page.bringToFront();
                    }
                }
            }

            console.log('Search action completed. Waiting for results (10s)...');
            await new Promise(r => setTimeout(r, 10000));
        } else {
            console.error('ERROR: Could not find Main Page Search Input.');
        }

        // (Menu navigation logic removed in favor of Main Page Search)

        console.log('Waiting for page load (3s)...');
        await new Promise(r => setTimeout(r, 3000));

        // Strict Verify regarding of tab
        const pageTitle = await page.title();
        console.log(`Current Page Title: ${pageTitle}`);

        // Fix: Do not rely on text '발주목록' as it exists in the menu on every page.
        // Check for specific Inputs meant for the Order List form.
        let onOrderListPage = false;

        // Check all frames for the Search Form
        let targetFrame: any = page.mainFrame();

        for (const frame of page.frames()) {
            const hasInput = await frame.evaluate(() => {
                return !!document.querySelector('input[id*="inqrBgnDt"]') ||
                    !!document.querySelector('input[name="taskClCd"]') ||
                    !!document.querySelector('input[id*="dminInstCd"]');
            }).catch(() => false);

            if (hasInput) {
                onOrderListPage = true;
                targetFrame = frame;
                console.log(`Found Order List inputs in frame: ${frame.name() || 'Main'}`);
                break;
            }
        }

        if (!onOrderListPage) {
            console.error('ERROR: Search Form inputs NOT found in any frame after Main Page Search.');
            console.log('--- DEBUG: Frame Dump ---');
            page.frames().forEach(f => console.log(`Frame: [${f.name()}] URL: ${f.url()}`));
        }

        if (onOrderListPage) {
            console.log('Verified arrival on Order List page (Found Search Inputs).');
        } else {
            const uniqueText = await page.evaluate(() => document.body.innerText.substring(0, 200));
            console.log(`Page Stub: ${uniqueText}`);
            throw new Error('Navigation verification failed: Search Inputs not found.');
        }

        // Close Popups on New Page if any
        await closeMainPopups(page);

        // Content Frame already identified during verification.

        // 3b. Dump Search Area HTML for Debugging
        console.log('--- DEBUG: Dumping "수요기관" Search Area HTML ---');
        // 3. Open Detailed Conditions (상세조건) using targetFrame
        console.log('Checking "Detailed Search" status...');

        // Strict check: Is the Agency Input actually visible?
        const isDetailedOpen = await targetFrame.evaluate(() => {
            const input = document.querySelector('input[id*="ibxSrchDmstCd"]') ||
                document.querySelector('input[id*="txtPrcrmntInsttNm"]') ||
                document.querySelector('input[id*="prcrmntInsttNm"]');
            return input && (input as HTMLElement).offsetParent !== null; // Visible check
        });

        if (!isDetailedOpen) {
            console.log('Detailed search inputs not visible. Attempting to match and click "상세조건" button...');

            // Dump buttons for debug
            await targetFrame.evaluate(() => {
                const btns = Array.from(document.querySelectorAll('a, button, span.w2trigger, div.btn_area'));
                console.log('--- DEBUG: Potential Toggle Buttons ---');
                btns.forEach(b => {
                    const txt = b.textContent?.trim();
                    if (txt?.includes('상세') || txt?.includes('조건')) {
                        console.log(`[${b.tagName}] Text: "${txt}", ID: "${b.id}", Class: "${b.className}"`);
                    }
                });
            });

            // Try to click "상세조건"
            const toggleClicked = await targetFrame.evaluate(() => {
                const elements = Array.from(document.querySelectorAll('a, button, span, label'));
                const toggle = elements.find(el => {
                    const t = el.textContent?.trim();
                    return t === '상세조건' || t === '상세조건 열기' || t === '검색조건 더보기';
                });
                if (toggle) {
                    (toggle as HTMLElement).click();
                    return true;
                }
                // Fallback: ID-based (common in G2B)
                const btnId = document.querySelector('[id*="btnSearchToggle"]');
                if (btnId) { (btnId as HTMLElement).click(); return true; }

                return false;
            });

            if (toggleClicked) {
                console.log('Clicked "상세조건" toggle.');
                await new Promise(r => setTimeout(r, 2000)); // Wait for expansion
            } else {
                console.warn('Could not find "상세조건" button.');
            }
        } else {
            console.log('Detailed search inputs are already visible.');
        }

        // Wait a bit
        await new Promise(r => setTimeout(r, 1000));

        // 4. Find Agencies (Strict Label Search)
        console.log('Looking for Agency Search trigger...');

        // Define context variables for Agency Search
        let context = targetFrame;
        let popupFrame: any = null;
        let inputHandle: any = null;
        let triggerHandle: any = null;

        // B. Search for the "Agency" label to locate the search area
        console.log('Searching for "Agency" label via Puppeteer Handle (Excluding GNB)...');
        const labelHandle = await targetFrame.evaluateHandle(() => {
            // 1. Strict: Table Header in the main content
            const labels = Array.from(document.querySelectorAll('label, th, td, span, b, strong'));
            const found = labels.find(el => {
                const t = el.textContent?.trim();
                // Exclude Global Nav Bar elements
                if (el.closest('.gnb') || el.closest('#header') || el.closest('.top_menu')) return false;

                return t === '수요기관' || t === '발주기관';
            });
            return found || null;
        });

        if (labelHandle.asElement()) {
            console.log('Found "수요기관" label (Strict). Finding nearby inputs...');

            // Refined: Find the specific TD (data cell) associated with this Label (header cell)
            const dataContainerHandle = await targetFrame.evaluateHandle((el: any) => {
                const th = el.closest('th'); // Assuming Label is in TH
                if (th && th.nextElementSibling) {
                    return th.nextElementSibling; // Return the TD next to it
                }
                const td = el.closest('td');
                if (td && td.nextElementSibling) {
                    return td.nextElementSibling;
                }
                // Fallback: parent parent (usually div wrapping label -> div wrapping field)
                return el.parentElement?.parentElement || el.closest('tr');
            }, labelHandle);

            if (dataContainerHandle.asElement()) {
                inputHandle = await dataContainerHandle.asElement()!.$('input[type="text"]');
                triggerHandle = await dataContainerHandle.asElement()!.$('button, a, img[alt*="검색"], img[src*="search"], input[type="image"], .w2trigger');
            }
        }

        if (inputHandle) {
            // Check if input is disabled (Read-Only)
            const isDisabled = await inputHandle.evaluate((el: any) => el.disabled || el.classList.contains('w2input_disabled') || el.readOnly);

            if (isDisabled) {
                console.log('Agency Input is DISABLED/Read-Only. Switching to Trigger Button...');
                inputHandle = null; // Force fall-through to triggerHandle
            } else {
                console.log('Found Agency Input box directly. Typing...');
                // Debug: specific input found
                const html = await inputHandle.evaluate((el: any) => el.outerHTML);
                console.log('DEBUG: Input HTML:', html);

                await inputHandle.evaluate((el: any) => el.value = '');
                await inputHandle.type(TARGET_AGENCY_CODE);
                await inputHandle.press('Enter');
            }
        }

        // Note: checking inputHandle again because it might have been set to null above
        if (!inputHandle && triggerHandle) {
            console.log('Found Agency Search Trigger.');

            // Debug: check what we found
            try {
                const tagDebug = await triggerHandle.evaluate((el: any) => `${el.tagName} | ${el.className} | ${el.id}`);
                console.log(`Trigger Element: ${tagDebug}`);
            } catch (e) { }

            console.log('Clicking trigger via JS...');
            await triggerHandle.evaluate((el: any) => el.click()); // Force click via JS

            // Wait for popup
            console.log('Waiting for popup...');
            await new Promise(r => setTimeout(r, 2000));

            // Check if a new frame appeared
            for (const f of page.frames()) {
                const name = f.name();
                // Check if frame looks like a popup (often has 'popup' in name or url, or is new)
                if (name && (name.includes('popup') || name.includes('frame'))) {
                    // Check content
                    try {
                        if (await f.$('input[id*="ibxSrchDmstCd"]')) {
                            popupFrame = f;
                            console.log(`Popup frame identified: ${name}`);
                            break;
                        }
                    } catch (e) { }
                }
            }

            if (popupFrame) {
                context = popupFrame;
                console.log('Switched context to popup frame.');
            }
        } else {
            console.warn('Could not find Agency Input or Trigger near "수요기관" label.');
        }

        // 4b. If we clicked trigger or if we are in popup context, we might need to type there
        if (!inputHandle && (triggerHandle || popupFrame)) {
            const popupInput = await context.$('input[id*="ibxSrchDmstCd"], input[id*="txtPrcrmntInsttNm"]');
            if (popupInput) {
                console.log('Found Popup Input. Typing...');
                await popupInput.evaluate((el: any) => el.value = '');
                await popupInput.click({ clickCount: 3 });
                await popupInput.type(TARGET_AGENCY_CODE);
                await popupInput.press('Enter');

                await new Promise(r => setTimeout(r, 1500));

                // Click first result
                // Try multiple selectors for the result row/link
                const firstResult = await context.$('tr.gridBodyRow a, .gridBody a, .gridBody span[class*="click"], td a');
                if (firstResult) {
                    console.log('Clicking first result in popup via JS...');
                    await firstResult.evaluate((el: any) => el.click());
                } else {
                    console.warn('No clickable result found in popup.');
                }
            } else {
            }
        }

        // 4c. Set Date Range (to ensure results)
        console.log('Setting Date Range to last 6 months...');
        try {
            const today = new Date();
            const lastMonth = new Date();
            lastMonth.setMonth(today.getMonth() - 6);

            const formatDate = (d: Date) => {
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${year}/${month}/${day}`;
            };

            const startDate = formatDate(lastMonth);
            // const endDate = formatDate(today); // Usually defaults to today, no need to touch

            // Find Start Date Input (IDs often contain 'from', 'From', 'Beg', or 'Start')
            // Find Start Date Input (IDs often contain 'from', 'From', 'Beg', or 'Start')
            // G2B Bid Info: 'fromBidDt'
            // G2B Order List: 'inqrBgnDt'
            const dateInput = await targetFrame.$('input[id*="fromBidDt"], input[name*="fromBidDt"], input[id*="inqrBgnDt"], input[id*="from"], input[id*="From"], input[id*="Start"], input[id*="Beg"]');

            if (dateInput) {
                const id = await dateInput.evaluate((el: any) => el.id);
                console.log(`Found Date Input [ID: ${id}]. Setting to ${startDate}`);

                await dateInput.evaluate((el: any) => el.value = '');
                await dateInput.type(startDate);
                await dateInput.press('Tab'); // Trigger events
            } else {
                console.warn('Could not find Date Start input automatically.');
            }
        } catch (e) {
            console.error('Error setting date range:', e);
        }

        // 5. Click Main Search in targetFrame
        console.log('Clicking Main Search...');
        const searchBtns = await targetFrame.$$('a, button, input[type="submit"], .btn_search, .w2trigger');
        let mainSearchClicked = false;

        for (const btn of searchBtns) {
            const id = await targetFrame.evaluate((el: any) => el.id, btn);
            const text = await targetFrame.evaluate((el: any) => el.textContent?.trim() || el.value || el.getAttribute('alt'), btn);
            const className = await targetFrame.evaluate((el: any) => el.className, btn);

            // Debug matching
            // console.log(`Check Btn: ID=${id}, Text=${text}, Class=${className}`);

            if (
                (id && (id.includes('btnS0001') || id.includes('btnSearch') || id.includes('S0001'))) ||
                (text === '검색' || text === '조회') ||
                (typeof className === 'string' && (className.includes('btn_search') || className.includes('search')))
            ) {
                // EXCLUDE GNB/Global buttons
                if (id && (id.includes('gnb') || id.includes('global') || id.includes('header') || id.includes('Global'))) {
                    console.log(`Skipping GNB Button: ${id}`);
                    continue;
                }
                if (typeof className === 'string' && (className.includes('gnb') || className.includes('top'))) {
                    continue;
                }
                if (text && text.includes('해당 검색어')) {
                    continue;
                }

                console.log(`Clicking Search Button: [ID: ${id}] [Text: ${text}]`);
                await targetFrame.evaluate((el: any) => el.click(), btn);
                mainSearchClicked = true;
                break;
            }
        }

        if (!mainSearchClicked) {
            console.warn('Could not identify a Main Search button.');
            // Fallback: Try clicking the first button in the .btn_area if it exists
            const btnArea = await targetFrame.$('.btn_area .btn_search, .btn_area a.btn_blue');
            if (btnArea) {
                console.log('Fallback: Clicking first button in .btn_area');
                await btnArea.evaluate((el: any) => el.click());
                mainSearchClicked = true;
            }
        }

        console.log('Waiting for results (5s)...');
        await new Promise(r => setTimeout(r, 5000));

        // CAPTURE SCREENSHOT
        console.log('Capturing debug screenshot...');
        try {
            await page.screenshot({ path: 'debug_search_result.png', fullPage: true });
            console.log('Saved debug_search_result.png');
        } catch (e) {
            console.error('Failed to capture screenshot:', e);
        }

        // 6. Extract Results from targetFrame
        console.log('Extracting results...');
        const announcements: Announcement[] = await targetFrame.evaluate(() => {
            // Check for No Data message
            if (document.body.innerText.includes('데이터가 존재하지') || document.body.innerText.includes('조회된 데이터가 없습니다')) {
                console.log('DEBUG: Page says "No Data Found"');
            }

            const rows = Array.from(document.querySelectorAll('table tbody tr'));
            console.log(`DEBUG: Found ${rows.length} table rows.`); // Client-side log

            const results: Announcement[] = [];

            rows.forEach((row, idx) => {
                const cols = row.querySelectorAll('td');
                if (cols.length < 5) return;

                const titleEl = row.querySelector('div.tl a') || row.querySelector('td.tl a') || row.querySelector('a');
                if (!titleEl) {
                    if (idx < 3) console.log(`DEBUG: Row ${idx} has no proper title link.`);
                    return;
                }

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
