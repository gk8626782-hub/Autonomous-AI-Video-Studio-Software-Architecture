"use client";

import { PROVIDER_CATALOG, secretNameFor } from "@avs/keys";
import { useT } from "../lib/i18n";
import { useVault } from "../lib/vault";
import { ProviderCard } from "./ProviderCard";
import { ScreenShell } from "./ScreenShell";
import { Section } from "./Section";
import { VaultPanel } from "./VaultPanel";

export function SettingsScreen() {
  const t = useT();
  const vault = useVault();

  return (
    <ScreenShell title={t("ui.nav.settings")}>
      {vault.error !== null && (
        <p role="alert" className="error">
          {vault.error}
        </p>
      )}
      {vault.notice !== null && <p className="notice">{vault.notice}</p>}

      <Section name="vault" title={t("ui.vault.title")}>
        <VaultPanel vault={vault} />
      </Section>

      <Section name="providers" title={t("ui.project.section.providers")}>
        <div className="grid grid-wide">
          {PROVIDER_CATALOG.map((entry) => (
            <ProviderCard
              key={entry.id}
              entry={entry}
              hasKey={vault.secretNames.includes(secretNameFor(entry.id))}
              unlocked={vault.state === "unlocked"}
              busy={vault.busy}
              onSave={(apiKey) => vault.saveKey(entry.id, apiKey)}
              onRemove={() => vault.removeKey(entry.id)}
            />
          ))}
        </div>
      </Section>
    </ScreenShell>
  );
}
