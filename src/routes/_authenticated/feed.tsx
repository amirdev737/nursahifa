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
const POS_KEY = "vf-feed-pos";
const MIX_KEY = "vf-feed-mix";
const SEED_KEY = "vf-feed-seed";

type FeedItem =
  | { kind: "card"; key: string; card: WordCard; startWithUz: boolean }
  | { kind: "quiz"; key: string; correct: WordCard; choices: string[] };

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

// Audio feedback helpers (no asset files needed)
let _audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!_audioCtx) {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return null;
    _audioCtx = new Ctx();
  }
  return _audioCtx;
}
function tone(freq: number, dur = 0.12, type: OscillatorType = "sine", gain = 0.08) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur);
}
const playClick = () => tone(620, 0.06, "triangle", 0.05);
const playCorrect = () => { tone(660, 0.1, "sine", 0.08); setTimeout(() => tone(880, 0.16, "sine", 0.08), 90); };
const playWrong = () => tone(180, 0.18, "square", 0.05);
const vibe = (p: number | number[]) => { if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(p as any); };

function Feed() {
  const [cards, setCards] = useState<WordCard[] | null>(null);
  const [mixed, setMixed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(MIX_KEY) === "1";
  });
  const [unlockedChunks, setUnlockedChunks] = useState(1);
  const [solvedQuizzes, setSolvedQuizzes] = useState<Set<number>>(new Set());
  const scrollerRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef(false);

  // Stable seed per shuffle "session" - rotates when user toggles shuffle
  const [sessionSeed, setSessionSeed] = useState<number>(() => {
    if (typeof window === "undefined") return 1;
    const stored = localStorage.getItem(SEED_KEY);
    if (stored) return parseInt(stored, 10);
    const s = Math.floor(Math.random() * 0x7fffffff);
    localStorage.setItem(SEED_KEY, String(s));
    return s;
  });

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

  // Restore last position
  const savedPos = useMemo(() => {
    if (typeof window === "undefined") return 0;
    return parseInt(localStorage.getItem(POS_KEY) || "0", 10) || 0;
  }, []);
  // Make sure enough chunks are unlocked to reach saved pos
  useEffect(() => {
    if (!cards || cards.length === 0) return;
    const neededChunk = Math.floor(savedPos / (CARDS_PER_CHUNK + 1)) + 1;
    if (neededChunk > unlockedChunks) setUnlockedChunks(neededChunk);
    // assume any quiz prior to saved pos was solved
    const solved = new Set<number>();
    for (let i = 0; i < neededChunk - 1; i++) solved.add(i);
    setSolvedQuizzes(solved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards]);

  const toggleFav = useCallback(async (id: string, value: boolean) => {
    setCards((prev) => prev?.map((c) => (c.id === id ? { ...c, is_favorite: value } : c)) ?? null);
    const { error } = await supabase.from("words").update({ is_favorite: value }).eq("id", id);
    if (error) toast.error(error.message);
  }, []);

  // Build items - infinite by cycling through cards
  const items = useMemo<FeedItem[]>(() => {
    if (!cards || cards.length === 0) return [];
    const out: FeedItem[] = [];
    const eligible = cards.filter((c) => c.translation_uz);
    const canQuiz = eligible.length >= 4;

    // When mixed: shuffle base order of cards using sessionSeed
    const baseRand = mulberry32(sessionSeed);
    const baseOrder = mixed
      ? seededShuffle(cards.map((_, i) => i), baseRand)
      : cards.map((_, i) => i);
    const quizOrder = seededShuffle(eligible.map((_, i) => i), mulberry32(sessionSeed ^ 0x5a5a5a5a));

    for (let chunk = 0; chunk < unlockedChunks; chunk++) {
      for (let i = 0; i < CARDS_PER_CHUNK; i++) {
        const pos = (chunk * CARDS_PER_CHUNK + i) % baseOrder.length;
        const card = cards[baseOrder[pos]];
        // when mixed, randomize starting language per card
        const langRand = mulberry32(sessionSeed + chunk * 73856093 + i * 19349663);
        out.push({
          kind: "card",
          key: `c-${chunk}-${i}-${card.id}`,
          card,
          startWithUz: mixed ? langRand() > 0.5 : false,
        });
      }
      if (canQuiz) {
        const safeCorrect = eligible[quizOrder[chunk % quizOrder.length]];
        const rand = mulberry32(sessionSeed + chunk * 1013904223 + 1664525);
        const distractorPool = eligible.filter((c) => c.id !== safeCorrect.id);
        const distractors = seededShuffle(distractorPool, rand).slice(0, 3).map((c) => c.translation_uz!);
        const choices = seededShuffle([safeCorrect.translation_uz!, ...distractors], rand);
        out.push({ kind: "quiz", key: `q-${chunk}-${safeCorrect.id}`, correct: safeCorrect, choices });
      }
    }
    return out;
  }, [cards, unlockedChunks, mixed, sessionSeed]);

  // Restore scroll position once items are rendered
  useEffect(() => {
    if (restoredRef.current) return;
    if (!cards || cards.length === 0) return;
    const el = scrollerRef.current;
    if (!el) return;
    if (items.length === 0) return;
    const idx = Math.min(savedPos, items.length - 1);
    requestAnimationFrame(() => {
      el.scrollTo({ top: idx * el.clientHeight, behavior: "auto" });
      restoredRef.current = true;
    });
  }, [items, cards, savedPos]);

  // Save scroll position
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const idx = Math.round(el.scrollTop / el.clientHeight);
        try { localStorage.setItem(POS_KEY, String(idx)); } catch {}
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => { el.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [cards]);

  const onSolveQuiz = useCallback((chunk: number) => {
    setSolvedQuizzes((prev) => {
      const n = new Set(prev);
      n.add(chunk);
      return n;
    });
    setUnlockedChunks((c) => Math.max(c, chunk + 2));
    setTimeout(() => {
      const el = scrollerRef.current;
      if (!el) return;
      el.scrollBy({ top: el.clientHeight, behavior: "smooth" });
    }, 400);
  }, []);

  const toggleShuffle = () => {
    vibe(12);
    playClick();
    setMixed((m) => {
      const next = !m;
      try { localStorage.setItem(MIX_KEY, next ? "1" : "0"); } catch {}
      return next;
    });
    // new seed -> shuffles card order and languages again
    const s = Math.floor(Math.random() * 0x7fffffff);
    try { localStorage.setItem(SEED_KEY, String(s)); } catch {}
    setSessionSeed(s);
  };

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
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-brand px-6 py-3 text-sm font-semibold text-white shadow-glow active:scale-95 transition"
        >
          <Plus className="h-4 w-4" /> Birinchi so'zni qo'shish
        </Link>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="fixed right-3 top-3 z-40 flex items-center gap-2">
        <button
          onClick={toggleShuffle}
          className={`glass-chip flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition active:scale-90 hover:scale-105 ${
            mixed ? "ring-2 ring-[var(--brand-2)]/60 text-[var(--brand-2)]" : "text-foreground"
          }`}
          aria-label="Aralashtirish"
        >
          <Shuffle className="h-3.5 w-3.5" /> {mixed ? "Aralash" : "Tartibli"}
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
      vibe([20, 40, 30]);
      playCorrect();
      setPicked(choice);
      setTimeout(onSolve, 650);
    } else {
      vibe(120);
      playWrong();
      setWrong((w) => new Set(w).add(choice));
    }
  };

  return (
    <article
      className="snap-start-always relative flex h-[calc(100dvh-72px)] w-full items-center justify-center px-3 py-2"
      style={{ scrollSnapStop: "always" }}
    >
      <div className="flex h-full w-full max-w-md flex-col rounded-[2rem] glass-card p-5 text-white">
        <div className="flex items-center justify-between">
          <span className="glass-chip rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--brand-2)]">
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
                className={`flex items-center justify-between rounded-2xl px-4 py-3.5 text-left text-sm font-semibold transition active:scale-[0.97]
                  ${isCorrect ? "bg-[var(--brand-2)]/25 text-[var(--brand-2)] ring-2 ring-[var(--brand-2)]/60" : ""}
                  ${isWrong ? "bg-destructive/15 text-destructive/90 ring-1 ring-destructive/40 opacity-60" : ""}
                  ${!isCorrect && !isWrong ? "glass-inner hover:bg-white/15" : ""}
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
