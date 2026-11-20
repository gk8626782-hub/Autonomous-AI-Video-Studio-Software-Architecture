import { ProjectRepository, StudioDatabase } from "@avs/storage";

let database: StudioDatabase | undefined;
let repository: ProjectRepository | undefined;

/** Lazily created so nothing touches IndexedDB during static prerendering. */
export function getDatabase(): StudioDatabase {
  database ??= new StudioDatabase();
  return database;
}

export function getProjectRepository(): ProjectRepository {
  repository ??= new ProjectRepository(getDatabase());
  return repository;
}
