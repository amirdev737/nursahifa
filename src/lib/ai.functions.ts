import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type GeneratedWord = {
  word: string;
  translation_uz: string;
  ipa: string;
  example: string;
  example_uz: string;
  explanation: string;
  synonyms: string[];
  antonyms: string[];
};

const SYSTEM_PROMPT = `You are an English-to-Uzbek vocabulary tutor. For a given English word, return concise structured data: an Uzbek translation, IPA pronunciation, a short English example sentence (max 14 words), an Uzbek translation of that exact example sentence, a one-sentence beginner-friendly explanation in Uzbek, plus up to 3 synonyms and 3 antonyms (English). Be accurate and natural. Respond ONLY with valid JSON, no markdown fences.`;

const GEMINI_MODEL = "gemini-2.5-flash";

async function callGemini(body: unknown): Promise<any> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_AI_API_KEY not configured");

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!resp.ok) {
    const text = await resp.text();
    console.error("Gemini error", resp.status, text);
    if (resp.status === 429) throw new Error("So'rovlar limiti tugadi. Birozdan keyin urinib ko'ring.");
    if (resp.status === 401 || resp.status === 403) throw new Error("Google AI API kalit noto'g'ri yoki ruxsat yo'q.");
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
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch { return null; }
    }
    return null;
  }
}

export const generateWordData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { words: string[] }) => {
    if (!data?.words || !Array.isArray(data.words)) throw new Error("words required");
    const cleaned = data.words
      .map((w) => String(w).trim().toLowerCase())
      .filter((w) => w.length > 0 && w.length < 50 && /^[a-z][a-z\- ']*$/i.test(w))
      .slice(0, 25);
    if (cleaned.length === 0) throw new Error("No valid words");
    return { words: cleaned };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const results: GeneratedWord[] = [];

    const responseSchema = {
      type: "OBJECT",
      properties: {
        translation_uz: { type: "STRING" },
        ipa: { type: "STRING" },
        example: { type: "STRING" },
        example_uz: { type: "STRING" },
        explanation: { type: "STRING" },
        synonyms: { type: "ARRAY", items: { type: "STRING" } },
        antonyms: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["translation_uz", "ipa", "example", "example_uz", "explanation", "synonyms", "antonyms"],
    };

    for (const word of data.words) {
      try {
        const json = await callGemini({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: `Word: "${word}"` }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema,
            temperature: 0.7,
          },
        });
        const parsed = parseJsonLoose(extractText(json));
        if (!parsed) continue;
        results.push({ word, ...parsed });
      } catch (err) {
        console.error("word failed", word, err);
        continue;
      }
    }

    if (results.length === 0) throw new Error("AI hech qanday natija qaytarmadi");

    const rows = results.map((r) => ({
      user_id: userId,
      word: r.word,
      translation_uz: r.translation_uz,
      ipa: r.ipa,
      example: r.example,
      example_uz: r.example_uz,
      explanation: r.explanation,
      synonyms: r.synonyms?.slice(0, 5) ?? [],
      antonyms: r.antonyms?.slice(0, 5) ?? [],
      status: "ready",
    }));

    const { error } = await supabase.from("words").insert(rows);
    if (error) throw new Error(error.message);

    return { inserted: rows.length };
  });

export const extractWordsFromImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { imageDataUrl: string }) => {
    if (!data?.imageDataUrl || typeof data.imageDataUrl !== "string") throw new Error("image required");
    if (!data.imageDataUrl.startsWith("data:image/")) throw new Error("Invalid image format");
    if (data.imageDataUrl.length > 8_000_000) throw new Error("Rasm juda katta (max ~6MB)");
    return { imageDataUrl: data.imageDataUrl };
  })
  .handler(async ({ data }) => {
    const match = data.imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) throw new Error("Invalid image data URL");
    const mimeType = match[1];
    const base64 = match[2];

    const json = await callGemini({
      systemInstruction: {
        parts: [{
          text: "You extract English vocabulary words from images (handwritten notes, textbook pages, photos). Return ONLY meaningful English words/short phrases the user wants to learn. Skip articles, numbers, gibberish. Lowercase, deduplicated. Respond as JSON.",
        }],
      },
      contents: [{
        role: "user",
        parts: [
          { text: "List the English vocabulary words shown in this image." },
          { inlineData: { mimeType, data: base64 } },
        ],
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: { words: { type: "ARRAY", items: { type: "STRING" } } },
          required: ["words"],
        },
      },
    });

    const parsed = parseJsonLoose(extractText(json));
    const raw: string[] = Array.isArray(parsed?.words)
      ? parsed.words
          .map((w: unknown) => String(w).trim().toLowerCase())
          .filter((w: string) => w.length > 0 && w.length < 50 && /^[a-z][a-z\- ']*$/i.test(w))
      : [];
    const words: string[] = Array.from(new Set(raw)).slice(0, 25);
    return { words };
  });
