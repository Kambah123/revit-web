import { useRef, type ReactNode } from "react";
import {
  Dialog as Root,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
export function Dialog({
  title,
  children,
  onClose,
  description = "",
}: {
  title: string;
  children: ReactNode;
  onClose(): void;
  description?: string;
}) {
  const trigger = useRef(
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  return (
    <Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        onCloseAutoFocus={(event) => {
          if (trigger.current?.isConnected) {
            event.preventDefault();
            trigger.current.focus();
          }
        }}
        className="studio-theme studio-dialog sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className={description ? "" : "sr-only"}>
            {description || title}
          </DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Root>
  );
}
