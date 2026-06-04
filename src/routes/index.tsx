import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Volume2, Heart, Brain } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VocabFlow — Swipe through English vocabulary" },
      { name: "description", content: "Learn English the modern way. Add words, swipe flashcards, hear pronunciation, and get AI-powered examples in Uzbek." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session));
  }, []);

  return (
    <div className="min-h-screen bg-background bg-mesh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-2xl bg-gradient-brand shadow-glow">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold tracking-tight">VocabFlow</span>
        </div>
        <Link
          to={authed ? "/feed" : "/auth"}
          className="rounded-full bg-foreground/10 px-5 py-2 text-sm font-semibold backdrop-blur transition hover:bg-foreground/15"
        >
          {authed ? "Open app" : "Sign in"}
        </Link>
      </header>

      <main className="mx-auto max-w-6xl px-6 pt-16 pb-24 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-4 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-success" /> AI-powered learning for Uzbek speakers
        </span>
        <h1 className="mt-6 text-5xl font-extrabold tracking-tight sm:text-7xl">
          Learn English<br />
          <span className="text-gradient">one swipe at a time.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
          Add any English word. Get instant Uzbek translation, IPA, audio, example sentences and an AI explanation — all in a TikTok-style feed.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link
            to={authed ? "/feed" : "/auth"}
            className="rounded-full bg-gradient-brand px-8 py-4 text-base font-semibold text-white shadow-glow transition hover:scale-[1.02]"
          >
            {authed ? "Open flashcards" : "Start learning free"}
          </Link>
        </div>

        <div className="mx-auto mt-20 grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Sparkles, title: "AI examples", desc: "Smart sentences for every word" },
            { icon: Volume2, title: "Native audio", desc: "Hear correct pronunciation" },
            { icon: Heart, title: "Favorites", desc: "Save tricky words for later" },
            { icon: Brain, title: "Quiz mode", desc: "Test recall, track progress" },
          ].map((f) => (
            <div key={f.title} className="rounded-3xl border border-border bg-card/60 p-5 text-left backdrop-blur">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-brand shadow-soft">
                <f.icon className="h-5 w-5 text-white" />
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
