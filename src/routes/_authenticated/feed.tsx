import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toast } from "sonner";
import {
  Loader2, Plus, Sparkles, Volume2, Heart, RotateCcw, CheckCircle2,
} from "lucide-react";
import type { WordCard } from "@/components/Flashcard";
import {
  type Rating, RATING_LABEL_UZ, RATING_INTERVAL_LABEL_UZ,
  computeNextReview, nextMasteryLevel,
} from "@/lib/srs";

export const Route = createFileRoute("/_authenticated/feed")({
  head: () => ({ meta: [{ title: "Bugungi darsim — VocabFlow" }] }),
  component: Feed,
});

type SrsCard = WordCard & {
  review_count: number;
  mastery_level: string;
  next_review_at: string;
};

type Stats = {
  dueToday: number;
  newCount: number;
  learningCount: number;
  masteredCount: number;
  totalReviews: number;
};

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 0.9;
  window.speechSynthesis.speak(u);
}

const vibe = (p: number | number[]) => {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(p as any);
};

function Feed() {
  const [userId, setUserId] = useState<string | null>(null);
  const [queue, setQueue] = useState<SrsCard[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const loadAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const nowIso = new Date().toISOString();
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const [dueRes, allRes, revRes, dueTodayRes] = await Promise.all([
      supabase
        .from("words")
        .select("id,word,translation_uz,ipa,example,example_uz,explanation,synonyms,antonyms,is_favorite,review_count,mastery_level,next_review_at")
        .eq("user_id", user.id)
        .eq("status", "ready")
        .lte("next_review_at", nowIso)
        .order("next_review_at", { ascending: true })
        .limit(50),
      supabase
        .from("words")
        .select("mastery_level", { count: "exact" })
        .eq("user_id", user.id)
        .eq("status", "ready"),
      supabase
        .from("review_history")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id),
      supabase
        .from("words")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "ready")
        .lte("next_review_at", endOfDay.toISOString()),
    ]);

    if (dueRes.error) toast.error(dueRes.error.message);
    setQueue((dueRes.data as SrsCard[]) ?? []);

    const rows = (allRes.data ?? []) as { mastery_level: string }[];
    setStats({
      dueToday: dueTodayRes.count ?? 0,
      newCount: rows.filter((r) => r.mastery_level === "new").length,
      learningCount: rows.filter((r) => r.mastery_level === "learning").length,
      masteredCount: rows.filter((r) => r.mastery_level === "mastered").length,
      totalReviews: revRes.count ?? 0,
    });
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const current = queue?.[0] ?? null;

  useEffect(() => { setFlipped(false); }, [current?.id]);

  const rate = useCallback(async (rating: Rating) => {
    if (!current || !userId || submitting) return;
    setSubmitting(true);
    vibe(rating === "again" ? [10, 30, 10] : 15);
    const { intervalMinutes, nextReviewAt } = computeNextReview(rating);
    const newCount = (current.review_count ?? 0) + 1;
    const mastery = nextMasteryLevel(current.mastery_level ?? "new", rating, newCount);

    // Optimistic UI
    setQueue((q) => (q ? q.slice(1) : q));
    setFlipped(false);
    setReviewed((n) => n + 1);

    const [{ error: uErr }, { error: hErr }] = await Promise.all([
      supabase
        .from("words")
        .update({
          next_review_at: nextReviewAt,
          last_reviewed_at: new Date().toISOString(),
          review_count: newCount,
          interval_minutes: intervalMinutes,
          mastery_level: mastery,
        })
        .eq("id", current.id),
      supabase.from("review_history").insert({
        user_id: userId,
        word_id: current.id,
        rating,
        interval_minutes: intervalMinutes,
      }),
    ]);
    if (uErr) toast.error(uErr.message);
    if (hErr) toast.error(hErr.message);

    // Refresh stats in background
    setStats((s) => s ? {
      ...s,
      totalReviews: s.totalReviews + 1,
      newCount: current.mastery_level === "new" ? Math.max(0, s.newCount - 1) : s.newCount,
      learningCount:
        mastery === "learning" && current.mastery_level !== "learning"
          ? s.learningCount + 1
          : mastery !== "learning" && current.mastery_level === "learning"
            ? Math.max(0, s.learningCount - 1)
            : s.learningCount,
      masteredCount:
        mastery === "mastered" && current.mastery_level !== "mastered"
          ? s.masteredCount + 1
          : s.masteredCount,
      dueToday: Math.max(0, s.dueToday - 1),
    } : s);
    setSubmitting(false);
  }, [current, userId, submitting]);

  const toggleFav = useCallback(async (id: string, value: boolean) => {
    setQueue((q) => q?.map((c) => c.id === id ? { ...c, is_favorite: value } : c) ?? q);
    const { error } = await supabase.from("words").update({ is_favorite: value }).eq("id", id);
    if (error) toast.error(error.message);
  }, []);

  const header = useMemo(() => (
    <div className="flex items-center justify-between px-4 pt-3">
      <div>
        <h1 className="text-lg font-bold tracking-tight">Bugungi darsim</h1>
        <p className="text-[11px] text-muted-foreground">
          Bugun: <span className="font-semibold text-[var(--brand-2)]">{stats?.dueToday ?? 0}</span>
          {" · "}Bajarildi: {reviewed}
        </p>
      </div>
      <ThemeToggle />
    </div>
  ), [stats?.dueToday, reviewed]);

  if (queue === null) {
    return (
      <div className="flex h-[calc(100dvh-72px)] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (queue.length === 0) {
    return (
      <div className="mx-auto flex h-[calc(100dvh-72px)] max-w-md flex-col">
        {header}
        {stats && (
          <div className="mt-2 grid grid-cols-4 gap-1.5 px-4">
            <StatChip label="Yangi" value={stats.newCount} tone="brand" />
            <StatChip label="O'rganilyapti" value={stats.learningCount} tone="warn" />
            <StatChip label="O'zlashtirildi" value={stats.masteredCount} tone="ok" />
            <StatChip label="Takror" value={stats.totalReviews} tone="muted" />
          </div>
        )}
        <div className="relative mt-3 flex-1 min-h-0 px-4 pb-3">
          <EmptyState reviewed={reviewed} onReload={loadAll} />
        </div>
      </div>
    );
  }

  return (
    <div
      className="no-scrollbar h-[calc(100dvh-72px)] w-full overflow-y-scroll overscroll-y-contain snap-y snap-mandatory scroll-smooth"
      style={{ scrollSnapType: "y mandatory", WebkitOverflowScrolling: "touch" }}
    >
      {queue.map((card) => (
        <section
          key={card.id}
          className="relative flex h-[calc(100dvh-72px)] w-full snap-start snap-always items-stretch justify-center px-3 py-3"
        >
          <div className="mx-auto flex h-full w-full max-w-md flex-col">
            <ReviewCard
              card={card}
              flipped={card.id === current?.id ? flipped : false}
              onFlip={() => { vibe(8); setFlipped((f) => !f); }}
              onSpeak={() => speak(card.word)}
              onFav={() => toggleFav(card.id, !card.is_favorite)}
              onRate={rate}
              disabled={submitting || card.id !== current?.id}
            />
          </div>
        </section>
      ))}
    </div>
  );
}


