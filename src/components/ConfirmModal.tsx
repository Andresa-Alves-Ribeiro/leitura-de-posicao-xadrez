import { useEffect, useRef } from "react";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Modal de confirmação no visual da mesa — substitui window.confirm. */
export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="modal-root" role="presentation">
      <button className="modal-backdrop" type="button" aria-label="Fechar" onClick={onCancel} />
      <div
        className={`modal-card${danger ? " danger" : ""}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        aria-describedby="modal-body"
      >
        <p className="modal-eyebrow">Confirmação</p>
        <h2 id="modal-title" className="modal-title">
          {title}
        </h2>
        <p id="modal-body" className="modal-body">
          {body}
        </p>
        <div className="modal-actions">
          <button ref={cancelRef} className="btn sec" type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className={`btn${danger ? " danger solid" : ""}`} type="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
