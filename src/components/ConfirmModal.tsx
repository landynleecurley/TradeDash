"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { AlertTriangle, ShieldQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/Modal";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
}: Props) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    if (open) {
      setBusy(false);
      busyRef.current = false;
    }
  }, [open]);

  const confirm = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      title={title}
      subtitle={typeof message === "string" ? message : undefined}
      icon={destructive ? <AlertTriangle className="h-5 w-5" /> : <ShieldQuestion className="h-5 w-5" />}
      iconColor={destructive ? "#FF5000" : "#6B7280"}
      size="md"
    >
      {typeof message !== "string" && <div className="text-sm text-muted-foreground">{message}</div>}
      <ModalFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button
          type="button"
          onClick={confirm}
          disabled={busy}
          className={destructive ? "bg-rose-500 hover:bg-rose-600 text-white" : undefined}
        >
          {busy ? "Working…" : confirmLabel}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
