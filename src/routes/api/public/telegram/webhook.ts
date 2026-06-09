import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "node:crypto";

const WEB_APP_URL = "https://vocabflow-scroll.lovable.app";
const GEMINI_MODEL = "gemini-2.5-flash";

const SYSTEM_PROMPT =
  "Siz 'NurSahifa' loyihasining aqlli AI yordamchisiz. Foydalanuvchilarga ingliz tilini o'rganish, so'zlar mazmuni va grammatika bo'yicha qisqa, aniq va motivatsion ruhda o'zbek tilida javob bering. NurSahifa ilovasi haqida savol so'rashsa, u rasm orqali so'zlarni ajratib beruvchi flashcard ilovasi ekanligini eslating.";

const HELP_TEXT =
  "🌟 *NurSahifa yordami*\n\n" +
  "/start — botni ishga tushirish va ilovani ochish\n" +
  "/help — yordam ko'rsatish\n" +
  "/about — loyiha haqida\n\n" +
  "Ixtiyoriy savol yozing — AI yordamchi javob beradi.";

const ABOUT_TEXT =
  "📚 *NurSahifa* — ingliz tilini o'rganish uchun aqlli flashcard ilovasi.\n\n" +
  "• Rasmga olib so'zlarni avtomatik ajratish\n" +
  "• AI tarjima, IPA, misol va izohlar\n" +
  "• Swipe orqali o'rganish, testlar va mini-quiz\n\n" +
  "Telegram ichida to'liq ekranda ochiladi.";

function startKeyboard() {
  return {
    inline_keyboard: [[{ text: "🚀 NurSahifa ilovasini ochish", web_app: { url: WEB_APP_URL } }]],
  };
}

async function tg(token: string, method: string, body: unknown) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) console.error("telegram", method, r.status, await r.text());
}

async function askGemini(apiKey: string, prompt: string): Promise<string> {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 600 },
      }),
    },
  );
  if (!r.ok) {
    console.error("gemini", r.status, await r.text());
    return "Kechirasiz, hozir javob bera olmadim. Birozdan keyin qayta urinib ko'ring.";
  }
  const j: any = await r.json();
  const parts = j?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts) ? parts.map((p: any) => p?.text ?? "").join("").trim() : "";
  return text || "Javob topilmadi.";
}

function deriveSecret(token: string): string {
  return createHash("sha256").update(`telegram-webhook:${token}`).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        const geminiKey = process.env.GOOGLE_AI_API_KEY;
        if (!token) return new Response("bot token missing", { status: 500 });

        const expected = deriveSecret(token);
        const got = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
        if (!safeEqual(got, expected)) return new Response("Unauthorized", { status: 401 });

        const update: any = await request.json().catch(() => null);
        const msg = update?.message ?? update?.edited_message;
        const chatId = msg?.chat?.id;
        const text: string = (msg?.text ?? "").trim();
        if (!chatId) return Response.json({ ok: true });

        const cmd = text.split(/\s+/)[0]?.toLowerCase().replace(/@.*$/, "");

        try {
          if (cmd === "/start") {
            await tg(token, "sendMessage", {
              chat_id: chatId,
              text:
                "👋 Assalomu alaykum! *NurSahifa*ga xush kelibsiz.\n\n" +
                "Ingliz tilini AI yordamida o'rganing — rasmdan so'z ajratish, flashcard, test va swipe rejimi.\n\n" +
                "Quyidagi tugma orqali ilovani oching 👇",
              parse_mode: "Markdown",
              reply_markup: startKeyboard(),
            });
          } else if (cmd === "/help") {
            await tg(token, "sendMessage", { chat_id: chatId, text: HELP_TEXT, parse_mode: "Markdown" });
          } else if (cmd === "/about") {
            await tg(token, "sendMessage", {
              chat_id: chatId,
              text: ABOUT_TEXT,
              parse_mode: "Markdown",
              reply_markup: startKeyboard(),
            });
          } else if (text) {
            if (!geminiKey) {
              await tg(token, "sendMessage", { chat_id: chatId, text: "AI hozircha sozlanmagan." });
            } else {
              await tg(token, "sendChatAction", { chat_id: chatId, action: "typing" });
              const answer = await askGemini(geminiKey, text);
              await tg(token, "sendMessage", { chat_id: chatId, text: answer });
            }
          }
        } catch (e) {
          console.error("handler error", e);
        }

        return Response.json({ ok: true });
      },
    },
  },
});
