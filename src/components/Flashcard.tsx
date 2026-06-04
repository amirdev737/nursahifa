import { Volume2, Heart, Sparkles } from "lucide-react";
import { useCallback } from "react";

export type WordCard = {
  id: string;
  word: string;
  translation_uz: string | null;
  ipa: string | null;
  example: string | null;
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
  const speak = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(card.word);
    u.lang = "en-US";
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  }, [card.word]);

  return (
    <article className="snap-start-always relative flex h-[100dvh] w-full items-center justify-center px-4 py-6">
      <div className="relative flex h-full w-full max-w-md flex-col overflow-hidden rounded-[2.5rem] bg-gradient-card p-7 text-white shadow-glow animate-float-up">
        <div className="absolute inset-0 bg-mesh opacity-60" />
        <div className="relative flex items-start justify-between">
          <span className="rounded-full bg-white/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider backdrop-blur">
            English
          </span>
          <button
            onClick={() => onToggleFavorite?.(card.id, !card.is_favorite)}
            className="grid h-10 w-10 place-items-center rounded-full bg-white/15 backdrop-blur transition hover:bg-white/25"
            aria-label="Favorite"
          >
            <Heart className={`h-5 w-5 ${card.is_favorite ? "fill-white" : ""}`} />
          </button>
        </div>

        <div className="relative mt-8 flex-1 overflow-y-auto no-scrollbar">
          <div className="flex items-center gap-3">
            <h1 className="text-5xl font-extrabold leading-none tracking-tight">{card.word}</h1>
          </div>
          {card.ipa && <p className="mt-2 text-base text-white/80 font-mono">/{card.ipa.replace(/^\/|\/$/g, "")}/</p>}

          <button
            onClick={speak}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 text-sm font-semibold backdrop-blur transition hover:bg-white/30 animate-pulse-glow"
          >
            <Volume2 className="h-4 w-4" /> Pronounce
          </button>

          {card.translation_uz && (
            <div className="mt-7">
              <p className="text-xs uppercase tracking-wider text-white/60">Uzbek</p>
              <p className="mt-1 text-2xl font-bold">{card.translation_uz}</p>
            </div>
          )}

          {card.example && (
            <div className="mt-6 rounded-2xl bg-white/10 p-4 backdrop-blur">
              <p className="text-xs uppercase tracking-wider text-white/60">Example</p>
              <p className="mt-1 text-base italic">"{card.example}"</p>
            </div>
          )}

          {card.explanation && (
            <div className="mt-4 flex gap-3 rounded-2xl bg-white/10 p-4 backdrop-blur">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-white/80" />
              <p className="text-sm leading-relaxed text-white/95">{card.explanation}</p>
            </div>
          )}

          {(card.synonyms?.length || card.antonyms?.length) ? (
            <div className="mt-4 grid grid-cols-2 gap-3">
              {card.synonyms?.length ? (
                <div className="rounded-2xl bg-white/10 p-3 backdrop-blur">
                  <p className="text-[10px] uppercase tracking-wider text-white/60">Synonyms</p>
                  <p className="mt-1 text-sm font-medium">{card.synonyms.slice(0, 3).join(", ")}</p>
                </div>
              ) : null}
              {card.antonyms?.length ? (
                <div className="rounded-2xl bg-white/10 p-3 backdrop-blur">
                  <p className="text-[10px] uppercase tracking-wider text-white/60">Antonyms</p>
                  <p className="mt-1 text-sm font-medium">{card.antonyms.slice(0, 3).join(", ")}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="h-8" />
        </div>
      </div>
    </article>
  );
}
