import { supabase } from '@/lib/supabase';

// Force dynamic rendering to fetch fresh data on every request
export const dynamic = 'force-dynamic';

interface Announcement {
  id: string;
  title: string;
  link: string;
  date: string;
  agency: string;
  status: string;
  is_sent: boolean;
  created_at: string;
}

export default async function Home() {
  const { data } = await supabase
    .from('announcements')
    .select('*')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100);

  const announcements = (data as Announcement[]) || [];

  // Calculate stats
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '/');
  const newTodayCount = announcements.filter(a => a.date >= today).length;

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">G2B 발주 모니터링</h1>
            <p className="text-gray-500 mt-2">국토교통부 국토지리정보원 (코드: 1613436)</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 flex gap-6">
            <div className="text-center">
              <p className="text-sm text-gray-500">총 수집</p>
              <p className="text-2xl font-bold text-blue-600">{announcements.length}</p>
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
                  <th className="px-6 py-4">상태</th>
                  <th className="px-6 py-4">링크</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {announcements.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                      수집된 데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  announcements.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-mono text-gray-900">{item.date}</td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{item.title}</div>
                        <div className="text-xs text-gray-400 mt-1">{item.id}</div>
                      </td>
                      <td className="px-6 py-4">{item.agency}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${item.is_sent
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-yellow-100 text-yellow-800'
                            }`}
                        >
                          {item.is_sent ? '알림전송됨' : '미전송'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <a
                          href={item.link}
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
