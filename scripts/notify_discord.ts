
import axios from 'axios';
import dotenv from 'dotenv';
import { BidItem } from './api_client';

dotenv.config();

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

export async function sendDiscordAlert(bid: BidItem) {
    if (!DISCORD_WEBHOOK_URL) {
        console.warn('DISCORD_WEBHOOK_URL is missing. Skipping notification.');
        return;
    }

    const isService = bid.bidNtceNo.includes('BK') || bid.type === 'service'; // Basic Heuristic

    const embed = {
        title: `[${isService ? '용역' : '물품'}] ${bid.bidNtceNm}`,
        url: bid.bidNtceUrl,
        color: isService ? 0x3b82f6 : 0x22c55e, // Blue for Service, Green for Goods
        fields: [
            {
                name: '공고번호',
                value: bid.bidNtceNo,
                inline: true
            },
            {
                name: '수요기관',
                value: bid.dminsttNm,
                inline: true
            },
            {
                name: '게시일시',
                value: bid.bidNtceDt, // format usually YYYY-MM-DD HH:MM:SS
                inline: true
            },
            {
                name: '마감일시',
                value: bid.bidClseDt || '정보없음',
                inline: true
            }
        ],
        footer: {
            text: 'G2B 발주 모니터링 (API)'
        },
        timestamp: new Date().toISOString()
    };

    try {
        await axios.post(DISCORD_WEBHOOK_URL, {
            embeds: [embed]
        });
        console.log(`[Discord] Alert Sent: ${bid.bidNtceNm}`);
    } catch (error: any) {
        console.error('[Discord] Failed to send alert:', error.message);
    }
}
