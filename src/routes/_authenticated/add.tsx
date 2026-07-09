import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateWordData } from "@/lib/ai.functions";
import { processImageOCR } from "@/lib/ocr.functions";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toast } from "sonner";
import { Loader2, Sparkles, ArrowRight, Camera, ImagePlus, X, FileText } from "lucide-react";

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
  const ocr = useServerFn(processImageOCR);
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
      const res = await ocr({ data: { imageDataUrl: dataUrl } });
      toast.success(`${res.inserted} ta so'z kartochkaga aylandi`);
      setPreview(null);
      navigate({ to: "/feed" });
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
    <div className="mx-auto flex h-[calc(100dvh-72px)] max-w-md flex-col px-5 pt-5 pb-3 overflow-hidden">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-brand shadow-glow">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight leading-tight">So'z qo'shish</h1>
            <p className="text-[11px] text-muted-foreground">AI siz uchun hammasini to'ldiradi.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/text"
            className="flex items-center gap-1.5 rounded-full border border-[#D4AF37]/50 bg-[#D4AF37]/10 px-3 py-1.5 text-[10px] font-bold text-[#D4AF37] active:scale-95 transition"
          >
            <FileText className="h-3 w-3" /> Matn
          </Link>
          <ThemeToggle />
        </div>
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

      <div className="mt-3 grid grid-cols-2 gap-2 shrink-0">
        <button
          type="button" onClick={() => cameraRef.current?.click()} disabled={extracting}
          className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--brand-2)]/40 bg-[var(--brand-2)]/10 px-3 py-2.5 text-xs font-semibold text-[var(--brand-2)] disabled:opacity-50 active:scale-95 transition"
        >
          <Camera className="h-4 w-4" /> Rasmga olish
        </button>
        <button
          type="button" onClick={() => galleryRef.current?.click()} disabled={extracting}
          className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card px-3 py-2.5 text-xs font-semibold disabled:opacity-50 active:scale-95 transition"
        >
          <ImagePlus className="h-4 w-4" /> Rasm yuklash
        </button>
      </div>

      {extracting && (
        <div className="mt-2 flex items-center justify-center gap-2 rounded-2xl bg-card border border-border px-3 py-2 text-xs text-muted-foreground shrink-0">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Rasmdan so'zlar olinmoqda…
        </div>
      )}

      {preview && (
        <div className="relative mt-2 overflow-hidden rounded-2xl border border-border shrink-0">
          <img src={preview} alt="preview" className="max-h-24 w-full object-cover" />
          <button
            type="button" onClick={() => setPreview(null)}
            className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-background/80 backdrop-blur"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <form onSubmit={submit} className="mt-3 flex flex-1 min-h-0 flex-col gap-2">
        <div className="flex-1 min-h-0 rounded-3xl border border-border bg-card p-2 shadow-soft">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={"serendipity\nephemeral\nresilient\n\n(har qatorga bittadan yoki vergul bilan)"}
            className="h-full w-full resize-none rounded-2xl bg-transparent p-3 text-sm outline-none placeholder:text-muted-foreground"
            maxLength={1000}
          />
        </div>

        <p className="text-[10px] text-muted-foreground px-1 shrink-0">
          Maslahat: bir vaqtda 25 tagacha so'z qo'shing.
        </p>

        <button
          type="submit" disabled={loading || !input.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-brand py-3 text-sm font-semibold text-white shadow-glow transition active:scale-95 disabled:opacity-60 shrink-0"
        >
          {loading ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Tayyorlanmoqda…</>
          ) : (
            <>Kartochka yaratish <ArrowRight className="h-4 w-4" /></>
          )}
        </button>
      </form>
    </div>
  );
}

