/**
 * Lists a thread the store has events for but no row: one Rust started
 * itself (a subagent's chat), which no `loadThreads` followed. The row is
 * read by id; an event that lands during that read would miss it, so the
 * read runs once more after it. A thread that reads nothing is left out,
 * and an event with no thread (id 0, an account-level one) reads nothing.
 */
export function threadAdopter<T extends { id: number }>(
  read: (ids: number[]) => Promise<T[]>,
  put: (thread: T) => void,
): (id: number) => void {
  const reading = new Set<number>();
  const again = new Set<number>();
  const adopt = (id: number) => {
    if (id <= 0) return;
    if (reading.has(id)) {
      again.add(id);
      return;
    }
    reading.add(id);
    read([id])
      .then(([found]) => {
        if (found) put(found);
      })
      .catch((e) => console.error("thread read failed", e))
      .finally(() => {
        reading.delete(id);
        if (again.delete(id)) adopt(id);
      });
  };
  return adopt;
}
