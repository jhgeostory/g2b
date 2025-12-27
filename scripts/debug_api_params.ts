
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const API_KEY = '735e7266667ff39b2d183fbaa1db6050b69f723157d8ec3fa0bbcf8c3aab20e6';
const BASE_URL = 'https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoServc';
const AGENCY_CODE = '1613436';
const AGENCY_NAME = '국토교통부 국토지리정보원';

// Test a specific day known to have a bid: 2025-12-22 (from previous success)
// Bid No: R25BK01242593
const START = '202512220000';
const END = '202512222359';

async function testParam(paramName: string, paramValue: string) {
    console.log(`\n--- Testing Param: ${paramName} = ${paramValue} ---`);
    try {
        const response = await axios.get(BASE_URL, {
            params: {
                serviceKey: API_KEY,
                numOfRows: 10,
                pageNo: 1,
                inqryDiv: 1,
                inqryBgnDt: START,
                inqryEndDt: END,
                type: 'json',
                [paramName]: paramValue
            }
        });

        const items = response.data?.response?.body?.items || [];
        if (items.length > 0) {
            console.log(`Fetch Count: ${items.length}`);
            const match = items.find((i: any) => i.dminsttCd === AGENCY_CODE);
            if (match) {
                console.log('✅ SUCCESS! Found Target Agency Item.');
                console.log(`- Title: ${match.bidNtceNm}`);
            } else {
                console.log('❌ Failed. Items found but NONE match target agency.');
                console.log(`- Sample: [${items[0].dminsttCd}] ${items[0].dminsttNm}`);
            }
        } else {
            console.log('⚠️ No items returned (Filter might be too strict or wrong).');
        }

    } catch (e: any) {
        console.error('Error:', e.message);
    }
}

(async () => {
    // 1. instCd
    await testParam('instCd', AGENCY_CODE);
    // 2. ntceInsttCd
    await testParam('ntceInsttCd', AGENCY_CODE);
    // 3. dminsttNm
    await testParam('dminsttNm', AGENCY_NAME);
    // 4. dminsttNm (Part)
    await testParam('dminsttNm', '국토지리정보원');
})();
