
import { fetchBids } from './api_client';
import { supabase } from '../src/lib/supabase';

const TARGET_AGENCIES = [
    '1613436', // 국토지리정보원
    '1192136', // 국립해양조사원
    '1400000'  // 산림청
];

// Helper: Format Date YYYYMMDDHHMM
function toApiDate(d: Date, time: string): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}${time}`;
}

async function saveBids(bids: any[]) {
    if (bids.length === 0) return 0;

    let newCount = 0;
    for (const bid of bids) {
        const mappedBid = {
            bid_no: bid.bidNtceNo,
            title: bid.bidNtceNm,
            agency: bid.dminsttNm,
            date: bid.bidNtceDt,
            end_date: bid.bidClseDt,
            url: bid.bidNtceUrl,
            type: bid.bidNtceNo.includes('BK') ? 'service' : 'goods',
        };

        const { error } = await supabase
            .from('g2b_bids')
            .upsert(mappedBid, { onConflict: 'bid_no', ignoreDuplicates: true });

        if (!error) newCount++;
    }
    return newCount;
}

async function processDay(date: Date) {
    const sStr = toApiDate(date, '0000');
    const eStr = toApiDate(date, '2359');

    console.log(`Processing Date: ${sStr.substring(0, 8)}...`);

    // Types to fetch
    const types: ('goods' | 'service')[] = ['goods', 'service'];

    for (const type of types) {
        let page = 1;
        const rows = 100;
        let hasMore = true;
        let totalSaved = 0;

        while (hasMore) {
            // Fetch
            const { items, totalCount } = await fetchBids(type, sStr, eStr, page, rows);

            // Filter
            const matches = items.filter((item: any) => TARGET_AGENCIES.includes(item.dminsttCd));

            // Save
            if (matches.length > 0) {
                const saved = await saveBids(matches);
                totalSaved += saved;
                console.log(`  [${type}] Page ${page}: Found ${matches.length} matches. Saved ${saved}.`);
            }

            // Pagination Logic
            const totalPages = Math.ceil(totalCount / rows);
            if (page >= totalPages || totalCount === 0 || items.length === 0) {
                hasMore = false;
            } else {
                page++;
                // Rate limit (light)
                await new Promise(r => setTimeout(r, 200));
            }
        }
    }
}

async function runHistoryFetch() {
    // Usage: npm run history -- <days>
    // Example: npm run history -- 30
    // Example: npm run history -- 180
    // Example: npm run history -- 365

    const args = process.argv.slice(2);
    const daysToFetch = args[0] ? parseInt(args[0], 10) : 30; // Default 30

    console.log(`Starting History Fetch for last ${daysToFetch} days...`);

    const now = new Date();

    for (let i = 0; i < daysToFetch; i++) {
        const targetDate = new Date(now);
        targetDate.setDate(now.getDate() - i);

        await processDay(targetDate);

        // Small delay between days
        await new Promise(r => setTimeout(r, 100));
    }

    console.log('History Fetch Complete.');
}

runHistoryFetch();
