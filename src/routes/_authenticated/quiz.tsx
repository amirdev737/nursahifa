import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Brain, Check, X, Trophy, Loader2 } from "lucide-react";
import { toast } from "sonner";

type W = { id: string; word: string; translation_uz: string | null };

type Q = { word: string; correct: string; choices: string[] };

export const Route = createFileRoute("/_authenticated/quiz")({
  head: () => ({ meta: [{ title: "Quiz — VocabFlow" }] }),
  component: Quiz,
});

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function Quiz() {
  const [questions, setQuestions] = useState<Q[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    supabase
      .from("words")
      .select("id,word,translation_uz")
      .not("translation_uz", "is", null)
      .limit(50)
      .then(({ data }) => {
        const words = (data as W[]) ?? [];
        if (words.length < 4) { setQuestions([]); return; }
        const pool = shuffle(words).slice(0, Math.min(10, words.length));
        const qs: Q[] = pool.map((w) => {
          const distractors = shuffle(words.filter((x) => x.id !== w.id))
            .slice(0, 3)
            .map((x) => x.translation_uz!) ;
          return {
            word: w.word,
            correct: w.translation_uz!,
            choices: shuffle([w.translation_uz!, ...distractors]),
          };
        });
        setQuestions(qs);
      });
  }, []);

  const finish = async (finalScore: number, total: number) => {
    setDone(true);
    const { error } = await supabase.from("quiz_results").insert({
      user_id: (await supabase.auth.getUser()).data.user!.id,
      score: finalScore,
      total,
    });
    if (error) toast.error(error.message);
  };

  if (questions === null) {
    return <div className="flex h-[100dvh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (questions.length === 0) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center px-6 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-3xl bg-gradient-brand shadow-glow">
          <Brain className="h-8 w-8 text-white" />
        </div>
        <h2 className="mt-6 text-2xl font-bold">Need more words</h2>
        <p className="mt-2 max-w-xs text-sm text-muted-foreground">Add at least 4 words to unlock quiz mode.</p>
        <Link to="/add" className="mt-6 rounded-full bg-gradient-brand px-6 py-3 text-sm font-semibold text-white shadow-glow">Add words</Link>
      </div>
    );
  }

  if (done) {
    const pct = Math.round((score / questions.length) * 100);
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center px-6 text-center">
        <div className="grid h-20 w-20 place-items-center rounded-[2rem] bg-gradient-brand shadow-glow">
          <Trophy className="h-10 w-10 text-white" />
        </div>
        <h2 className="mt-6 text-3xl font-extrabold">{score}/{questions.length}</h2>
        <p className="mt-1 text-lg text-muted-foreground">{pct}% correct</p>
        <div className="mt-8 flex gap-3">
          <button
            onClick={() => { setQuestions(null); setIdx(0); setScore(0); setPicked(null); setDone(false); window.location.reload(); }}
            className="rounded-full bg-gradient-brand px-6 py-3 text-sm font-semibold text-white shadow-glow"
          >
            Play again
          </button>
          <Link to="/profile" className="rounded-full border border-border px-6 py-3 text-sm font-semibold">See stats</Link>
        </div>
      </div>
    );
  }

  const q = questions[idx];
  const handlePick = (choice: string) => {
    if (picked) return;
    setPicked(choice);
    const correct = choice === q.correct;
    const newScore = score + (correct ? 1 : 0);
    if (correct) setScore(newScore);
    setTimeout(() => {
      if (idx + 1 >= questions.length) {
        finish(newScore, questions.length);
      } else {
        setIdx(idx + 1);
        setPicked(null);
      }
    }, 900);
  };

  return (
    <div className="mx-auto max-w-md px-5 pt-10">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Question {idx + 1} of {questions.length}</span>
        <span>Score {score}</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-gradient-brand transition-all" style={{ width: `${((idx + 1) / questions.length) * 100}%` }} />
      </div>

      <div className="mt-10 rounded-3xl bg-gradient-card p-8 text-center text-white shadow-glow">
        <p className="text-xs uppercase tracking-wider text-white/70">Translate to Uzbek</p>
        <h2 className="mt-3 text-4xl font-extrabold">{q.word}</h2>
      </div>

      <div className="mt-6 space-y-3">
        {q.choices.map((choice) => {
          const isPicked = picked === choice;
          const isRight = picked && choice === q.correct;
          const isWrong = isPicked && choice !== q.correct;
          return (
            <button
              key={choice}
              onClick={() => handlePick(choice)}
              disabled={!!picked}
              className={`flex w-full items-center justify-between rounded-2xl border px-5 py-4 text-left text-base font-medium transition
                ${isRight ? "border-success bg-success/15 text-success" : ""}
                ${isWrong ? "border-destructive bg-destructive/15 text-destructive" : ""}
                ${!picked ? "border-border bg-card hover:bg-accent" : ""}
              `}
            >
              <span>{choice}</span>
              {isRight && <Check className="h-5 w-5" />}
              {isWrong && <X className="h-5 w-5" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
