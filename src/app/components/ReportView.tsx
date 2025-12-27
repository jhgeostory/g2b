
'use client';

import { useState } from 'react';

interface Bid {
    bid_no: string;
    title: string;
    url: string;
    date: string; // YYYY-MM-DD HH:MM:SS
    agency: string;
    type: string;
}

interface ReportViewProps {
    bids: Bid[];
}

export default function ReportView({ bids }: ReportViewProps) {
    const [period, setPeriod] = useState<'week' | 'month'>('week');

    const today = new Date();
    const oneWeekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    const filterDate = period === 'week' ? oneWeekAgo : oneMonthAgo;

    // Filter by date
    const periodBids = bids.filter(b => new Date(b.date) >= filterDate);

    // Group by Agency
    const grouped = periodBids.reduce((acc, bid) => {
        const agency = bid.agency || 'Unknown';
        if (!acc[agency]) acc[agency] = [];
        acc[agency].push(bid);
        return acc;
    }, {} as Record<string, Bid[]>);

    // Stats
    const totalCount = periodBids.length;
    const agencyStats = Object.keys(grouped).map(agency => ({
        name: agency,
        count: grouped[agency].length
    }));

    return (
        <div className="space-y-6">
            {/* Controls */}
            <div className="flex justify-center p-1 bg-gray-100 rounded-lg w-fit mx-auto">
                <button
                    onClick={() => setPeriod('week')}
                    className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${period === 'week'
                            ? 'bg-white text-blue-600 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                        }`}
                >
                    주간 (Weekly)
                </button>
                <button
                    onClick={() => setPeriod('month')}
                    className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${period === 'month'
                            ? 'bg-white text-blue-600 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                        }`}
                >
                    월간 (Monthly)
                </button>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                    <p className="text-sm text-blue-600 font-medium">총 발주 건수</p>
                    <p className="text-3xl font-bold text-blue-900 mt-1">{totalCount}</p>
                </div>
                {agencyStats.map(stat => (
                    <div key={stat.name} className="bg-white p-4 rounded-xl border border-gray-200">
                        <p className="text-sm text-gray-500 font-medium truncate" title={stat.name}>{stat.name}</p>
                        <p className="text-2xl font-bold text-gray-900 mt-1">{stat.count}</p>
                    </div>
                ))}
            </div>

            {/* Grouped Tables */}
            <div className="space-y-8">
                {Object.keys(grouped).map(agency => (
                    <div key={agency} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                            <h3 className="font-bold text-lg text-gray-800">{agency}</h3>
                            <span className="bg-gray-200 text-gray-700 text-xs px-2 py-1 rounded-full">{grouped[agency].length}건</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b">
                                    <tr>
                                        <th className="px-6 py-3">날짜</th>
                                        <th className="px-6 py-3">공고명</th>
                                        <th className="px-6 py-3">구분</th>
                                        <th className="px-6 py-3">링크</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {grouped[agency].map(bid => (
                                        <tr key={bid.bid_no} className="hover:bg-gray-50">
                                            <td className="px-6 py-3 font-mono text-gray-600 whitespace-nowrap">
                                                {bid.date.substring(0, 10)}
                                            </td>
                                            <td className="px-6 py-3 font-medium text-gray-900">
                                                {bid.title}
                                                <div className="text-xs text-gray-400">{bid.bid_no}</div>
                                            </td>
                                            <td className="px-6 py-3">
                                                <span className={`px-2 py-1 rounded-full text-xs ${bid.type === 'service' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                                                    }`}>
                                                    {bid.type === 'service' ? '용역' : '물품'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3">
                                                <a href={bid.url} target="_blank" className="text-blue-600 hover:underline">이동</a>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ))}
                {Object.keys(grouped).length === 0 && (
                    <div className="text-center py-12 text-gray-400">
                        해당 기간에 조회된 데이터가 없습니다.
                    </div>
                )}
            </div>
        </div>
    );
}
