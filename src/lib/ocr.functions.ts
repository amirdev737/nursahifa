import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GEMINI_MODEL = "gemini-2.5-flash";

// ---------- OCR.Space ----------
async function runOcrSpace(base64: string, mimeType: string): Promise<string> {
  const apiKey = process.env.OCR_SPACE_API_KEY;
  if (!apiKey) throw new Error("OCR_SPACE_API_KEY sozlanmagan");

  const form = new FormData();
  form.append("language", "eng");
  form.append("isOverlayRequired", "false");
  form.append("OCREngine", "2");
  form.append("scale", "true");
  form.append("detectOrientation", "true");
  form.append("base64Image", `data:${mimeType || "image/jpeg"};base64,${base64}`);

  const resp = await fetch("https://api.ocr.space/parse/image", {
    method: "POST",
    headers: { apikey: apiKey },
    body: form,
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    console.error("OCR.Space error", resp.status, errText.slice(0, 500));
    if (resp.status === 401 || resp.status === 403) throw new Error("OCR.Space kaliti noto'g'ri");
    throw new Error(`OCR xizmati xatosi (${resp.status})`);
  }

  const data: any = await resp.json();
  if (data?.IsErroredOnProcessing) {
    const msg = Array.isArray(data?.ErrorMessage) ? data.ErrorMessage.join("; ") : String(data?.ErrorMessage ?? "OCR xatosi");
    console.error("OCR.Space processing error", msg);
    throw new Error(msg || "OCR matnni o'qiy olmadi");
  }

  const results = Array.isArray(data?.ParsedResults) ? data.ParsedResults : [];
  const text = results.map((r: any) => r?.ParsedText ?? "").join("\n").trim();
  return text;
}


function tokenizeEnglishWords(text: string): string[] {
  const cleaned = text.replace(/[^A-Za-z'\-\s]/g, " ").toLowerCase();
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const stop = new Set([
    "the","a","an","is","are","was","were","be","been","being","am","of","to","in","on","at","by","for","with",
    "and","or","but","not","no","yes","if","then","else","so","as","this","that","these","those","it","its",
    "i","you","he","she","we","they","me","him","her","us","them","my","your","his","their","our",
    "do","does","did","have","has","had","will","would","should","could","can","may","might","must",
    "there","here","up","down","out","over","under","again","just","than","too","very","also","from","into",
  ]);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokens) {
    const w = t.replace(/^[-']+|[-']+$/g, "");
    if (!w || w.length < 3 || w.length > 30) continue;
    if (!/^[a-z][a-z\-']*$/.test(w)) continue;
    if (stop.has(w)) continue;
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(w);
    if (out.length >= 40) break;
  }
  return out;
}

// ---------- Gemini batch translate ----------
async function callGemini(body: unknown): Promise<any> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_AI_API_KEY sozlanmagan");
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!resp.ok) {
    const t = await resp.text();
    console.error("Gemini error", resp.status, t.slice(0, 500));
    if (resp.status === 429) throw new Error("AI limiti tugadi. Birozdan keyin urinib ko'ring.");
    throw new Error("AI xizmati xatosi");
  }
  return resp.json();
}

function extractText(json: any): string {
  const parts = json?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((p: any) => p?.text ?? "").join("").trim();
}

function parseJsonLoose(text: string): any | null {
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try { return JSON.parse(cleaned); } catch {
    const m = cleaned.match(/[\[{][\s\S]*[\]}]/);
    if (m) { try { return JSON.parse(m[0]); } catch { return null; } }
    return null;
  }
}

// ---------- Step 1: OCR only (extract words for review) ----------
export const extractWordsFromImageOCR = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { imageDataUrl: string }) => {
    if (!data?.imageDataUrl || typeof data.imageDataUrl !== "string") throw new Error("Rasm kerak");
    if (!data.imageDataUrl.startsWith("data:image/")) throw new Error("Noto'g'ri rasm formati");
    if (data.imageDataUrl.length > 8_000_000) throw new Error("Rasm juda katta (max ~6MB)");
    return { imageDataUrl: data.imageDataUrl };
  })
  .handler(async ({ data }) => {
    const match = data.imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) throw new Error("Noto'g'ri rasm ma'lumoti");
    const mimeType = match[1];
    const base64 = match[2];

    const rawText = await runHuggingFaceOCR(base64, mimeType);
    const words = tokenizeEnglishWords(rawText);
    if (words.length === 0) throw new Error("Rasmdan inglizcha so'z topilmadi");
    return { words };
  });

// ---------- Step 2: Translate reviewed words + save ----------
export const generateFromWordList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { words: string[] }) => {
    if (!Array.isArray(data?.words)) throw new Error("So'zlar ro'yxati kerak");
    const cleaned = data.words
      .map((w) => String(w).trim().toLowerCase())
      .filter((w) => w.length >= 2 && w.length <= 40 && /^[a-z][a-z\-'\s]*$/.test(w))
      .slice(0, 40);
    if (cleaned.length === 0) throw new Error("Yaroqli so'z topilmadi");
    return { words: Array.from(new Set(cleaned)) };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const geminiJson = await callGemini({
      systemInstruction: {
        parts: [{
          text: "You are an English-to-Uzbek vocabulary tutor. For each English word provided, return the Uzbek translation and one simple English example sentence (max 12 words). Respond ONLY with valid JSON array.",
        }],
      },
      contents: [{
        role: "user",
        parts: [{ text: `Words: ${JSON.stringify(data.words)}\n\nReturn a JSON array with one object per word.` }],
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              word: { type: "STRING" },
              translation_uz: { type: "STRING" },
              example: { type: "STRING" },
            },
            required: ["word", "translation_uz", "example"],
          },
        },
        temperature: 0.4,
      },
    });

    const parsed = parseJsonLoose(extractText(geminiJson));
    const items: Array<{ word: string; translation_uz: string; example: string }> =
      Array.isArray(parsed) ? parsed.filter((r: any) => r?.word && r?.translation_uz && r?.example) : [];

    if (items.length === 0) throw new Error("AI hech qanday natija qaytarmadi");

    const rows = items.slice(0, 40).map((r) => ({
      user_id: userId,
      word: String(r.word).trim().toLowerCase(),
      translation_uz: String(r.translation_uz).trim(),
      example: String(r.example).trim(),
      ipa: "",
      example_uz: "",
      explanation: "",
      synonyms: [] as string[],
      antonyms: [] as string[],
      status: "ready",
    }));

    const { error } = await supabase.from("words").insert(rows);
    if (error) throw new Error(error.message);

    return { inserted: rows.length, words: rows.map((r) => r.word) };
  });
