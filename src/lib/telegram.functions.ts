import { createServerFn } from "@tanstack/react-start";
import { createHmac, createHash } from "node:crypto";

function verifyInitData(initData: string, botToken: string): Record<string, string> | null {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return null;
    params.delete("hash");
    const dataCheckString = [...params.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join("\n");
    const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
    const computed = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
    if (computed !== hash) return null;
    const authDate = Number(params.get("auth_date") ?? 0);
    if (!authDate || Date.now() / 1000 - authDate > 60 * 60 * 24 * 7) return null;
    return Object.fromEntries(params.entries());
  } catch {
    return null;
  }
}

function derivePassword(id: number, botToken: string): string {
  return createHmac("sha256", botToken).update(`tg-pw|${id}`).digest("hex");
}

function deterministicUuid(seed: string): string {
  const h = createHash("sha1").update(seed).digest("hex");
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    "5" + h.slice(13, 16),
    ((parseInt(h.slice(16, 17), 16) & 0x3) | 0x8).toString(16) + h.slice(17, 20),
    h.slice(20, 32),
  ].join("-");
}

export const telegramSignIn = createServerFn({ method: "POST" })
  .inputValidator((data: { initData: string }) => {
    if (!data?.initData || typeof data.initData !== "string" || data.initData.length > 8192) {
      throw new Error("initData required");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) throw new Error("Telegram bot token not configured");

    const verified = verifyInitData(data.initData, botToken);
    if (!verified) throw new Error("Telegram ma'lumotlari yaroqsiz");

    let userObj: { id: number; first_name?: string; last_name?: string; username?: string; photo_url?: string };
    try {
      userObj = JSON.parse(verified.user ?? "{}");
    } catch {
      throw new Error("Telegram foydalanuvchi ma'lumotlari noto'g'ri");
    }
    if (!userObj?.id) throw new Error("Telegram user id topilmadi");

    const email = `tg${userObj.id}@telegram.local`;
    const password = derivePassword(userObj.id, botToken);
    const userId = deterministicUuid(`telegram:${userObj.id}`);
    const displayName =
      [userObj.first_name, userObj.last_name].filter(Boolean).join(" ").trim() ||
      userObj.username ||
      `tg_${userObj.id}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin.auth.admin.getUserById(userId);

    if (!existing?.user) {
      const { error } = await supabaseAdmin.auth.admin.createUser({
        id: userId,
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: displayName,
          telegram_id: userObj.id,
          telegram_username: userObj.username,
          avatar_url: userObj.photo_url,
        },
      });
      if (error) throw new Error(error.message);
    } else {
      // keep password in sync (no-op if unchanged)
      await supabaseAdmin.auth.admin.updateUserById(userId, { password });
    }

    await supabaseAdmin.from("profiles").upsert(
      { id: userId, display_name: displayName, avatar_url: userObj.photo_url ?? null },
      { onConflict: "id" },
    );

    return { email, password };
  });
