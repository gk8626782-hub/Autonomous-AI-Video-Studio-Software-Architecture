"use client";

import { useT } from "../lib/i18n";
import { formatBytes } from "../lib/files";
import { useAppStore } from "../store/app-store";

interface StoragePanelProps {
  readonly busy: boolean;
  readonly onProtect: () => void;
}

export function StoragePanel({ busy, onProtect }: StoragePanelProps) {
  const t = useT();
  const level = useAppStore((state) => state.device_storageLevel);
  const used = useAppStore((state) => state.device_usageBytes);
  const quota = useAppStore((state) => state.device_quotaBytes);
  const persisted = useAppStore((state) => state.device_persisted);

  return (
    <div className="storage-panel">
      <p className={level === "block" ? "error" : level === "warn" ? "warn" : "muted"}>
        {t(`ui.storage.level.${level}`)}
      </p>
      {used !== null && quota !== null && (
        <p className="muted">{t("ui.storage.usage", { used: formatBytes(used), total: formatBytes(quota) })}</p>
      )}
      {persisted === true ? (
        <p className="ok">{t("ui.storage.persisted")}</p>
      ) : (
        <>
          <p className="muted">{t("ui.storage.notPersisted")}</p>
          <button type="button" disabled={busy} onClick={onProtect}>
            {t("ui.storage.persist")}
          </button>
        </>
      )}
    </div>
  );
}
