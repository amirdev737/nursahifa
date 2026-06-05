import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateWordData, extractWordsFromImage } from "@/lib/ai.functions";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toast } from "sonner";
import { Loader2, Sparkles, ArrowRight, Camera, ImagePlus, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/add")({
  head: () => ({ meta: [{ title: "So'z qo'shish — VocabFlow" }] }),
  component: AddPage,
});

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function AddPage() {
  const navigate = useNavigate();
  const generate = useServerFn(generateWordData);
  const extract = useServerFn(extractWordsFromImage);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const handleImage = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 6_000_000) return toast.error("Rasm 6MB dan kichik bo'lsin");
    try {
      setExtracting(true);
      const dataUrl = await fileToDataUrl(file);
      setPreview(dataUrl);
      const res = await extract({ data: { imageDataUrl: dataUrl } });
      if (!res.words.length) {
        toast.error("Rasmdan inglizcha so'z topilmadi");
        return;
      }
      const merged = Array.from(
        new Set([
          ...input.split(/[\n,]+/).map((w) => w.trim()).filter(Boolean),
          ...res.words,
        ])
      );
      setInput(merged.join("\n"));
      toast.success(`${res.words.length} ta so'z topildi`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rasmni o'qib bo'lmadi");
    } finally {
      setExtracting(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const words = input.split(/[\n,]+/).map((w) => w.trim()).filter(Boolean);
    if (words.length === 0) return toast.error("Kamida bitta so'z kiriting");
    setLoading(true);
    try {
      const res = await generate({ data: { words } });
      toast.success(`${res.inserted} ta so'z qo'shildi`);
      setInput("");
      setPreview(null);
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

      {/* Image inputs */}
      <input
        ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => handleImage(e.target.files?.[0])}
      />
      <input
        ref={galleryRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => handleImage(e.target.files?.[0])}
      />

      <div className="mt-6 grid grid-cols-2 gap-3">
        <button
          type="button" onClick={() => cameraRef.current?.click()} disabled={extracting}
          className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--brand-2)]/40 bg-[var(--brand-2)]/10 px-4 py-3 text-sm font-semibold text-[var(--brand-2)] disabled:opacity-50"
        >
          <Camera className="h-4 w-4" /> Rasmga tushirish
        </button>
        <button
          type="button" onClick={() => galleryRef.current?.click()} disabled={extracting}
          className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-semibold disabled:opacity-50"
        >
          <ImagePlus className="h-4 w-4" /> Rasm yuklash
        </button>
      </div>

      {extracting && (
        <div className="mt-3 flex items-center justify-center gap-2 rounded-2xl bg-card border border-border px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Rasmdan so'zlar olinmoqda…
        </div>
      )}

      {preview && (
        <div className="relative mt-3 overflow-hidden rounded-2xl border border-border">
          <img src={preview} alt="preview" className="max-h-48 w-full object-cover" />
          <button
            type="button" onClick={() => setPreview(null)}
            className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-background/80 backdrop-blur"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <form onSubmit={submit} className="mt-5 space-y-4">
        <div className="rounded-3xl border border-border bg-card p-2 shadow-soft">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={7}
            placeholder={"serendipity\nephemeral\nresilient\n\n(har qatorga bittadan yoki vergul bilan)"}
            className="w-full resize-none rounded-2xl bg-transparent p-4 text-base outline-none placeholder:text-muted-foreground"
            maxLength={1000}
          />
        </div>

        <p className="text-xs text-muted-foreground px-1">
          Maslahat: bir vaqtda 25 tagacha so'z qo'shing. Rasmdan ham qo'shsangiz bo'ladi.
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
