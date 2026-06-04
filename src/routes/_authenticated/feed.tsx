import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Flashcard, type WordCard } from "@/components/Flashcard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toast } from "sonner";
import { Loader2, Plus, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/feed")({
  head: () => ({ meta: [{ title: "Lenta — VocabFlow" }] }),
  component: Feed,
});

function Feed() {
  const [cards, setCards] = useState<WordCard[] | null>(null);

  useEffect(() => {
    supabase
      .from("words")
      .select("id,word,translation_uz,ipa,example,example_uz,explanation,synonyms,antonyms,is_favorite")
      .eq("status", "ready")
      .order("created_at", { ascending: false })
      .limit(100)
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
      <ThemeToggle className="fixed right-4 top-4 z-40" />
      <div className="scroll-snap-y no-scrollbar h-[calc(100dvh-72px)] overflow-y-auto">
        {cards.map((c) => (
          <Flashcard key={c.id} card={c} onToggleFavorite={toggleFav} />
        ))}
      </div>
    </div>
  );
}
