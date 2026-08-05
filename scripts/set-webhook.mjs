// Chạy: node --env-file=.env.local scripts/set-webhook.mjs
// Đăng ký webhook Telegram trỏ về NEXT_PUBLIC_APP_URL/api/telegram/webhook — xem mục 1.4 thiết kế.

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL;
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!BOT_TOKEN || !APP_URL) {
  console.error("Thiếu TELEGRAM_BOT_TOKEN hoặc NEXT_PUBLIC_APP_URL trong .env.local");
  process.exit(1);
}

const webhookUrl = `${APP_URL.replace(/\/$/, "")}/api/telegram/webhook`;

const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url: webhookUrl,
    ...(SECRET ? { secret_token: SECRET } : {}),
    allowed_updates: ["message", "poll_answer", "callback_query"],
  }),
});

const data = await res.json();
console.log(data.ok ? `✅ Webhook đã trỏ về ${webhookUrl}` : "❌ Lỗi:", data);
