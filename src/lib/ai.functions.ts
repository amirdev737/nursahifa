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

const SYSTEM_PROMPT = `You are an English-to-Uzbek vocabulary tutor. For a given English word, return concise structured data: an Uzbek translation, IPA pronunciation, a short English example sentence (max 14 words), an Uzbek translation of that exact example sentence, a one-sentence beginner-friendly explanation in Uzbek, plus up to 3 synonyms and 3 antonyms (English). Be accurate and natural.`;

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
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const { supabase, userId } = context;
    const results: GeneratedWord[] = [];

    for (const word of data.words) {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: `Word: "${word}"` },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "save_word",
                description: "Save vocabulary card data",
                parameters: {
                  type: "object",
                  properties: {
                    translation_uz: { type: "string" },
                    ipa: { type: "string" },
                    example: { type: "string" },
                    example_uz: { type: "string" },
                    explanation: { type: "string" },
                    synonyms: { type: "array", items: { type: "string" } },
                    antonyms: { type: "array", items: { type: "string" } },
                  },
                  required: ["translation_uz", "ipa", "example", "example_uz", "explanation", "synonyms", "antonyms"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "save_word" } },
        }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        if (resp.status === 429) throw new Error("So'rovlar limiti tugadi. Birozdan keyin urinib ko'ring.");
        if (resp.status === 402) throw new Error("AI kreditlar tugadi. Workspace sozlamalaridan to'ldiring.");
        console.error("AI gateway error", resp.status, text);
        continue;
      }
      const json = await resp.json();
      const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!args) continue;
      try {
        const parsed = JSON.parse(args);
        results.push({ word, ...parsed });
      } catch {
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
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You extract English vocabulary words from images (handwritten notes, textbook pages, photos). Return ONLY meaningful English words/short phrases the user wants to learn. Skip articles, numbers, gibberish. Lowercase, deduplicated.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "List the English vocabulary words shown in this image." },
              { type: "image_url", image_url: { url: data.imageDataUrl } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_words",
              description: "Return extracted English vocabulary words",
              parameters: {
                type: "object",
                properties: { words: { type: "array", items: { type: "string" } } },
                required: ["words"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_words" } },
      }),
    });

    if (!resp.ok) {
      if (resp.status === 429) throw new Error("So'rovlar limiti tugadi. Birozdan keyin urinib ko'ring.");
      if (resp.status === 402) throw new Error("AI kreditlar tugadi.");
      throw new Error("Rasmni o'qib bo'lmadi");
    }
    const json = await resp.json();
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return { words: [] as string[] };
    try {
      const parsed = JSON.parse(args);
      const words = Array.isArray(parsed.words)
        ? parsed.words
            .map((w: unknown) => String(w).trim().toLowerCase())
            .filter((w: string) => w.length > 0 && w.length < 50 && /^[a-z][a-z\- ']*$/i.test(w))
        : [];
      return { words: Array.from(new Set(words)).slice(0, 25) };
    } catch {
      return { words: [] as string[] };
    }
  });
