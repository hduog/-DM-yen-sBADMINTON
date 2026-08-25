const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

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
        generationConfig: { maxOutputTokens: 200 },
      }),
    }
  );

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Gemini API error: ${data?.error?.message ?? res.statusText}`);
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text as string | undefined;
  if (!text) throw new Error("Gemini API trả về response không có nội dung");

  const trimmed = text.trim();
  return trimmed.length > MAX_ANSWER_LENGTH ? `${trimmed.slice(0, MAX_ANSWER_LENGTH)}…` : trimmed;
}