function StatChip({
  label, value, tone,
}: { label: string; value: number; tone: "brand" | "warn" | "ok" | "muted" }) {
  const colors: Record<typeof tone, string> = {
    brand: "text-[var(--brand-2)]",
    warn: "text-amber-400",
    ok: "text-emerald-400",
    muted: "text-foreground/80",
  };
  return (
    <div className="rounded-2xl border border-white/15 bg-white/[0.06] px-2 py-2 text-center backdrop-blur-xl">
      <p className={`text-lg font-extrabold leading-none ${colors[tone]}`}>{value}</p>
      <p className="mt-1 text-[9px] uppercase tracking-wider text-muted-foreground truncate">{label}</p>
    </div>
  );
}

function ReviewCard({
  card, flipped, onFlip, onSpeak, onFav, onRate, disabled,
}: {
  card: SrsCard;
  flipped: boolean;
  onFlip: () => void;
  onSpeak: () => void;
  onFav: () => void;
  onRate: (r: Rating) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex h-full w-full flex-col gap-3">
      <div
        onClick={onFlip}
        className="relative flex flex-1 min-h-0 w-full flex-col overflow-hidden rounded-[2rem] glass-card text-left text-white animate-float-up cursor-pointer"
      >
        <div className="absolute inset-0 bg-mesh opacity-30 pointer-events-none" />

        <div className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 no-scrollbar">
          <div className="flex items-start justify-between gap-2">
            <span className="glass-chip rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--brand-2)] shrink-0">
              {card.mastery_level === "mastered" ? "O'zlashtirilgan"
                : card.mastery_level === "learning" ? "O'rganilyapti" : "Yangi"}
            </span>
            <span
              onClick={(e) => { e.stopPropagation(); onFav(); }}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full glass-chip active:scale-90"
              aria-label="Saqlash"
            >
              <Heart className={`h-4 w-4 ${card.is_favorite ? "fill-[var(--brand-2)] text-[var(--brand-2)]" : ""}`} />
            </span>
          </div>

          <div className="mt-4 flex flex-col items-center text-center">
            <h2 className="w-full text-[clamp(1.6rem,7vw,2.6rem)] font-extrabold leading-tight break-words hyphens-auto">
              {card.word}
            </h2>
            {card.ipa && (
              <p className="mt-1 font-mono text-xs text-white/70 break-words px-2">/{card.ipa.replace(/^\/|\/$/g, "")}/</p>
            )}
            <span
              onClick={(e) => { e.stopPropagation(); onSpeak(); }}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full glass-chip px-3 py-1.5 text-xs font-semibold text-[var(--brand-2)] active:scale-90"
            >
              <Volume2 className="h-3.5 w-3.5" /> Talaffuz
            </span>
          </div>

          {!flipped ? (
            <div className="mt-6 pb-1 text-center text-xs text-white/60">
              Javobni ko'rish uchun bosing
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-2 text-sm">
              <div className="rounded-2xl glass-inner p-3 text-center">
                <p className="text-[10px] uppercase tracking-wider text-white/60">O'zbekcha</p>
                <p className="mt-1 text-[clamp(1.1rem,5vw,1.4rem)] font-bold text-[var(--brand-2)] break-words leading-snug hyphens-auto">
                  {card.translation_uz ?? "—"}
                </p>
              </div>
              {card.example && (
                <div className="rounded-2xl glass-inner p-3">
                  <p className="italic leading-snug text-[13px] break-words">"{card.example}"</p>
                  {card.example_uz && (
                    <p className="mt-1 text-white/80 text-[12px] break-words">— {card.example_uz}</p>
                  )}
                </div>
              )}
              {card.explanation && (
                <div className="flex gap-2 rounded-2xl glass-inner p-3">
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--brand-2)]" />
                  <p className="leading-snug text-[13px] text-white/95 break-words min-w-0">{card.explanation}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>


      {/* Review actions */}
      <div className="shrink-0">
        {!flipped ? (
          <button
            onClick={onFlip}
            className="w-full rounded-2xl bg-gradient-brand py-3 text-sm font-semibold text-white shadow-glow active:scale-[0.98] transition"
          >
            Javobni ko'rsatish
          </button>
        ) : (
          <div className="grid grid-cols-4 gap-1.5">
            <RateBtn rating="again" onClick={onRate} disabled={disabled} />
            <RateBtn rating="hard" onClick={onRate} disabled={disabled} />
            <RateBtn rating="good" onClick={onRate} disabled={disabled} />
            <RateBtn rating="easy" onClick={onRate} disabled={disabled} />
          </div>
        )}
      </div>
    </div>
  );
}

function RateBtn({
  rating, onClick, disabled,
}: { rating: Rating; onClick: (r: Rating) => void; disabled: boolean }) {
  const tone: Record<Rating, string> = {
    again: "bg-red-500/15 border-red-400/40 text-red-300",
    hard: "bg-amber-500/15 border-amber-400/40 text-amber-300",
    good: "bg-emerald-500/15 border-emerald-400/40 text-emerald-300",
    easy: "bg-sky-500/15 border-sky-400/40 text-sky-300",
  };
  return (
    <button
      onClick={() => onClick(rating)}
      disabled={disabled}
      className={`flex flex-col items-center justify-center rounded-2xl border px-2 py-2.5 text-center transition active:scale-95 disabled:opacity-50 ${tone[rating]}`}
    >
      <span className="text-[13px] font-bold leading-none">{RATING_LABEL_UZ[rating]}</span>
      <span className="mt-1 text-[9px] font-medium opacity-80">{RATING_INTERVAL_LABEL_UZ[rating]}</span>
    </button>
  );
}

function EmptyState({ reviewed, onReload }: { reviewed: number; onReload: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-3xl bg-gradient-brand shadow-glow">
        <CheckCircle2 className="h-8 w-8 text-white" />
      </div>
      <h2 className="mt-4 text-2xl font-bold">
        {reviewed > 0 ? "Ajoyib! Bugungi dars tugadi" : "Hozircha takrorlanadigan kartochka yo'q"}
      </h2>
      <p className="mt-2 max-w-xs text-sm text-muted-foreground">
        {reviewed > 0
          ? `Siz ${reviewed} ta kartochkani takrorladingiz. Keyingi kartochkalar rejaga ko'ra ko'rinadi.`
          : "Yangi so'zlar qo'shing yoki keyinroq qaytib keling."}
      </p>
      <div className="mt-6 flex gap-3">
        <button
          onClick={onReload}
          className="flex items-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-semibold active:scale-95"
        >
          <RotateCcw className="h-4 w-4" /> Yangilash
        </button>
        <Link
          to="/add"
          className="inline-flex items-center gap-2 rounded-full bg-gradient-brand px-5 py-2.5 text-sm font-semibold text-white shadow-glow active:scale-95"
        >
          <Plus className="h-4 w-4" /> So'z qo'shish
        </Link>
      </div>
    </div>
  );
}
