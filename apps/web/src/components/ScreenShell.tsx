"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useT } from "../lib/i18n";
import { LocaleSwitch } from "./LocaleSwitch";

interface ScreenShellProps {
  readonly title: string;
  readonly children: ReactNode;
}

/** The frame shared by the inner screens: back link, title and language switch. */
export function ScreenShell({ title, children }: ScreenShellProps) {
  const t = useT();
  return (
    <main className="shell">
      <header className="topbar">
        <div className="topbar-left">
          <Link href="/" className="link-button">
            {t("ui.action.back")}
          </Link>
          <h1>{title}</h1>
        </div>
        <LocaleSwitch />
      </header>
      {children}
    </main>
  );
}
