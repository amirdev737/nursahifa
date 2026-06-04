import { Volume2, Heart, Sparkles } from "lucide-react";
import { useCallback } from "react";

export type WordCard = {
  id: string;
  word: string;
  translation_uz: string | null;
  ipa: string | null;
  example: string | null;
  example_uz: string | null;
  explanation: string | null;
  synonyms: string[] | null;
  antonyms: string[] | null;
  is_favorite: boolean;
};

export function Flashcard({
  card,
  onToggleFavorite,
}: {
  card: WordCard;
  onToggleFavorite?: (id: string, value: boolean) => void;
}) {
  const speak = useCallback((text: string, lang: string = "en-US") => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  }, []);

  return (
    <article className="snap-start-always relative flex h-[calc(100dvh-72px)] w-full items-center justify-center px-4 py-3">
      <div className="relative flex h-full w-full max-w-md flex-col overflow-hidden rounded-[2rem] bg-gradient-card p-6 text-white shadow-glow animate-float-up ring-1 ring-[var(--brand-2)]/30">
        <div className="absolute inset-0 bg-mesh opacity-50" />
        <div className="relative flex items-start justify-between">
          <span className="rounded-full bg-[var(--brand-2)]/25 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--brand-2)] backdrop-blur">
            Inglizcha
          </span>
          <button
            onClick={() => onToggleFavorite?.(card.id, !card.is_favorite)}
            className="grid h-10 w-10 place-items-center rounded-full bg-white/15 backdrop-blur transition hover:bg-white/25"
            aria-label="Saqlash"
          >
            <Heart className={`h-5 w-5 ${card.is_favorite ? "fill-[var(--brand-2)] text-[var(--brand-2)]" : ""}`} />
          </button>
        </div>

        <div className="relative mt-5 flex-1 overflow-y-auto no-scrollbar">
          <h1 className="text-4xl font-extrabold leading-none tracking-tight">{card.word}</h1>
          {card.ipa && <p className="mt-2 text-sm text-white/75 font-mono">/{card.ipa.replace(/^\/|\/$/g, "")}/</p>}

          <button
            onClick={() => speak(card.word)}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-[var(--brand-2)]/25 px-4 py-2 text-sm font-semibold text-[var(--brand-2)] backdrop-blur transition hover:bg-[var(--brand-2)]/40 animate-pulse-glow"
          >
            <Volume2 className="h-4 w-4" /> Talaffuz
          </button>

          {card.translation_uz && (
            <div className="mt-5">
              <p className="text-[10px] uppercase tracking-wider text-white/60">O'zbekcha</p>
              <p className="mt-1 text-2xl font-bold text-[var(--brand-2)]">{card.translation_uz}</p>
            </div>
          )}

          {card.example && (
            <div className="mt-4 rounded-2xl bg-white/10 p-4 backdrop-blur">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-wider text-white/60">Misol</p>
                <button
                  onClick={() => speak(card.example!)}
                  className="grid h-7 w-7 place-items-center rounded-full bg-white/15 transition hover:bg-white/25"
                  aria-label="Misolni eshitish"
                >
                  <Volume2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-1.5 text-[15px] italic leading-snug">"{card.example}"</p>
              {card.example_uz && (
                <p className="mt-1.5 text-sm text-white/80">— {card.example_uz}</p>
              )}
            </div>
          )}

          {card.explanation && (
            <div className="mt-3 flex gap-3 rounded-2xl bg-white/10 p-4 backdrop-blur">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-2)]" />
              <p className="text-sm leading-relaxed text-white/95">{card.explanation}</p>
            </div>
          )}

          {(card.synonyms?.length || card.antonyms?.length) ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
              {card.synonyms?.length ? (
                <div className="rounded-2xl bg-white/10 p-3 backdrop-blur">
                  <p className="text-[10px] uppercase tracking-wider text-white/60">Sinonim</p>
                  <p className="mt-1 text-sm font-medium">{card.synonyms.slice(0, 3).join(", ")}</p>
                </div>
              ) : null}
              {card.antonyms?.length ? (
                <div className="rounded-2xl bg-white/10 p-3 backdrop-blur">
                  <p className="text-[10px] uppercase tracking-wider text-white/60">Antonim</p>
                  <p className="mt-1 text-sm font-medium">{card.antonyms.slice(0, 3).join(", ")}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="h-4" />
        </div>
      </div>
    </article>
  );
}
