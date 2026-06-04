import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogOut, BookOpen, Heart, Trophy, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profil — VocabFlow" }] }),
  component: Profile,
});

type Stats = { totalWords: number; favorites: number; quizzes: number; avg: number; bestScore: number };

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

      const [{ count: totalWords }, { count: favorites }, { data: quizzes }] = await Promise.all([
        supabase.from("words").select("*", { count: "exact", head: true }),
        supabase.from("words").select("*", { count: "exact", head: true }).eq("is_favorite", true),
        supabase.from("quiz_results").select("score,total"),
      ]);
      const qs = quizzes ?? [];
      const avg = qs.length ? Math.round((qs.reduce((s, q) => s + q.score / q.total, 0) / qs.length) * 100) : 0;
      const bestScore = qs.length ? Math.max(...qs.map((q) => Math.round((q.score / q.total) * 100))) : 0;
      setStats({ totalWords: totalWords ?? 0, favorites: favorites ?? 0, quizzes: qs.length, avg, bestScore });
    })();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  return (
    <div className="mx-auto max-w-md px-5 pt-10 pb-24">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-brand text-2xl font-bold text-white shadow-glow">
            {(name?.[0] ?? "?").toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold">{name}</h1>
            <p className="truncate text-sm text-muted-foreground">{email}</p>
          </div>
        </div>
        <ThemeToggle />
      </div>

      {stats === null ? (
        <div className="mt-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-2 gap-3">
            <Stat icon={BookOpen} label="So'zlar" value={stats.totalWords} />
            <Stat icon={Heart} label="Saqlangan" value={stats.favorites} />
            <Stat icon={Trophy} label="Testlar" value={stats.quizzes} />
            <Stat icon={Trophy} label="Eng yaxshi natija" value={`${stats.bestScore}%`} />
          </div>

          <div className="mt-4 rounded-3xl bg-gradient-card p-6 text-white shadow-glow">
            <p className="text-xs uppercase tracking-wider text-[var(--brand-2)]">O'rtacha aniqlik</p>
            <p className="mt-2 text-4xl font-extrabold">{stats.avg}%</p>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/15">
              <div className="h-full bg-[var(--brand-2)] transition-all" style={{ width: `${stats.avg}%` }} />
            </div>
          </div>
        </>
      )}

      <button
        onClick={signOut}
        className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3 text-sm font-semibold transition hover:bg-accent"
      >
        <LogOut className="h-4 w-4" /> Chiqish
      </button>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof BookOpen; label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <Icon className="h-5 w-5 text-muted-foreground" />
      <p className="mt-3 text-2xl font-extrabold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
