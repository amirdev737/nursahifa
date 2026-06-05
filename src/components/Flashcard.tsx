import { Volume2, Heart, Sparkles, RotateCcw } from "lucide-react";
import { useCallback, useState, useEffect } from "react";

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
  startWithUz = false,
}: {
  card: WordCard;
  onToggleFavorite?: (id: string, value: boolean) => void;
  startWithUz?: boolean;
}) {
  const [flipped, setFlipped] = useState(false);
  useEffect(() => setFlipped(false), [card.id, startWithUz]);

  const speak = useCallback((text: string, lang = "en-US") => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  }, []);

  // front side language depends on startWithUz; flipping shows the other side
  const showingUz = startWithUz ? !flipped : flipped;
  const frontWord = showingUz ? (card.translation_uz ?? card.word) : card.word;

  return (
    <article className="snap-start-always relative flex h-[calc(100dvh-72px)] w-full items-center justify-center px-3 py-2">
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        className="group relative flex h-full w-full max-w-md flex-col overflow-hidden rounded-[2rem] bg-gradient-card p-5 text-left text-white shadow-glow ring-1 ring-[var(--brand-2)]/30 animate-float-up"
      >
        <div className="absolute inset-0 bg-mesh opacity-50 pointer-events-none" />

        <div className="relative flex items-start justify-between">
          <span className="rounded-full bg-[var(--brand-2)]/25 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--brand-2)] backdrop-blur">
            {showingUz ? "O'zbekcha" : "Inglizcha"}
          </span>
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white/70 backdrop-blur">
              <RotateCcw className="h-4 w-4" />
            </span>
            <span
              onClick={(e) => { e.stopPropagation(); onToggleFavorite?.(card.id, !card.is_favorite); }}
              className="grid h-9 w-9 place-items-center rounded-full bg-white/15 backdrop-blur transition hover:bg-white/25"
              aria-label="Saqlash"
            >
              <Heart className={`h-4 w-4 ${card.is_favorite ? "fill-[var(--brand-2)] text-[var(--brand-2)]" : ""}`} />
            </span>
          </div>
        </div>

        {/* Hero word */}
        <div className="relative mt-3 flex flex-col items-center justify-center text-center">
          <h1 className="text-[clamp(2rem,9vw,3.25rem)] font-extrabold leading-tight tracking-tight break-words">
            {frontWord}
          </h1>
          {!showingUz && card.ipa && (
            <p className="mt-1 text-xs text-white/70 font-mono">/{card.ipa.replace(/^\/|\/$/g, "")}/</p>
          )}
          <span
            onClick={(e) => { e.stopPropagation(); speak(card.word); }}
            className="mt-2 inline-flex items-center gap-2 rounded-full bg-[var(--brand-2)]/25 px-3 py-1.5 text-xs font-semibold text-[var(--brand-2)] backdrop-blur"
          >
            <Volume2 className="h-3.5 w-3.5" /> Talaffuz
          </span>
        </div>

        {/* Reveal hint or content */}
        {!flipped ? (
          <div className="relative mt-auto pt-3 text-center text-xs text-white/60">
            Kartochkani ko'rish uchun bosing
          </div>
        ) : (
          <div className="relative mt-3 flex-1 min-h-0 flex flex-col gap-2 text-[13px]">
            <div className="rounded-2xl bg-white/10 p-3 backdrop-blur text-center">
              <p className="text-[10px] uppercase tracking-wider text-white/60">{showingUz ? "Inglizcha" : "O'zbekcha"}</p>
              <p className="mt-0.5 text-lg font-bold text-[var(--brand-2)] break-words">
                {showingUz ? card.word : (card.translation_uz ?? "—")}
              </p>
            </div>

            {card.example && (
              <div className="rounded-2xl bg-white/10 p-3 backdrop-blur">
                <p className="italic leading-snug line-clamp-2">"{card.example}"</p>
                {card.example_uz && <p className="mt-1 text-white/80 line-clamp-2">— {card.example_uz}</p>}
              </div>
            )}

            {card.explanation && (
              <div className="flex gap-2 rounded-2xl bg-white/10 p-3 backdrop-blur">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--brand-2)]" />
                <p className="leading-snug line-clamp-3 text-white/95">{card.explanation}</p>
              </div>
            )}

            {(card.synonyms?.length || card.antonyms?.length) ? (
              <div className="grid grid-cols-2 gap-2">
                {card.synonyms?.length ? (
                  <div className="rounded-xl bg-white/10 p-2 backdrop-blur">
                    <p className="text-[9px] uppercase tracking-wider text-white/60">Sinonim</p>
                    <p className="mt-0.5 text-xs font-medium truncate">{card.synonyms.slice(0, 3).join(", ")}</p>
                  </div>
                ) : null}
                {card.antonyms?.length ? (
                  <div className="rounded-xl bg-white/10 p-2 backdrop-blur">
                    <p className="text-[9px] uppercase tracking-wider text-white/60">Antonim</p>
                    <p className="mt-0.5 text-xs font-medium truncate">{card.antonyms.slice(0, 3).join(", ")}</p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </button>
    </article>
  );
}
