"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ThemeChoice = "light" | "dark" | "system";
const KEY = "loqio_theme";

type Ctx = { choice: ThemeChoice; resolved: "light" | "dark"; setChoice: (c: ThemeChoice) => void };
const ThemeCtx = createContext<Ctx>({ choice: "system", resolved: "light", setChoice: () => {} });

export function useTheme() { return useContext(ThemeCtx); }

function systemPrefersDark() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

// Runs before React hydrates so the first paint is already in the right theme —
// without it a dark-mode user gets a white flash on every page load.
export const themeBootScript = `(function(){try{
  var c = localStorage.getItem(${JSON.stringify(KEY)}) || "system";
  var dark = c === "dark" || (c === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}catch(e){document.documentElement.setAttribute("data-theme","light");}})();`;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  const apply = useCallback((c: ThemeChoice) => {
    const dark = c === "dark" || (c === "system" && systemPrefersDark());
    const next = dark ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    setResolved(next);
  }, []);

  useEffect(() => {
    let stored: ThemeChoice = "system";
    try { stored = (localStorage.getItem(KEY) as ThemeChoice) || "system"; } catch { /* ignore */ }
    setChoiceState(stored);
    apply(stored);

    // Follow the OS when the user hasn't pinned a choice.
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => { if ((localStorage.getItem(KEY) || "system") === "system") apply("system"); };
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [apply]);

  const setChoice = useCallback((c: ThemeChoice) => {
    setChoiceState(c);
    try { localStorage.setItem(KEY, c); } catch { /* ignore */ }
    apply(c);
  }, [apply]);

  return <ThemeCtx.Provider value={{ choice, resolved, setChoice }}>{children}</ThemeCtx.Provider>;
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { choice, setChoice } = useTheme();
  const options: Array<[ThemeChoice, string, string]> = [
    ["light", "Light", "M12 4V2m0 20v-2m8-8h2M2 12h2m13.66 5.66 1.41 1.41M4.93 4.93l1.41 1.41m11.32 0 1.41-1.41M4.93 19.07l1.41-1.41M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"],
    ["system", "System", "M3 5h18v11H3zM8 20h8M12 16v4"],
    ["dark", "Dark", "M20 13.5A8.5 8.5 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5Z"],
  ];
  return (
    <div
      role="group"
      aria-label="Colour theme"
      className="inline-flex items-center gap-0.5 rounded-full border border-zinc-200 bg-white p-0.5"
      style={{ transition: "border-color var(--dur) var(--ease-out)" }}
    >
      {options.map(([value, label, d]) => (
        <button
          key={value}
          onClick={() => setChoice(value)}
          title={label}
          aria-label={label}
          aria-pressed={choice === value}
          className={`lq-ring-focus flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium transition-colors ${
            choice === value ? "bg-emerald-600 text-white" : "text-zinc-500 hover:bg-zinc-100"
          }`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
            strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d={d} />
          </svg>
          {!compact && <span>{label}</span>}
        </button>
      ))}
    </div>
  );
}
