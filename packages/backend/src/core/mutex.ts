/**
 * Mutex — serialises async sections across the process.
 *
 * Used by the persistence layer to ensure that compound writes
 * (e.g. "assign device AND bump its room_id AND emit an event") are
 * not interleaved. Phase 2's quality gate checks that concurrent writes
 * do not corrupt the DB; this is how we guarantee that.
 */
export class Mutex {
  private chain: Promise<unknown> = Promise.resolve();

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(fn, fn);
    // Swallow errors in the chain so one failure doesn't poison the next.
    this.chain = next.catch(() => undefined);
    return next;
  }
}