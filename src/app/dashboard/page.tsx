import Link from "next/link";
import { connectDB } from "@/lib/mongodb";
import { Attendance, Member, MonthlyStatement, Session, SessionCost } from "@/lib/models";
import { getSettings } from "@/lib/models/Settings";
import { combineVNDateTime, getSessionCostUnits, shiftMonth, vnNow } from "@/lib/session-actions";
import { getCurrentMonthCostBreakdown, getMonthlyCostTrend, getTopDebtors } from "@/lib/dashboard-stats";
import CostTrendChart from "@/components/charts/CostTrendChart";
import CostBreakdownChart from "@/components/charts/CostBreakdownChart";
import DebtorsChart from "@/components/charts/DebtorsChart";

const WEEKDAY_LABEL = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

const SESSION_STATUS_LABEL: Record<string, string> = {
  scheduled: "Đang chờ điểm danh",
  confirmed_enough: "Đã đủ người",
  confirmed_shortage: "Thiếu người",
  cancelled: "Đã huỷ",
};

function formatSessionDate(date: Date) {
  return `${WEEKDAY_LABEL[date.getUTCDay()]}, ${date.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
  })}`;
}

// Đếm số buổi tập dự kiến trong khoảng [start, end) dựa theo weekly_schedule, không phụ thuộc
// Session đã được cron tạo hay chưa — dùng để tính "Tổng số buổi" & chi phí cố định dự kiến.
function countScheduledSessions(
  weeklySchedule: { weekday: number }[],
  start: Date,
  end: Date
) {
  const weekdayCounts = new Map<number, number>();
  const cursor = new Date(start);
  while (cursor.getTime() < end.getTime()) {
    const wd = cursor.getUTCDay();
    weekdayCounts.set(wd, (weekdayCounts.get(wd) ?? 0) + 1);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return weeklySchedule.reduce((sum, entry) => sum + (weekdayCounts.get(entry.weekday) ?? 0), 0);
}

function formatVNDateTime(date: Date) {
  return date.toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });
}

