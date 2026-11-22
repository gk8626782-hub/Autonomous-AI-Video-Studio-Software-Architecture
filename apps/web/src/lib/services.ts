import { BoardService, createBrowserImageCodec } from "@avs/board";
import type { ImageCodec } from "@avs/board";
import { MediaService, OpfsFileStore } from "@avs/storage";
import type { FileStore } from "@avs/storage";
import { getDatabase } from "./db";

export interface Services {
  readonly files: FileStore;
  readonly media: MediaService;
  readonly board: BoardService;
  readonly codec: ImageCodec;
}

let services: Services | undefined;

/** Created on first use in the browser, so nothing touches OPFS or IndexedDB while the page is prerendered. */
export function getServices(): Services {
  if (services === undefined) {
    const db = getDatabase();
    const files = new OpfsFileStore();
    services = {
      files,
      media: new MediaService(db, files),
      board: new BoardService(db),
      codec: createBrowserImageCodec(),
    };
  }
  return services;
}
