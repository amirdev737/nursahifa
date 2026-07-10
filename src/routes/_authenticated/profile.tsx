import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogOut, BookOpen, Heart, Trophy, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profil — VocabFlow" }] }),
  component: Profile,
});

type Stats = {
  totalWords: number;
  favorites: number;
  quizzes: number;
  avg: number;
  bestScore: number;
  dueToday: number;
  newCount: number;
  learningCount: number;
  masteredCount: number;
  totalReviews: number;
};

function Profile() {
  const navigate = useNavigate();
  const [name, setName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? "");
      const { data: prof } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
      setName(prof?.display_name ?? user.email?.split("@")[0] ?? "O'quvchi");

      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
      const [
        { count: totalWords },
        { count: favorites },
        { data: quizzes },
        { data: mastery },
        { count: dueToday },
        { count: totalReviews },
      ] = await Promise.all([
        supabase.from("words").select("*", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("words").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("is_favorite", true),
        supabase.from("quiz_results").select("score,total").eq("user_id", user.id),
        supabase.from("words").select("mastery_level").eq("user_id", user.id).eq("status", "ready"),
        supabase.from("words").select("*", { count: "exact", head: true })
          .eq("user_id", user.id).eq("status", "ready").lte("next_review_at", endOfDay.toISOString()),
        supabase.from("review_history").select("*", { count: "exact", head: true }).eq("user_id", user.id),
      ]);
      const qs = quizzes ?? [];
      const avg = qs.length ? Math.round((qs.reduce((s, q) => s + q.score / q.total, 0) / qs.length) * 100) : 0;
      const bestScore = qs.length ? Math.max(...qs.map((q) => Math.round((q.score / q.total) * 100))) : 0;
      const rows = (mastery ?? []) as { mastery_level: string }[];
      setStats({
        totalWords: totalWords ?? 0,
        favorites: favorites ?? 0,
        quizzes: qs.length,
        avg,
        bestScore,
        dueToday: dueToday ?? 0,
        newCount: rows.filter((r) => r.mastery_level === "new").length,
        learningCount: rows.filter((r) => r.mastery_level === "learning").length,
        masteredCount: rows.filter((r) => r.mastery_level === "mastered").length,
        totalReviews: totalReviews ?? 0,
      });
    })();
  }, []);


  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  return (
    <div className="fixed inset-x-0 top-0 bottom-[72px] overflow-hidden">
      {/* iOS ambient blobs */}
      <div className="pointer-events-none absolute -top-24 -left-16 h-[320px] w-[320px] rounded-full bg-[oklch(0.85_0.18_85_/_0.18)] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-16 h-[340px] w-[340px] rounded-full bg-[oklch(0.45_0.18_280_/_0.25)] blur-3xl" />

      <div className="relative mx-auto flex h-full max-w-md flex-col px-4 pt-3 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-brand text-xl font-bold text-white shadow-glow">
              {(name?.[0] ?? "?").toUpperCase()}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold">{name}</h1>
              <p className="truncate text-xs text-muted-foreground">{email}</p>
            </div>
          </div>
          <ThemeToggle />
        </div>

        {stats === null ? (
          <div className="mt-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <Stat icon={BookOpen} label="Bugun takror" value={stats.dueToday} />
              <Stat icon={Trophy} label="Jami takrorlar" value={stats.totalReviews} />
              <Stat icon={BookOpen} label="Yangi" value={stats.newCount} />
              <Stat icon={BookOpen} label="O'rganilyapti" value={stats.learningCount} />
              <Stat icon={Trophy} label="O'zlashtirilgan" value={stats.masteredCount} />
              <Stat icon={Heart} label="Saqlangan" value={stats.favorites} />
              <Stat icon={BookOpen} label="Jami so'zlar" value={stats.totalWords} />
              <Stat icon={Trophy} label="Testlar" value={stats.quizzes} />
            </div>

            <div className="mt-3 rounded-3xl border border-white/15 bg-gradient-card p-5 text-white shadow-glow backdrop-blur-2xl">
              <p className="text-[10px] uppercase tracking-wider text-[var(--brand-2)]">O'rtacha aniqlik</p>
              <p className="mt-1 text-3xl font-extrabold">{stats.avg}%</p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/15">
                <div className="h-full bg-[var(--brand-2)] transition-all" style={{ width: `${stats.avg}%` }} />
              </div>
            </div>

          </>
        )}

        <button
          onClick={signOut}
          className="mt-auto flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] py-3 text-sm font-semibold backdrop-blur-xl transition hover:bg-white/[0.12]"
        >
          <LogOut className="h-4 w-4" /> Chiqish
        </button>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof BookOpen; label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/[0.06] p-3 backdrop-blur-xl">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <p className="mt-1.5 text-xl font-extrabold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
