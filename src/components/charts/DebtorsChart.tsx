"use client";

import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatVND } from "./chart-utils";

const BAR_COLOR = "#2a78d6";

export default function DebtorsChart({
  data,
  emptyMessage = "Không có thành viên nào còn nợ tiền.",
  tooltipLabel = "Còn nợ",
}: {
  data: { name: string; amount: number }[];
  emptyMessage?: string;
  tooltipLabel?: string;
}) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-zinc-400">{emptyMessage}</p>;
  }

  const height = Math.max(data.length * 36, 120);

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
          formatter={(value) => [formatVND(Number(value)), tooltipLabel]}
          contentStyle={{ borderRadius: 8, fontSize: 12 }}
        />
        <Bar dataKey="amount" fill={BAR_COLOR} radius={[0, 4, 4, 0]} maxBarSize={24}>
          <LabelList
            dataKey="amount"
            position="right"
            formatter={(value) => formatVND(Number(value))}
            style={{ fill: "#52514e", fontSize: 11 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
