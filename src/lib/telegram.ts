const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

function apiUrl(method: string) {
  if (!BOT_TOKEN) throw new Error("Missing TELEGRAM_BOT_TOKEN environment variable");
  return `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
}

async function callApi<T = unknown>(method: string, payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(apiUrl(method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Telegram API ${method} failed: ${data.description ?? res.statusText}`);
  }
  return data.result as T;
}

export function sendMessage(
  chatId: number | string,
  text: string,
  options: Record<string, unknown> = {}
) {
  return callApi<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...options,
  });
}

export function answerCallbackQuery(
  callbackQueryId: string,
  options: Record<string, unknown> = {}
) {
  return callApi("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...options,
  });
}

export function setWebhook(url: string, secretToken?: string) {
  return callApi("setWebhook", {
    url,
    ...(secretToken ? { secret_token: secretToken } : {}),
    allowed_updates: ["message", "callback_query"],
  });
}

export function deleteWebhook() {
  return callApi("deleteWebhook", {});
}

export function getWebhookInfo() {
  return callApi("getWebhookInfo", {});
}
