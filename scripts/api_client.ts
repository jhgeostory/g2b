
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const API_KEY = '735e7266667ff39b2d183fbaa1db6050b69f723157d8ec3fa0bbcf8c3aab20e6';
// Updated Endpoint based on User's provided URL (BidPublicInfoService)
const BASE_URL = 'https://apis.data.go.kr/1230000/ad/BidPublicInfoService';
const TARGET_AGENCY_CODE = '1613436';

// Helper: Get Date String YYYYMMDDHHMM
function getDateString(daysOffset = 0): string {
    const d = new Date();
    d.setDate(d.getDate() + daysOffset);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}0000`; // Start of day
}

export interface BidItem {
    bidNtceNo: string;
    bidNtceNm: string;
    dminsttNm: string;
    dminsttCd: string; // Ensure this is in interface
    bidNtceDt: string;
    bidNtceUrl: string;
    bidClseDt: string;
    [key: string]: any;
}

export async function fetchBids(
    type: 'goods' | 'service',
    customStartDate?: string,
    customEndDate?: string,
    pageNo: number = 1,
    numOfRows: number = 100
): Promise<{ items: BidItem[], totalCount: number }> {
    const endpoint = type === 'goods'
        ? 'getBidPblancListInfoThng'
        : 'getBidPblancListInfoServc';

    const url = `${BASE_URL}/${endpoint}`;

    const startDate = customStartDate || getDateString(-5);
    const endDate = customEndDate || getDateString(1);

    try {
        const params = {
            serviceKey: API_KEY,
            numOfRows,
            pageNo,
            inqryDiv: 1,
            inqryBgnDt: startDate,
            inqryEndDt: endDate,
            type: 'json',
            // dminsttCd argument is ignored by this API service, so we fetch all and filter in caller.
        };

        const response = await axios.get(url, {
            params,
            responseType: 'text' // Safety for XML responses
        });

        let data = response.data;
        if (typeof data === 'string') {
            try {
                data = JSON.parse(data);
            } catch (e) {
                console.error('Failed to parse JSON response string:', e);
            }
        }

        const body = data?.response?.body;
        const items = body?.items || [];
        const totalCount = Number(body?.totalCount || items.length);

        return { items, totalCount };

    } catch (error: any) {
        console.error('API Request Failed:', error.message);
        return { items: [], totalCount: 0 };
    }
}
