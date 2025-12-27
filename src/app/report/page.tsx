
import { supabase } from '@/lib/supabase';
import ReportView from '@/app/components/ReportView';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function ReportPage() {
    // Fetch last ~60 days to handle month view comfortably
    const d = new Date();
    d.setDate(d.getDate() - 60);
    const limitDate = d.toISOString();

    const { data } = await supabase
        .from('g2b_bids')
        .select('*')
        .gte('date', limitDate) // Filter older data at DB level
        .order('date', { ascending: false });

    const bids = data || [];

    return (
        <main className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-6xl mx-auto">
                <header className="mb-8 flex justify-between items-center">
                    <div>
                        <Link href="/" className="text-sm text-gray-500 hover:text-blue-600 mb-2 inline-block">
                            &larr; 대시보드로 돌아가기
                        </Link>
                        <h1 className="text-3xl font-bold text-gray-900">기관별 발주 보고서</h1>
                        <p className="text-gray-500 mt-1">주간/월간 통계 및 리스트</p>
                    </div>
                </header>

                <ReportView bids={bids} />
            </div>
        </main>
    );
}
