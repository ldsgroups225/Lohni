import { useEffect, useRef } from "react";
import { enterSends } from "../../lib/enterSends";

type Props = {
  disabled?: boolean;
  onSend: (text: string) => void;
};

export default function Composer({ disabled, onSend }: Props) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const onInput = () => {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 256)}px`;
    };
    el.addEventListener("input", onInput);
    onInput();
    return () => el.removeEventListener("input", onInput);
  }, []);

  const send = () => {
    const el = inputRef.current;
    if (!el) return;
    const v = el.value.trim();
    if (!v) return;
    onSend(v);
    el.value = "";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };

  return (
    <div className="fixed bottom-0 pt-6 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-border left-4 right-4 md:left-32 z-[var(--z-dock)] bg-background">
      <div className="max-w-4xl mx-auto">
        <div className="relative shadow-[inset_0_3px_15px] shadow-border flex items-end backdrop-blur-lg ui-card">
          <textarea
            ref={inputRef}
            placeholder="Pose une question ou demande d’autres exemples…"
            aria-label="Ta question au Tuteur"
            rows={1}
            className="w-full text-foreground bg-transparent rounded-3xl p-4 pl-2 pr-20 outline-none resize-none overflow-y-auto max-h-64 min-h-[2.5rem]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && enterSends()) {
                e.preventDefault();
                if (!disabled) send();
              }
            }}
          />
          <div className="absolute right-0 bottom-0 w-fit p-2 flex items-end">
            <button type="button"
              onClick={send}
              disabled={disabled}
              className="rounded-full bg-tint hover:bg-tint duration-300 transition-[transform,opacity] hover:text-foreground p-2.5 disabled:opacity-50"
              aria-label="Envoyer"
              title={disabled ? "Patiente…" : "Envoyer"}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-5">
                <path d="M4 12h16m-7-7 7 7-7 7" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
