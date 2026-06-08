import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { telegramSignIn } from "@/lib/telegram.functions";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        initDataUnsafe?: { user?: { id: number } };
        ready?: () => void;
        expand?: () => void;
      };
    };
  }
}

/**
 * Detects Telegram Web App context and silently signs the user in
 * (creates an account on first launch). Runs once per session.
 */
export function TelegramAutoAuth() {
  const signIn = useServerFn(telegramSignIn);
  const navigate = useNavigate();
  const { location } = useRouterState();
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;
    const initData = tg?.initData;
    if (!tg || !initData || initData.length < 10) return;
    ranRef.current = true;

    try { tg.ready?.(); tg.expand?.(); } catch {}

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) return; // already authenticated
        const { email, password } = await signIn({ data: { initData } });
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (location.pathname === "/" || location.pathname === "/auth") {
          navigate({ to: "/feed" });
        }
      } catch (err) {
        console.error("Telegram auth failed:", err);
      }
    })();
  }, [signIn, navigate, location.pathname]);

  return null;
}
