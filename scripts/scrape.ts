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
        headless: 'new',
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
        for (const frame of frames) {
            const menuHandle = await frame.evaluateHandle(() => {
                const result = Array.from(document.querySelectorAll('a, button, span, li'));
                return result.find(el => el.textContent?.trim() === '입찰정보');
            });

            if (menuHandle.asElement()) {
                console.log('Found "입찰정보" menu. Clicking...');
                await menuHandle.asElement()!.evaluate((el: any) => el.click());
                menuClicked = true;
                await new Promise(r => setTimeout(r, 2000)); // Wait for submenu/frame load
                break;
            }
        }

        if (!menuClicked) {
            console.warn('Could not find "입찰정보" menu. Proceeding anyway...');
        }

        // Find "공고현황" (Announcement List) sub-menu
        let subMenuClicked = false;
        for (const frame of page.frames()) {
            const subMenuHandle = await frame.evaluateHandle(() => {
                const result = Array.from(document.querySelectorAll('a, button, span, li'));
                // "공고현황" or "입찰공고검색"
                return result.find(el => {
                    const t = el.textContent?.trim();
                    return t === '공고현황' || t === '물품'; // Clicking "물품" often leads to the list
                });
            });

            if (subMenuHandle.asElement()) {
                console.log('Found "공고현황/물품" button. Clicking via JS...');

                await new Promise(r => setTimeout(r, 500));

                // For Bid Info, it usually stays in the same tab (iframe update), 
                // BUT sometimes opens a popup. We'll use the generic wait logic.
                const newTargetPromise = browser.waitForTarget(target => target.opener() === page.target(), { timeout: 5000 }).catch(() => null);

                await subMenuHandle.asElement()!.evaluate((el: any) => el.click());

                const newTarget = await newTargetPromise;
                if (newTarget) {
                    console.log('New tab/window opened. Switching context...');
                    const newPage = await newTarget.page();
                    if (newPage) {
                        page = newPage;
                        await page.bringToFront();
                    }
                }

                subMenuClicked = true;
                break;
            }
        }

        if (!subMenuClicked) {
            console.warn('Could not find "공고현황" menu button.');
        }

        console.log('Waiting for page load (3s)...');
        await new Promise(r => setTimeout(r, 3000));

        // Strict Verify regarding of tab
        const pageTitle = await page.title();
        console.log(`Current Page Title: ${pageTitle}`);

        // Fix: Do not rely on text '발주목록' as it exists in the menu on every page.
        // Check for specific Inputs meant for the Order List form.
        let onOrderListPage = false;
        try {
            onOrderListPage = await page.evaluate(() => {
                // Check for 'inqrBgnDt' (Date Input) or 'taskClCd' (Hidden Task Code)
                return !!document.querySelector('input[id*="inqrBgnDt"]') ||
                    !!document.querySelector('input[name="taskClCd"]') ||
                    !!document.querySelector('input[id*="dminInstCd"]');
            });
        } catch (e) { }

        if (pageTitle === '나라장터' && !onOrderListPage) {
            console.error('ERROR: Still on Main Page (Title: 나라장터) and Search Form inputs NOT found.');
            console.log('Menu navigation failed. Attempting Direct URL for "Bid Announcement Search"...');

            // Fallback: Direct URL to the internal "Bid Announcement" application page
            // This bypasses the frameset wrapper which often blocks direct access.
            const DIRECT_URL = 'https://www.g2b.go.kr:8101/ep/tbid/tbidFwd.do?taskClCd=1';
            await page.goto(DIRECT_URL, { waitUntil: 'networkidle0' });
            await new Promise(r => setTimeout(r, 4000));

            console.log(`Navigated to Direct URL: ${page.url()}`);

            // Re-verify
            try {
                onOrderListPage = await page.evaluate(() => {
                    return !!document.querySelector('input[id*="inqrBgnDt"]') ||
                        !!document.querySelector('input[name="taskClCd"]') ||
                        !!document.querySelector('input[id*="dminInstCd"]');
                });
            } catch (e) { }

            if (!onOrderListPage) {
                const uniqueText = await page.evaluate(() => document.body.innerText.substring(0, 200));
                console.log(`Page Stub after Direct URL: ${uniqueText}`);
                throw new Error('Navigation failed: Direct URL also failed to load Search Inputs.');
            }
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

        // 3. Identify Content Frame
        console.log('Searching for content frame containing "공고명"...');

        let targetFrame = null;
        for (let i = 0; i < 10; i++) {
            const frames = page.frames();
            for (const f of frames) {
                try {
                    const text = await f.evaluate(() => document.body.innerText).catch(() => '');
                    // Stricter frame check
                    if (text.includes('공고명') && (text.includes('수요기관') || text.includes('발주기관'))) {
                        targetFrame = f;
                        console.log(`Found Content Frame: ${f.name() || 'Unnamed'} (${f.url()})`);
                        break;
                    }
                } catch (e) { }
            }
            if (targetFrame) break;
            await new Promise(r => setTimeout(r, 1000));
        }

        if (!targetFrame) {
            // Fallback to main page if frames not found (sometimes it's not framed)
            console.log('No specific content frame found. Using Main Page as target.');
            targetFrame = page;
        }

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
