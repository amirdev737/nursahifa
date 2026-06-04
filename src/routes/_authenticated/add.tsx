import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateWordData } from "@/lib/ai.functions";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toast } from "sonner";
import { Loader2, Sparkles, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/add")({
  head: () => ({ meta: [{ title: "So'z qo'shish — VocabFlow" }] }),
  component: AddPage,
});

function AddPage() {
  const navigate = useNavigate();
  const generate = useServerFn(generateWordData);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const words = input
      .split(/[\n,]+/)
      .map((w) => w.trim())
      .filter(Boolean);
    if (words.length === 0) return toast.error("Kamida bitta so'z kiriting");
    setLoading(true);
    try {
      const res = await generate({ data: { words } });
      toast.success(`${res.inserted} ta so'z qo'shildi`);
      setInput("");
      navigate({ to: "/feed" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "So'zlarni qo'shib bo'lmadi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-5 pt-10 pb-24">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-brand shadow-glow">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">So'z qo'shish</h1>
            <p className="text-sm text-muted-foreground">AI siz uchun hammasini to'ldiradi.</p>
          </div>
        </div>
        <ThemeToggle />
      </div>

      <form onSubmit={submit} className="mt-8 space-y-4">
        <div className="rounded-3xl border border-border bg-card p-2 shadow-soft">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={8}
            placeholder={"serendipity\nephemeral\nresilient\n\n(har qatorga bittadan yoki vergul bilan)"}
            className="w-full resize-none rounded-2xl bg-transparent p-4 text-base outline-none placeholder:text-muted-foreground"
            maxLength={1000}
          />
        </div>

        <p className="text-xs text-muted-foreground px-1">
          Maslahat: bir vaqtda 25 tagacha inglizcha so'z qo'shing. Biz o'zbekcha tarjima, IPA, misol va izoh tayyorlaymiz.
        </p>

        <button
          type="submit" disabled={loading || !input.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-brand py-4 text-base font-semibold text-white shadow-glow transition hover:scale-[1.01] disabled:opacity-60"
        >
          {loading ? (
            <><Loader2 className="h-5 w-5 animate-spin" /> Kartochkalar tayyorlanmoqda…</>
          ) : (
            <>Kartochka yaratish <ArrowRight className="h-5 w-5" /></>
          )}
        </button>
      </form>
    </div>
  );
}
