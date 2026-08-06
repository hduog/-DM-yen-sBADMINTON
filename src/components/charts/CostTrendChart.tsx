"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatVND } from "./chart-utils";

const LINE_COLOR = "#2a78d6";
const GRID_COLOR = "#e1e0d9";
const AXIS_COLOR = "#898781";

function formatMonthLabel(month: string) {
  const [year, m] = month.split("-");
  return `${m}/${year}`;
}

export default function CostTrendChart({ data }: { data: { month: string; total: number }[] }) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-zinc-400">Chưa có dữ liệu chi phí theo tháng.</p>;
  }

  const chartData = data.map((d) => ({ ...d, label: formatMonthLabel(d.month) }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID_COLOR} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: AXIS_COLOR, fontSize: 12 }}
          axisLine={{ stroke: GRID_COLOR }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: AXIS_COLOR, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={48}
          tickFormatter={(value: number) => (value >= 1000 ? `${Math.round(value / 1000)}k` : `${value}`)}
        />
        <Tooltip
          formatter={(value) => [formatVND(Number(value)), "Chi phí"]}
          labelStyle={{ color: "#0b0b0b" }}
          contentStyle={{ borderRadius: 8, borderColor: GRID_COLOR, fontSize: 12 }}
        />
        <Line
          type="monotone"
          dataKey="total"
          stroke={LINE_COLOR}
          strokeWidth={2}
          dot={{ r: 4, fill: LINE_COLOR, strokeWidth: 2, stroke: "#fff" }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
