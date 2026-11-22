"use client";

import type { ReactNode } from "react";
import { slotPath } from "../lib/slots";
import { useAppStore } from "../store/app-store";

interface SlotFrameProps {
  readonly slot: string;
  readonly label: string;
  readonly wide?: boolean;
  readonly children: ReactNode;
}

/** One slot on the board. The red alert blinks it when a validation rule points at it. */
export function SlotFrame({ slot, label, wide = false, children }: SlotFrameProps) {
  const alerting = useAppStore((state) => state.ui_alertPath === slotPath(slot));
  const className = ["slot", wide ? "slot-wide" : "", alerting ? "avs-alert" : ""].filter(Boolean).join(" ");

  return (
    <div className={className} data-slot={slot}>
      <span className="slot-label">{label}</span>
      {children}
    </div>
  );
}
