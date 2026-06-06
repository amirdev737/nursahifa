import { Volume2, Heart, Sparkles } from "lucide-react";
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

  const showingUz = startWithUz ? !flipped : flipped;
  const frontWord = showingUz ? (card.translation_uz ?? card.word) : card.word;

  const handleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    if ("vibrate" in navigator) navigator.vibrate?.(15);
    onToggleFavorite?.(card.id, !card.is_favorite);
  };

  return (
    <article className="snap-start-always relative flex h-[calc(100dvh-72px)] w-full items-center justify-center px-3 py-2">
      <button
        type="button"
        onClick={() => { if ("vibrate" in navigator) navigator.vibrate?.(8); setFlipped((f) => !f); }}
        className="group relative flex h-full w-full max-w-md flex-col overflow-hidden rounded-[2rem] glass-card p-4 text-left text-white animate-float-up active:scale-[0.99] transition-transform"
      >
        <div className="absolute inset-0 bg-mesh opacity-30 pointer-events-none" />

        <div className="relative flex items-start justify-between">
          <span className="glass-chip rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--brand-2)]">
            {showingUz ? "O'zbekcha" : "Inglizcha"}
          </span>
          <span
            onClick={handleFavorite}
            className="grid h-10 w-10 place-items-center rounded-full glass-chip transition active:scale-75 hover:scale-110"
            aria-label="Saqlash"
          >
            <Heart className={`h-4 w-4 transition ${card.is_favorite ? "fill-[var(--brand-2)] text-[var(--brand-2)] scale-110" : ""}`} />
          </span>
        </div>

        {/* Hero word */}
        <div className="relative mt-3 flex flex-col items-center justify-center text-center shrink-0">
          <h1 className="text-[clamp(1.6rem,7.5vw,2.6rem)] font-extrabold leading-tight tracking-tight break-words">
            {frontWord}
          </h1>
          {!showingUz && card.ipa && (
            <p className="mt-0.5 text-[11px] text-white/70 font-mono">/{card.ipa.replace(/^\/|\/$/g, "")}/</p>
          )}
          <span
            onClick={(e) => { e.stopPropagation(); if ("vibrate" in navigator) navigator.vibrate?.(8); speak(card.word); }}
            className="mt-1.5 inline-flex items-center gap-1.5 rounded-full glass-chip px-2.5 py-1 text-[11px] font-semibold text-[var(--brand-2)] active:scale-90 transition"
          >
            <Volume2 className="h-3 w-3" /> Talaffuz
          </span>
        </div>

        {!flipped ? (
          <div className="relative mt-auto pt-3 text-center text-[11px] text-white/60">
            Kartochkani ko'rish uchun bosing
          </div>
        ) : (
          <div className="relative mt-2 flex-1 min-h-0 overflow-hidden flex flex-col gap-1.5 text-[12px]">
            <div className="rounded-2xl glass-inner p-2.5 text-center shrink-0">
              <p className="text-[9px] uppercase tracking-wider text-white/60">{showingUz ? "Inglizcha" : "O'zbekcha"}</p>
              <p className="mt-0.5 text-[clamp(1rem,4.5vw,1.25rem)] font-bold text-[var(--brand-2)] break-words leading-tight">
                {showingUz ? card.word : (card.translation_uz ?? "—")}
              </p>
            </div>

            {card.example && (
              <div className="rounded-2xl glass-inner p-2.5 shrink">
                <p className="italic leading-snug line-clamp-2 text-[12px]">"{card.example}"</p>
                {card.example_uz && <p className="mt-0.5 text-white/80 line-clamp-2 text-[11px]">— {card.example_uz}</p>}
              </div>
            )}

            {card.explanation && (
              <div className="flex gap-1.5 rounded-2xl glass-inner p-2.5 shrink min-h-0">
                <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-[var(--brand-2)]" />
                <p className="leading-snug line-clamp-3 text-[12px] text-white/95">{card.explanation}</p>
              </div>
            )}

            {(card.synonyms?.length || card.antonyms?.length) ? (
              <div className="grid grid-cols-2 gap-1.5 shrink-0">
                {card.synonyms?.length ? (
                  <div className="rounded-xl glass-inner p-2 min-w-0">
                    <p className="text-[9px] uppercase tracking-wider text-white/60">Sinonim</p>
                    <p className="mt-0.5 text-[11px] font-medium line-clamp-2 break-words">{card.synonyms.slice(0, 3).join(", ")}</p>
                  </div>
                ) : null}
                {card.antonyms?.length ? (
                  <div className="rounded-xl glass-inner p-2 min-w-0">
                    <p className="text-[9px] uppercase tracking-wider text-white/60">Antonim</p>
                    <p className="mt-0.5 text-[11px] font-medium line-clamp-2 break-words">{card.antonyms.slice(0, 3).join(", ")}</p>
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
