import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type GeneratedWord = {
  word: string;
  translation_uz: string;
  ipa: string;
  example: string;
  explanation: string;
  synonyms: string[];
  antonyms: string[];
};

const SYSTEM_PROMPT = `You are an English-to-Uzbek vocabulary tutor. For a given English word, return concise structured data: an Uzbek translation, IPA pronunciation, a short example sentence (max 14 words), a one-sentence beginner-friendly explanation in English, plus up to 3 synonyms and 3 antonyms. Be accurate and natural.`;

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
                    explanation: { type: "string" },
                    synonyms: { type: "array", items: { type: "string" } },
                    antonyms: { type: "array", items: { type: "string" } },
                  },
                  required: ["translation_uz", "ipa", "example", "explanation", "synonyms", "antonyms"],
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
        if (resp.status === 429) throw new Error("Rate limit reached. Try again shortly.");
        if (resp.status === 402) throw new Error("AI credits exhausted. Add credits in workspace settings.");
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

    if (results.length === 0) throw new Error("AI did not return any usable results");

    const rows = results.map((r) => ({
      user_id: userId,
      word: r.word,
      translation_uz: r.translation_uz,
      ipa: r.ipa,
      example: r.example,
      explanation: r.explanation,
      synonyms: r.synonyms?.slice(0, 5) ?? [],
      antonyms: r.antonyms?.slice(0, 5) ?? [],
      status: "ready",
    }));

    const { error } = await supabase.from("words").insert(rows);
    if (error) throw new Error(error.message);

    return { inserted: rows.length };
  });
