'use client';

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoney } from '@/lib/format';

const PALETTE = ['#0f766e', '#b45309', '#7c3aed', '#be123c', '#1d4ed8', '#15803d', '#6b7280'];

export function CategoryChart({ data, currency }: { data: { category: string; total: number }[]; currency: string }) {
  return (
    <div>
      <div className="h-56" role="img" aria-label={`Spending by category: ${data.map((d) => `${d.category} ${formatMoney(d.total, currency)}`).join(', ')}`}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="total" nameKey="category" innerRadius={50} outerRadius={85} paddingAngle={2}>
              {data.map((d, i) => (
                <Cell key={d.category} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v) => formatMoney(Number(v), currency)} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-1 text-xs">
        {data.map((d, i) => (
          <li key={d.category} className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} aria-hidden />
            <span className="capitalize">{d.category}</span>
            <span className="ml-auto font-medium">{formatMoney(d.total, currency)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DailyChart({ data, currency }: { data: { date: string; total: number }[]; currency: string }) {
  const rows = data.map((d) => ({ ...d, label: new Date(d.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) }));
  return (
    <div className="h-64" role="img" aria-label={`Spending by day: ${rows.map((d) => `${d.label} ${formatMoney(d.total, currency)}`).join(', ')}`}>
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#4b5563' }} />
          <YAxis tick={{ fontSize: 12, fill: '#4b5563' }} width={48} />
          <Tooltip formatter={(v) => formatMoney(Number(v), currency)} />
          <Bar dataKey="total" name="Spent" fill="#0f766e" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
