import { expect, test } from "bun:test";
import { threadAdopter } from "@/stores/chat/adoptThread";

type Row = { id: number; pending_requests: number };

function reader() {
  const waiting: { ids: number[]; land: (rows: Row[]) => void }[] = [];
  const read = (ids: number[]) => new Promise<Row[]>((land) => waiting.push({ ids, land }));
  return { waiting, read };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

test("a thread first heard of through an event is read by id and listed", async () => {
  const { waiting, read } = reader();
  const listed: Row[] = [];
  const adopt = threadAdopter(read, (t) => listed.push(t));
  adopt(7);
  expect(waiting.map((w) => w.ids)).toEqual([[7]]);
  waiting[0].land([{ id: 7, pending_requests: 0 }]);
  await settle();
  expect(listed).toEqual([{ id: 7, pending_requests: 0 }]);
  expect(waiting).toHaveLength(1);
});

test("an event during the read reads the thread once more, so what it told is not missed", async () => {
  const { waiting, read } = reader();
  const listed: Row[] = [];
  const adopt = threadAdopter(read, (t) => listed.push(t));
  adopt(7);
  // A request opens while the first read is out: the row it returns predates it.
  adopt(7);
  adopt(7);
  expect(waiting).toHaveLength(1);
  waiting[0].land([{ id: 7, pending_requests: 0 }]);
  await settle();
  expect(waiting).toHaveLength(2);
  waiting[1].land([{ id: 7, pending_requests: 1 }]);
  await settle();
  expect(listed.map((t) => t.pending_requests)).toEqual([0, 1]);
  expect(waiting).toHaveLength(2);
});

test("a deleted thread lists nothing, and a failed read can be tried again", async () => {
  const listed: Row[] = [];
  let fail = true;
  const adopt = threadAdopter<Row>(async () => {
    if (fail) throw new Error("locked");
    return [];
  }, (t) => listed.push(t));
  const error = console.error;
  console.error = () => {};
  adopt(7);
  await settle();
  console.error = error;
  fail = false;
  adopt(7);
  await settle();
  expect(listed).toEqual([]);
});

test("an event with no thread, as the account's carry, reads nothing", async () => {
  const { waiting, read } = reader();
  const adopt = threadAdopter(read, () => {});
  adopt(0);
  adopt(-1);
  await settle();
  expect(waiting).toHaveLength(0);
});
