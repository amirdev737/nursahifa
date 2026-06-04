import { Link } from "@tanstack/react-router";
import { Home, Plus, Heart, Brain, User } from "lucide-react";

type Item = { to: string; label: string; icon: typeof Home; primary?: boolean };
const items: Item[] = [
  { to: "/feed", label: "Lenta", icon: Home },
  { to: "/favorites", label: "Saqlangan", icon: Heart },
  { to: "/add", label: "Qo'shish", icon: Plus, primary: true },
  { to: "/quiz", label: "Test", icon: Brain },
  { to: "/profile", label: "Men", icon: User },
];

export const NAV_HEIGHT = 72; // px

export function BottomNav() {
  return (
    <nav
      style={{ height: NAV_HEIGHT }}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/85 backdrop-blur-xl"
    >
      <div className="mx-auto flex h-full max-w-md items-center justify-around px-2">
        {items.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeProps={{ className: "text-foreground" }}
            inactiveProps={{ className: "text-muted-foreground" }}
            className="group flex flex-col items-center gap-0.5 px-3 py-1.5"
          >
            {item.primary ? (
              <span className="grid h-12 w-12 -translate-y-3 place-items-center rounded-2xl bg-gradient-brand shadow-glow transition group-hover:scale-105">
                <item.icon className="h-6 w-6 text-white" />
              </span>
            ) : (
              <item.icon className="h-5 w-5" />
            )}
            {!item.primary && <span className="text-[10px] font-medium">{item.label}</span>}
          </Link>
        ))}
      </div>
    </nav>
  );
}
