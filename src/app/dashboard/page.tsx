import { connectDB } from "@/lib/mongodb";
import { MonthlyStatement, Session } from "@/lib/models";

export default async function DashboardHome() {
  await connectDB();

  const [upcomingCount, pendingStatements] = await Promise.all([
    Session.countDocuments({ status: "scheduled" }),
    MonthlyStatement.countDocuments({ status: { $in: ["pending", "paid_reported"] } }),
  ]);

  return (
    <div className="grid grid-cols-2 gap-3">
      <StatCard label="Buổi tập sắp tới" value={upcomingCount} />
      <StatCard label="Sao kê chờ xử lý" value={pendingStatements} />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-sm text-zinc-500">{label}</p>
    </div>
  );
}
