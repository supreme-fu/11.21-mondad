import { rmSync } from 'node:fs';

export default async function globalSetup() {
  for (const suffix of ['', '-shm', '-wal']) {
    rmSync(`server/data/e2e.db${suffix}`, { force: true });
  }
}
