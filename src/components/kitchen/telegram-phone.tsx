import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ChatMsg } from "@/lib/kitchen/telegram-sim";
import type { Button as InlineButton } from "@/lib/kitchen/telegram-bot";
import { cn } from "@/lib/utils";

/** One person's phone: a Telegram-style chat with the kitchen bot. */
export function TelegramPhone({
  name,
  roleLabel,
  messages,
  suggestions,
  onSend,
  onPress,
}: {
  name: string;
  roleLabel: string;
  messages: ChatMsg[];
  suggestions: string[];
  onSend: (text: string) => void;
  onPress: (message: ChatMsg, button: InlineButton) => void;
}) {
  const [draft, setDraft] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const shown = messages.filter((m) => m.visible);
  const hiding = messages.some((m) => !m.visible);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "end" });
  }, [shown.length]);

  const send = (text: string) => {
    if (!text.trim()) return;
    onSend(text);
    setDraft("");
  };

  return (
    <section
      className="flex h-[34rem] flex-col overflow-hidden rounded-2xl border bg-card shadow-soft"
      aria-label={`${name}'s phone`}
      data-testid="phone"
    >
      <header className="flex items-center gap-3 border-b bg-secondary px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
          {name[0]}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{name}</div>
          <div className="text-xs text-muted-foreground">
            {roleLabel} · chatting with NutriSync Kitchen Bot
          </div>
        </div>
      </header>

      <div
        className="flex-1 space-y-2 overflow-y-auto bg-background px-3 py-3"
        role="log"
        aria-live="polite"
      >
        {shown.length === 0 && (
          <p className="pt-10 text-center text-sm text-muted-foreground">Connecting…</p>
        )}
        {shown.map((m) => (
          <div key={m.id} data-testid="bubble" data-from={m.from}>
            {m.from === "note" ? (
              <p className="mx-auto max-w-[90%] rounded-md bg-warning-soft px-3 py-1.5 text-center text-xs">
                {m.text}
              </p>
            ) : (
              <div className={cn("flex", m.from === "me" && "justify-end")}>
                <div
                  className={cn(
                    "max-w-[88%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13px] leading-snug shadow-sm",
                    m.from === "me" ? "bg-primary text-primary-foreground" : "border bg-card",
                  )}
                >
                  {m.text}
                </div>
              </div>
            )}
            {m.buttons && (
              <div className="mt-1.5 space-y-1.5">
                {m.buttons.map((row, i) => (
                  <div key={i} className="flex flex-wrap gap-1.5">
                    {row.map((b) => (
                      <button
                        key={b.data}
                        type="button"
                        onClick={() => onPress(m, b)}
                        className="flex-1 rounded-lg border bg-secondary px-3 py-2 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        {b.text}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {hiding && <p className="pl-2 text-xs italic text-muted-foreground">typing…</p>}
        <div ref={end} />
      </div>

      <div className="border-t bg-card p-2">
        <div className="mb-2 flex flex-wrap gap-1">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              className="rounded-full border bg-background px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
        >
          <input
            aria-label={`Message as ${name}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Message"
            className="min-w-0 flex-1 rounded-full border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button type="submit" size="icon" aria-label="Send" disabled={!draft.trim()}>
            <Send />
          </Button>
        </form>
      </div>
    </section>
  );
}
