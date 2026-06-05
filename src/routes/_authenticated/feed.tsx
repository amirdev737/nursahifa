import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Flashcard, type WordCard } from "@/components/Flashcard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toast } from "sonner";
import { Loader2, Plus, Sparkles, Shuffle, Check, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/feed")({
  head: () => ({ meta: [{ title: "Lenta — VocabFlow" }] }),
  component: Feed,
});

const CARDS_PER_CHUNK = 5;

type FeedItem =
  | { kind: "card"; key: string; card: WordCard; startWithUz: boolean }
  | { kind: "quiz"; key: string; correct: WordCard; choices: string[] };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function Feed() {
  const [cards, setCards] = useState<WordCard[] | null>(null);
  const [mixed, setMixed] = useState(false);
  const [unlockedChunks, setUnlockedChunks] = useState(1);
  const [solvedQuizzes, setSolvedQuizzes] = useState<Set<number>>(new Set());
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase
      .from("words")
      .select("id,word,translation_uz,ipa,example,example_uz,explanation,synonyms,antonyms,is_favorite")
      .eq("status", "ready")
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        setCards((data as WordCard[]) ?? []);
      });
  }, []);

  const toggleFav = useCallback(async (id: string, value: boolean) => {
    setCards((prev) => prev?.map((c) => (c.id === id ? { ...c, is_favorite: value } : c)) ?? null);
    const { error } = await supabase.from("words").update({ is_favorite: value }).eq("id", id);
    if (error) toast.error(error.message);
  }, []);

  // Build the visible queue: for each unlocked chunk, 5 cards + 1 quiz (if user has enough words)
  const items = useMemo<FeedItem[]>(() => {
    if (!cards || cards.length === 0) return [];
    const out: FeedItem[] = [];
    const eligible = cards.filter((c) => c.translation_uz);
    const canQuiz = eligible.length >= 4;
    // Stable random order of eligible words across chunks so each quiz uses a different word
    const order = seededShuffle(eligible.map((_, i) => i), mulberry32(sessionSeed));
    for (let chunk = 0; chunk < unlockedChunks; chunk++) {
      for (let i = 0; i < CARDS_PER_CHUNK; i++) {
        const idx = (chunk * CARDS_PER_CHUNK + i) % cards.length;
        const card = cards[idx];
        out.push({
          kind: "card",
          key: `c-${chunk}-${i}-${card.id}`,
          card,
          startWithUz: mixed ? ((chunk * 7 + i * 3) % 2 === 0) : false,
        });
      }
      if (canQuiz) {
        const safeCorrect = eligible[order[chunk % order.length]];
        const rand = mulberry32(sessionSeed + chunk * 1013904223 + 1664525);
        const distractorPool = eligible.filter((c) => c.id !== safeCorrect.id);
        const distractors = seededShuffle(distractorPool, rand).slice(0, 3).map((c) => c.translation_uz!);
        const choices = seededShuffle([safeCorrect.translation_uz!, ...distractors], rand);
        out.push({ kind: "quiz", key: `q-${chunk}-${safeCorrect.id}`, correct: safeCorrect, choices });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, unlockedChunks, mixed]);

  const onSolveQuiz = useCallback((chunk: number) => {
    setSolvedQuizzes((prev) => {
      const n = new Set(prev);
      n.add(chunk);
      return n;
    });
    setUnlockedChunks((c) => c + 1);
    // smooth scroll to next card
    setTimeout(() => {
      const el = scrollerRef.current;
      if (!el) return;
      el.scrollBy({ top: el.clientHeight, behavior: "smooth" });
    }, 350);
  }, []);

  if (cards === null) {
    return (
      <div className="flex h-[calc(100dvh-72px)] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="flex h-[calc(100dvh-72px)] flex-col items-center justify-center px-6 text-center bg-mesh">
        <div className="grid h-16 w-16 place-items-center rounded-3xl bg-gradient-brand shadow-glow">
          <Sparkles className="h-8 w-8 text-white" />
        </div>
        <h2 className="mt-6 text-2xl font-bold">Lenta hozircha bo'sh</h2>
        <p className="mt-2 max-w-xs text-sm text-muted-foreground">
          Birinchi inglizcha so'zlaringizni qo'shing — biz chiroyli kartochkalar tayyorlab beramiz.
        </p>
        <Link
          to="/add"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-brand px-6 py-3 text-sm font-semibold text-white shadow-glow"
        >
          <Plus className="h-4 w-4" /> Birinchi so'zni qo'shish
        </Link>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="fixed right-4 top-4 z-40 flex items-center gap-2">
        <button
          onClick={() => setMixed((m) => !m)}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold backdrop-blur transition border ${
            mixed
              ? "bg-[var(--brand-2)]/90 text-[oklch(0.18_0.05_260)] border-[var(--brand-2)]"
              : "bg-background/70 text-foreground border-border"
          }`}
          aria-label="Aralashtirish"
        >
          <Shuffle className="h-3.5 w-3.5" /> {mixed ? "Aralash" : "EN"}
        </button>
        <ThemeToggle />
      </div>

      <div ref={scrollerRef} className="scroll-snap-y no-scrollbar h-[calc(100dvh-72px)] overflow-y-auto">
        {items.map((it, idx) => {
          if (it.kind === "card") {
            return <Flashcard key={it.key} card={it.card} onToggleFavorite={toggleFav} startWithUz={it.startWithUz} />;
          }
          const chunk = Math.floor(idx / (CARDS_PER_CHUNK + 1));
          const solved = solvedQuizzes.has(chunk);
          return (
            <QuizGate
              key={it.key}
              data={it}
              solved={solved}
              onSolve={() => onSolveQuiz(chunk)}
            />
          );
        })}
      </div>
    </div>
  );
}

function QuizGate({
  data,
  solved,
  onSolve,
}: {
  data: Extract<FeedItem, { kind: "quiz" }>;
  solved: boolean;
  onSolve: () => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [wrong, setWrong] = useState<Set<string>>(new Set());

  const handle = (choice: string) => {
    if (solved) return;
    if (choice === data.correct.translation_uz) {
      setPicked(choice);
      setTimeout(onSolve, 600);
    } else {
      setWrong((w) => new Set(w).add(choice));
    }
  };

  return (
    <article
      className="snap-start-always relative flex h-[calc(100dvh-72px)] w-full items-center justify-center px-4 py-2"
      style={{ scrollSnapStop: "always" }}
    >
      <div className="flex h-full w-full max-w-md flex-col rounded-[2rem] bg-gradient-to-br from-[oklch(0.18_0.05_260)] via-[oklch(0.22_0.08_260)] to-[oklch(0.13_0.04_260)] p-5 text-white shadow-glow ring-2 ring-[var(--brand-2)]/40">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-[var(--brand-2)]/25 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--brand-2)]">
            ⚡ Mini test
          </span>
          {solved && <Check className="h-5 w-5 text-[var(--brand-2)]" />}
        </div>
        <p className="mt-6 text-center text-xs uppercase tracking-wider text-white/60">Tarjimani toping</p>
        <h2 className="mt-2 text-center text-4xl font-extrabold tracking-tight">{data.correct.word}</h2>
        {data.correct.ipa && (
          <p className="mt-1 text-center text-xs text-white/60 font-mono">/{data.correct.ipa.replace(/^\/|\/$/g, "")}/</p>
        )}

        <div className="mt-6 grid gap-2.5">
          {data.choices.map((choice) => {
            const isCorrect = (solved || picked) && choice === data.correct.translation_uz;
            const isWrong = wrong.has(choice);
            return (
              <button
                key={choice}
                onClick={() => handle(choice)}
                disabled={solved || isWrong}
                className={`flex items-center justify-between rounded-2xl border px-4 py-3.5 text-left text-sm font-semibold transition
                  ${isCorrect ? "border-[var(--brand-2)] bg-[var(--brand-2)]/20 text-[var(--brand-2)]" : ""}
                  ${isWrong ? "border-destructive/60 bg-destructive/15 text-destructive/90 opacity-60" : ""}
                  ${!isCorrect && !isWrong ? "border-white/15 bg-white/5 hover:bg-white/10 active:scale-[0.99]" : ""}
                `}
              >
                <span>{choice}</span>
                {isCorrect && <Check className="h-4 w-4" />}
                {isWrong && <X className="h-4 w-4" />}
              </button>
            );
          })}
        </div>

        <p className="mt-auto pt-4 text-center text-[11px] text-white/55">
          {solved ? "Davom etish uchun pastga suring" : "To'g'ri javobni topmaguningizcha davom eta olmaysiz"}
        </p>
      </div>
    </article>
  );
}
