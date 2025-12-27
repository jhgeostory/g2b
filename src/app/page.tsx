import { supabase } from '@/lib/supabase';
import SyncButton from '@/app/components/SyncButton';
import Link from 'next/link';

// Force dynamic rendering to fetch fresh data on every request
export const dynamic = 'force-dynamic';

interface Bid {
  bid_no: string;
  title: string;
  url: string;
  date: string;
  agency: string;
  type: string;
  created_at: string;
  // end_date, etc. if needed
}

export default async function Home() {
  const { data } = await supabase
    .from('g2b_bids')
    .select('*')
    .order('date', { ascending: false })
    .limit(100);

  const bids = (data as Bid[]) || [];

  // Calculate stats
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '-'); // Format YYYY-MM-DD
  // Check format of bid.date (it is timestamp or text? In scrape/api it was YYYY-MM-DD HH:MM:SS)
  // We'll compare loose string match or date object.
  const newTodayCount = bids.filter(a => a.date && a.date.startsWith(today)).length;

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">G2B 발주 모니터링</h1>
            <div className="flex items-center gap-4 mt-2">
              <p className="text-gray-500 text-sm">대상: 국토지리정보원, 국립해양조사원, 산림청</p>
              <div className="flex gap-2">
                <Link href="/report" className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors">
                  📊 보고서
                </Link>
                <SyncButton />
              </div>
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 flex gap-6">
            <div className="text-center">
              <p className="text-sm text-gray-500">총 수집</p>
              <p className="text-2xl font-bold text-blue-600">{bids.length}</p>
            </div>
            <div className="text-center border-l pl-6">
              <p className="text-sm text-gray-500">오늘 공고</p>
              <p className="text-2xl font-bold text-green-600">{newTodayCount}</p>
            </div>
          </div>
        </header>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 text-xs uppercase font-semibold text-gray-500">
                <tr>
                  <th className="px-6 py-4">진행일자</th>
                  <th className="px-6 py-4">공고명</th>
                  <th className="px-6 py-4">수요기관</th>
                  <th className="px-6 py-4">구분</th>
                  <th className="px-6 py-4">링크</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {bids.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                      수집된 데이터가 없습니다. (테이블: g2b_bids)
                    </td>
                  </tr>
                ) : (
                  bids.map((item) => (
                    <tr key={item.bid_no} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-mono text-gray-900">
                        {item.date ? new Date(item.date).toLocaleString('ko-KR') : '-'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{item.title}</div>
                        <div className="text-xs text-gray-400 mt-1">{item.bid_no}</div>
                      </td>
                      <td className="px-6 py-4">{item.agency}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${item.type === 'service'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-green-100 text-green-800'
                            }`}
                        >
                          {item.type === 'service' ? '용역' : '물품'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          바로가기 &rarr;
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
