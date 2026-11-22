"use client";

import type { ReactNode } from "react";
import { sectionPath } from "../lib/slots";
import { useAppStore } from "../store/app-store";

interface SectionProps {
  readonly name: string;
  readonly title: string;
  readonly children: ReactNode;
}

/** A screen section. It blinks red when a validation rule points at it. */
export function Section({ name, title, children }: SectionProps) {
  const alerting = useAppStore((state) => state.ui_alertPath === sectionPath(name));

  return (
    <section className={alerting ? "section avs-alert" : "section"} data-section={name}>
      <h2 className="section-title">{title}</h2>
      {children}
    </section>
  );
}
