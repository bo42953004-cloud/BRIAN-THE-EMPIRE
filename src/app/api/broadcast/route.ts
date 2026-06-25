import { NextResponse } from "next/server";

interface Body {
  telegram?: { botToken: string; chatId: string; html: string } | null;
  webhook?: { url: string; secret: string; text: string } | null;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function sendTelegram(
  botToken: string,
  chatId: string,
  html: string
): Promise<{ ok: boolean; error?: string; code?: number }> {
  try {
    if (!botToken || !chatId) return { ok: false, error: "missing token or chat id" };

    // IMPORTANT: do NOT URL-encode the bot token. Telegram expects the raw token
    // in the path like: /bot123456:ABC-DEF.../sendMessage
    // Encoding ":" -> "%3A" causes 404 / Not Found.
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    let data: any = {};
    try {
      data = await res.json();
    } catch {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `Telegram returned non-JSON (status ${res.status}): ${text.slice(0, 200)}`, code: res.status };
    }

    if (!res.ok || !data.ok) {
      // Translate common Telegram errors into human-friendly messages.
      const desc: string = data?.description || `HTTP ${res.status}`;
      let hint = desc;
      if (/Unauthorized/i.test(desc)) {
        hint = "Bot token is invalid or revoked. Get a fresh token from @BotFather.";
      } else if (/chat not found/i.test(desc)) {
        hint = "Chat ID not found. Make sure: (1) the bot is added to the group/channel, (2) for channels the bot is admin, (3) the chat ID is correct (negative number for groups/channels, or @username for public channels).";
      } else if (/can't parse entities/i.test(desc) || /can't parse HTML/i.test(desc)) {
        hint = "Message contains invalid HTML formatting. " + desc;
      } else if (/bot was blocked/i.test(desc)) {
        hint = "The bot was blocked by this user. Unblock the bot and try again.";
      } else if (/not enough rights/i.test(desc) || /have no rights/i.test(desc)) {
        hint = "The bot doesn't have permission to post in this chat. Make sure it's admin with 'Post Messages' permission.";
      }
      return { ok: false, error: hint, code: res.status };
    }

    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: `Network error: ${e?.message || "unknown"}` };
  }
}

async function sendWebhook(
  url: string,
  secret: string,
  text: string
): Promise<{ ok: boolean; error?: string; code?: number }> {
  try {
    if (!url) return { ok: false, error: "missing webhook url" };
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (secret) headers["X-Webhook-Secret"] = secret;
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        text,
        message: text,
        source: "empiretrader",
        timestamp: new Date().toISOString(),
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, error: `Webhook ${res.status}: ${t.slice(0, 200)}`, code: res.status };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: `Network error: ${e?.message || "unknown"}` };
  }
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const result: {
    telegram?: { ok: boolean; error?: string; code?: number };
    webhook?: { ok: boolean; error?: string; code?: number };
  } = {};

  const tasks: Promise<void>[] = [];

  if (body.telegram?.botToken && body.telegram.chatId) {
    tasks.push(
      sendTelegram(body.telegram.botToken, body.telegram.chatId, body.telegram.html).then((r) => {
        result.telegram = r;
      })
    );
  }
  if (body.webhook?.url) {
    tasks.push(
      sendWebhook(body.webhook.url, body.webhook.secret, body.webhook.text).then((r) => {
        result.webhook = r;
      })
    );
  }

  await Promise.all(tasks);

  const anyFailed =
    (result.telegram && !result.telegram.ok) || (result.webhook && !result.webhook.ok);
  const anyOk = (result.telegram && result.telegram.ok) || (result.webhook && result.webhook.ok);

  return NextResponse.json(result, { status: anyFailed && !anyOk ? 502 : 200 });
}