export default async function DashboardHome() {
  await connectDB();

  const settings = await getSettings();
  const now = new Date();
  const vnToday = vnNow();
  const todayUTC = new Date(Date.UTC(vnToday.getUTCFullYear(), vnToday.getUTCMonth(), vnToday.getUTCDate()));
  const monthStart = new Date(Date.UTC(vnToday.getUTCFullYear(), vnToday.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(vnToday.getUTCFullYear(), vnToday.getUTCMonth() + 1, 1));

  // Kỳ sao kê sắp tới: ngày chốt tiếp theo là lần xuất hiện gần nhất của monthly_settlement_day,
  // và kỳ được chốt vào ngày đó luôn là tháng liền trước ngày chốt — xem runDueMonthlySettlement.
  let settlementMonth = vnToday.getUTCMonth();
  let settlementYear = vnToday.getUTCFullYear();
  if (vnToday.getUTCDate() > settings.monthly_settlement_day) {
    settlementMonth += 1;
  }
  let nextSettlementDate = new Date(Date.UTC(settlementYear, settlementMonth, settings.monthly_settlement_day));
  let nextSettlementMonthStr = `${nextSettlementDate.getUTCFullYear()}-${String(
    nextSettlementDate.getUTCMonth() + 1
  ).padStart(2, "0")}`;
  let settlementTargetMonth = shiftMonth(nextSettlementMonthStr, -1);
  if (settings.last_monthly_settlement_run === settlementTargetMonth) {
    nextSettlementDate = new Date(
      Date.UTC(nextSettlementDate.getUTCFullYear(), nextSettlementDate.getUTCMonth() + 1, settings.monthly_settlement_day)
    );
    nextSettlementMonthStr = `${nextSettlementDate.getUTCFullYear()}-${String(
      nextSettlementDate.getUTCMonth() + 1
    ).padStart(2, "0")}`;
    settlementTargetMonth = shiftMonth(nextSettlementMonthStr, -1);
  }
  const [settlementTargetYear, settlementTargetMonthNum] = settlementTargetMonth.split("-").map(Number);
  const settlementTargetStart = new Date(Date.UTC(settlementTargetYear, settlementTargetMonthNum - 1, 1));
  const settlementTargetEnd = new Date(Date.UTC(settlementTargetYear, settlementTargetMonthNum, 1));
  const daysUntilSettlement = Math.round(
    (nextSettlementDate.getTime() - todayUTC.getTime()) / (24 * 60 * 60 * 1000)
  );

  const [allFromTodaySessions, monthSessions, totalMembers, adminCount, pendingStatements, settlementTargetSessions] =
    await Promise.all([
      Session.find({ date: { $gte: todayUTC } }).sort({ date: 1, start_time: 1 }),
      Session.find({ date: { $gte: monthStart, $lt: monthEnd } }),
      Member.countDocuments({ del_flag: { $ne: true } }),
      Member.countDocuments({ del_flag: { $ne: true }, role: "admin" }),
      MonthlyStatement.countDocuments({ status: { $in: ["pending", "paid_reported"] } }),
      Session.find({ date: { $gte: settlementTargetStart, $lt: settlementTargetEnd } }),
    ]);

  const [monthlyCostTrend, costBreakdown, topDebtors] = await Promise.all([
    getMonthlyCostTrend(6),
    getCurrentMonthCostBreakdown(),
    getTopDebtors(8),
  ]);

  const settlementConfirmedSessions = settlementTargetSessions.filter(
    (s) => s.status === "confirmed_enough" || s.status === "confirmed_shortage"
  );
  const settlementCosts = settlementConfirmedSessions.length
    ? await SessionCost.find({ session_id: { $in: settlementConfirmedSessions.map((s) => s._id) } })
    : [];
  const settlementTotalCost =
    settlementCosts.reduce((sum, c) => sum + c.total_amount, 0) +
    settlementConfirmedSessions.length * (settings.fixed_cost_per_session ?? 0);

  const fromTodaySessions = allFromTodaySessions.filter((s) => s.status !== "cancelled");

  const upcoming = fromTodaySessions.filter(
    (s) => combineVNDateTime(s.date, s.start_time).getTime() > now.getTime()
  );
  const nextSession = upcoming[0] ?? null;

  // Buổi tập chưa được cron tạo thành Session thật (chưa chạy cron, hoặc còn quá xa) —
  // suy ra trực tiếp từ weekly_schedule để mục "4 buổi sắp tới" luôn phản ánh đúng lịch đã cấu hình.
  const occupiedKeys = new Set(
    allFromTodaySessions.map((s) => `${s.date.toISOString().slice(0, 10)}_${s.start_time}`)
  );
  const computedUpcoming: { key: string; date: Date; start_time: string; end_time: string }[] = [];
  const todayWeekday = todayUTC.getUTCDay();
  for (const entry of settings.weekly_schedule) {
    const daysUntilFirst = (entry.weekday - todayWeekday + 7) % 7;
    for (let week = 0; week < 8; week++) {
      const date = new Date(
        Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), todayUTC.getUTCDate() + daysUntilFirst + week * 7)
      );
      const key = `${date.toISOString().slice(0, 10)}_${entry.start_time}`;
      if (occupiedKeys.has(key)) continue;
      if (combineVNDateTime(date, entry.start_time).getTime() <= now.getTime()) continue;
      computedUpcoming.push({ key, date, start_time: entry.start_time, end_time: entry.end_time });
    }
  }

  const next4 = [
    ...upcoming.map((s) => ({ key: s._id.toString(), date: s.date, start_time: s.start_time, end_time: s.end_time })),
    ...computedUpcoming,
  ]
    .sort(
      (a, b) => combineVNDateTime(a.date, a.start_time).getTime() - combineVNDateTime(b.date, b.start_time).getTime()
    )
    .slice(0, 4);

  const ongoing =
    fromTodaySessions.find((s) => {
      const start = combineVNDateTime(s.date, s.start_time).getTime();
      const end = combineVNDateTime(s.date, s.end_time).getTime();
      return now.getTime() >= start && now.getTime() <= end;
    }) ?? null;

  const monthStats = {
    total: countScheduledSessions(settings.weekly_schedule, monthStart, monthEnd),
    enough: monthSessions.filter((s) => s.status === "confirmed_enough").length,
    shortage: monthSessions.filter((s) => s.status === "confirmed_shortage").length,
    cancelled: monthSessions.filter((s) => s.status === "cancelled").length,
  };
  const monthExpectedFixedCost = monthStats.total * (settings.fixed_cost_per_session ?? 0);

  // Buổi tập cần hiển thị trạng thái điểm danh: ưu tiên buổi đang diễn ra, nếu không thì buổi sắp tới gần nhất.
  const statusSession = ongoing ?? nextSession;
  const [statusPresentCount, statusAbsentCount, statusCostUnits] = statusSession
    ? await Promise.all([
        Attendance.countDocuments({ session_id: statusSession._id, answer: "present" }),
        Attendance.countDocuments({ session_id: statusSession._id, answer: "absent" }),
        getSessionCostUnits(statusSession._id.toString()),
      ])
    : [0, 0, { totalUnits: 0 }];
  const statusRespondedCount = statusPresentCount + statusAbsentCount;
  const statusNoResponseCount = Math.max(totalMembers - statusRespondedCount, 0);
  // Số lượng tham gia thật của buổi tập tính cả khách vãng lai, không chỉ member điểm danh "Có".
  const statusHeadcount = statusCostUnits.totalUnits;

  const statusNoticeStartAt = statusSession ? combineVNDateTime(statusSession.date, statusSession.start_time) : null;
  const statusNoticeDueAt =
    statusSession && !statusSession.notify_sent_at
      ? new Date(statusNoticeStartAt!.getTime() - settings.reminder_hours_before * 60 * 60 * 1000)
      : null;

  // Nếu chưa có Session thật nào (cron chưa tạo), vẫn hiển thị buổi gần nhất suy ra từ lịch để biết "sắp diễn ra".
  const fallbackUpcoming = !statusSession ? next4[0] ?? null : null;

  return (
    <div className="flex flex-col gap-4">
      {settings.weekly_schedule.length === 0 ? (
        <Link
          href="/dashboard/settings"
          className="block rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-center text-sm font-medium text-zinc-600 hover:bg-zinc-100"
        >
          Chưa cấu hình lịch tập hàng tuần — bấm để thiết lập
        </Link>
      ) : (
        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-zinc-700">Buổi sắp tới</h2>
          {next4.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-400">Chưa có buổi tập nào sắp tới.</p>
          ) : (
            <div className="mt-2 flex flex-col gap-1.5">
              {next4.map((s) => (
                <div
                  key={s.key}
                  className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-sm"
                >
                  <span>{formatSessionDate(s.date)}</span>
                  <span className="text-zinc-500">
                    {s.start_time}-{s.end_time}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {statusSession ? (
        <section
          className={`rounded-xl border p-4 ${
            ongoing ? "border-emerald-200 bg-emerald-50" : "border-zinc-200 bg-white"
          }`}
        >
          <div className="flex items-center justify-between">
            <h2 className={`text-sm font-semibold ${ongoing ? "text-emerald-700" : "text-zinc-700"}`}>
              {ongoing ? "Đang diễn ra" : "Sắp diễn ra"}
            </h2>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                ongoing ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-600"
              }`}
            >
              {SESSION_STATUS_LABEL[statusSession.status] ?? statusSession.status}
            </span>
          </div>
          <p className={`mt-1 text-sm ${ongoing ? "text-emerald-800" : "text-zinc-600"}`}>
            {formatSessionDate(statusSession.date)} · {statusSession.start_time}-{statusSession.end_time}
          </p>

          <div className="mt-3 flex flex-col gap-1 text-sm">
            <p>
              Số lượng tham gia: <span className="font-semibold">{statusHeadcount}</span>/
              {statusSession.min_required}
              {statusHeadcount > statusPresentCount && (
                <span className="text-xs text-zinc-400"> (gồm {statusHeadcount - statusPresentCount} khách vãng lai)</span>
              )}
            </p>
            <p className="text-zinc-600">
              Có mặt: <span className="font-medium text-emerald-700">{statusPresentCount}</span> · Vắng:{" "}
              <span className="font-medium text-red-600">{statusAbsentCount}</span> · Chưa phản hồi:{" "}
              <span className="font-medium text-zinc-500">{statusNoResponseCount}</span>
            </p>
          </div>

          <p className="mt-2 text-xs text-zinc-500">
            {statusSession.notify_sent_at
              ? `Đã gửi thông báo điểm danh lúc ${formatVNDateTime(statusSession.notify_sent_at)}`
              : `Chưa gửi thông báo điểm danh (dự kiến gửi lúc ${formatVNDateTime(statusNoticeDueAt!)})`}
          </p>
        </section>
      ) : (
        fallbackUpcoming && (
          <section className="rounded-xl border border-zinc-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-zinc-700">Sắp diễn ra</h2>
            <p className="mt-1 text-sm text-zinc-600">
              {formatSessionDate(fallbackUpcoming.date)} · {fallbackUpcoming.start_time}-{fallbackUpcoming.end_time}
            </p>
            <p className="mt-2 text-xs text-zinc-400">
              Buổi tập chưa được hệ thống tạo tự động nên chưa có thông tin điểm danh.
            </p>
          </section>
        )
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold text-zinc-700">Buổi tập tháng này</h2>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Tổng số buổi" value={monthStats.total} />
          <StatCard label="Đủ người" value={monthStats.enough} />
          <StatCard label="Thiếu người" value={monthStats.shortage} />
          <StatCard label="Đã huỷ" value={monthStats.cancelled} />
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Chi phí cố định dự kiến: <span className="font-medium text-zinc-700">{monthExpectedFixedCost.toLocaleString("vi-VN")}đ</span>{" "}
          ({monthStats.total} buổi × {(settings.fixed_cost_per_session ?? 0).toLocaleString("vi-VN")}đ)
        </p>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-700">Kỳ sao kê sắp tới</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Kỳ tháng {settlementTargetMonthNum}/{settlementTargetYear} · Chốt vào{" "}
          {nextSettlementDate.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })}{" "}
          {daysUntilSettlement === 0 ? "(hôm nay)" : `(còn ${daysUntilSettlement} ngày)`}
        </p>
        <div className="mt-3 flex flex-col gap-1 text-sm text-zinc-600">
          <p>
            Buổi đã điểm danh: <span className="font-semibold">{settlementConfirmedSessions.length}</span>/
            {settlementTargetSessions.length}
          </p>
          <p>
            Tạm tính chi phí: <span className="font-semibold">{settlementTotalCost.toLocaleString("vi-VN")}đ</span>
          </p>
        </div>
      </section>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-zinc-700">Tài chính</h2>
        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <h3 className="text-xs font-medium text-zinc-500">Xu hướng chi phí theo tháng</h3>
          <div className="mt-2">
            <CostTrendChart data={monthlyCostTrend} />
          </div>
        </section>
        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <h3 className="text-xs font-medium text-zinc-500">Cơ cấu chi phí tháng này</h3>
          <div className="mt-2">
            <CostBreakdownChart data={costBreakdown} />
          </div>
        </section>
        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <h3 className="text-xs font-medium text-zinc-500">Top thành viên còn nợ tiền</h3>
          <div className="mt-2">
            <DebtorsChart data={topDebtors} />
          </div>
        </section>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-zinc-700">Thành viên</h2>
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Tổng cộng" value={totalMembers} />
          <StatCard label="Admin" value={adminCount} />
          <StatCard label="Member" value={totalMembers - adminCount} />
        </div>
      </div>

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
