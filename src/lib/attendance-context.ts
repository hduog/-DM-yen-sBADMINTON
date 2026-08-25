import { Session } from "@/lib/models";
import {
  combineVNDateTime,
  formatVNDate,
  getSessionAttendanceDetail,
  getSessionGuestDetail,
  vnNow,
} from "@/lib/session-actions";

const WINDOW_DAYS = 5;

function startOfVNDateUTC(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

// Buổi "tham chiếu" cho chatbot: buổi gần "bây giờ" nhất theo thời gian thực, có thể là buổi vừa
// diễn ra gần nhất hoặc buổi sắp diễn ra gần nhất — khác findCurrentSessionForMainGroup (chỉ nhìn
// về tương lai, dùng cho các lệnh điểm danh /thamgia, /vang...).
async function findReferenceSession() {
  const todayUTC = startOfVNDateUTC(vnNow());
  const [past, upcoming] = await Promise.all([
    Session.findOne({ date: { $lte: todayUTC } }).sort({ date: -1, start_time: -1 }),
    Session.findOne({ date: { $gte: todayUTC } }).sort({ date: 1, start_time: 1 }),
  ]);

  if (!past) return upcoming;
  if (!upcoming) return past;

  const now = new Date();
  const pastDiff = Math.abs(now.getTime() - combineVNDateTime(past.date, past.start_time).getTime());
  const upcomingDiff = Math.abs(
    combineVNDateTime(upcoming.date, upcoming.start_time).getTime() - now.getTime()
  );
  return pastDiff <= upcomingDiff ? past : upcoming;
}

// Đóng gói dữ liệu điểm danh/buổi tập/khách vãng lai trong khoảng ±5 ngày quanh buổi tham chiếu
// thành 1 object JSON gọn nhẹ, CHỈ tồn tại trong bộ nhớ của request — dùng làm context cho Gemini
// trả lời câu hỏi khi bot bị mention (xem handleBotMentionQuestion trong webhook/route.ts). Không
// ghi ra đĩa/DB.
export async function buildAttendanceContext(): Promise<string | null> {
  const referenceSession = await findReferenceSession();
  if (!referenceSession) return null;

  const refDateUTC = startOfVNDateUTC(referenceSession.date);
  const windowStart = new Date(refDateUTC);
  windowStart.setUTCDate(windowStart.getUTCDate() - WINDOW_DAYS);
  const windowEnd = new Date(refDateUTC);
  windowEnd.setUTCDate(windowEnd.getUTCDate() + WINDOW_DAYS);

  const sessions = await Session.find({
    date: { $gte: windowStart, $lte: windowEnd },
  }).sort({ date: 1, start_time: 1 });

  const sessionSummaries = await Promise.all(
    sessions.map(async (session) => {
      const [detail, guestDetail] = await Promise.all([
        getSessionAttendanceDetail(session._id.toString()),
        getSessionGuestDetail(session._id.toString()),
      ]);

      return {
        date: formatVNDate(session.date),
        start_time: session.start_time,
        end_time: session.end_time,
        status: session.status,
        settled: Boolean(session.cost_settled_at),
        present: detail.list.filter((m) => m.answer === "present").map((m) => m.full_name),
        absent: detail.list
          .filter((m) => m.answer === "absent")
          .map((m) => ({ name: m.full_name, reason: m.reason ?? null })),
        no_response_count: detail.noResponseCount,
        guests: guestDetail.totalQuantity > 0 ? guestDetail.label : null,
      };
    })
  );

  return JSON.stringify({
    reference_session_date: formatVNDate(referenceSession.date),
    generated_at: new Date().toISOString(),
    sessions: sessionSummaries,
  });
}
