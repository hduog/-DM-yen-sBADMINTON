const API_KEY = process.env.GEMINI_API_KEY;
// gemini-2.0-flash đã bị Google khai tử (API trả 404 kèm gợi ý model thay thế) — dùng
// gemini-3.6-flash làm mặc định, vẫn đổi được qua GEMINI_MODEL mà không cần sửa code.
const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

const SYSTEM_PROMPT = [
  'Em là trợ lý ảo thân thiện, dễ thương của câu lạc bộ, xưng "em", gọi người hỏi là "anh/chị".',
  "Nhiệm vụ chính: dựa vào dữ liệu điểm danh/buổi tập/thành viên (JSON) được cung cấp để trả lời các câu hỏi",
  "liên quan đến quản lý CLB (điểm danh, buổi tập, chi phí, thành viên...).",
  "Ngoài ra em cũng có thể trả lời các câu hỏi về chấn thương thể thao và hồi phục sau tập luyện.",
  "Với các chủ đề khác không liên quan đến CLB hoặc thể thao/chấn thương/hồi phục, em không cần đi sâu trả lời.",
  "Luôn trả lời ngắn gọn, tối đa khoảng 100 chữ, có dùng icon/emoji thân thiện,",
  "chỉ giải đáp thẳng vào câu hỏi — không hỏi lại thêm thông tin.",
].join(" ");

// Ngưỡng cắt phòng hờ nếu model lỡ trả lời dài hơn hướng dẫn trong system prompt.
const MAX_ANSWER_LENGTH = 600;

// Gọi thẳng REST API của Gemini bằng fetch (theo đúng style src/lib/telegram.ts) — dự án không
// dùng SDK nào khác nên không thêm dependency @google/generative-ai.
export async function askGemini(question: string, contextJson: string | null): Promise<string> {
  if (!API_KEY) throw new Error("Missing GEMINI_API_KEY environment variable");

  const userContent = [
    contextJson
      ? `DỮ LIỆU ĐIỂM DANH (JSON):\n${contextJson}`
      : "DỮ LIỆU ĐIỂM DANH: (chưa có buổi tập nào trong hệ thống)",
    "",
    `Câu hỏi: ${question}`,
  ].join("\n");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userContent }] }],
        // gemini-3.6-flash mặc định bật "thinking", tính cả token suy luận vào maxOutputTokens —
        // nếu để 200 thì model bị cắt ngay giữa lúc suy luận, trả về mỗi phần "thought" dở dang
        // (VD "**Persona & Constraints:**") thay vì câu trả lời thật. Tắt thinking vì tác vụ chỉ
        // là hỏi-đáp ngắn, không cần suy luận nhiều bước.
        generationConfig: { maxOutputTokens: 700, thinkingConfig: { thinkingBudget: 0 } },
      }),
    }
  );

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Gemini API error: ${data?.error?.message ?? res.statusText}`);
  }

  const parts = data?.candidates?.[0]?.content?.parts as
    | Array<{ text?: string; thought?: boolean }>
    | undefined;
  // Phòng hờ model vẫn trả kèm phần "thought" dù đã tắt thinkingBudget — chỉ lấy phần text thật.
  const text = parts
    ?.filter((p) => !p.thought && p.text)
    .map((p) => p.text)
    .join("")
    .trim();
  if (!text) throw new Error("Gemini API trả về response không có nội dung");

  const trimmed = text.trim();
  return trimmed.length > MAX_ANSWER_LENGTH ? `${trimmed.slice(0, MAX_ANSWER_LENGTH)}…` : trimmed;
}
