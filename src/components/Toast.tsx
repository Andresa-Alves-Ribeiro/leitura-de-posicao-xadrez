import { useEffect } from "react";

interface ToastProps {
  message: string;
  tone?: "fire" | "gold" | "ok";
  onDone: () => void;
}

/** Flash curto de conquista (streak / nível). */
export function Toast({ message, tone = "gold", onDone }: ToastProps) {
  useEffect(() => {
    const t = window.setTimeout(onDone, 2400);
    return () => window.clearTimeout(t);
  }, [message, onDone]);

  return (
    <div className={`toast ${tone}`} role="status" aria-live="polite">
      {message}
    </div>
  );
}
