"use client";

import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatVND } from "./chart-utils";

// Thứ tự cố định theo bảng màu categorical — không sinh thêm màu ngoài danh sách này.
const CATEGORICAL_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"];

export default function CostBreakdownChart({ data }: { data: { name: string; value: number }[] }) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-400">Chưa có buổi nào được quyết toán trong tháng này.</p>
    );
  }

  const height = Math.max(data.length * 40, 120);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, left: 0, bottom: 4 }} barCategoryGap={10}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="name"
          width={110}
          tick={{ fill: "#0b0b0b", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          formatter={(value) => [formatVND(Number(value)), "Chi phí"]}
          contentStyle={{ borderRadius: 8, fontSize: 12 }}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={24}>
          {data.map((entry, index) => (
            <Cell key={entry.name} fill={CATEGORICAL_COLORS[index % CATEGORICAL_COLORS.length]} />
          ))}
          <LabelList
            dataKey="value"
            position="right"
            formatter={(value) => formatVND(Number(value))}
            style={{ fill: "#52514e", fontSize: 11 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
