import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TooltipProvider } from "@/components/ui/tooltip";
import { shortcut } from "@/lib/platform";
import type { HarnessRequest } from "@/lib/harness";

// The tray's import graph (the code surfaces' `MdComponents`) reaches
// modules that listen on `window` at load; they get inert stand-ins for the
// import, then the globals go back so no other test sees a half DOM.
const globals = globalThis as { window?: unknown; document?: unknown };
const before = { window: globals.window, document: globals.document };
const inert = { addEventListener: () => {}, removeEventListener: () => {} };
globals.window ??= inert;
globals.document ??= { ...inert, documentElement: { style: {} } };
const { RequestTrayView } = await import("@/components/harness/composer/requestTray/RequestTrayView");
Object.assign(globals, before);

const APPROVE = { id: "accept", label: "Approve once", decision: "accept" as const };
const SESSION = {
  id: "accept_for_session",
  label: "Always allow this exact command",
  decision: "accept_for_session" as const,
  scope: "Codex runs this exact command again in this chat without asking while its session lasts.",
};
const DECLINE = { id: "decline", label: "Decline", decision: "decline" as const };

const request = (patch: Partial<HarnessRequest> = {}): HarnessRequest => ({
  id: 3, thread_id: 9, run_id: 1, item_id: 12, provider: "codex", kind: "approval", action: "command",
  payload: { command: "which oculus", cwd: "/Users/me/gh/oculus", reason: "Check the binary path" },
  options: [APPROVE, SESSION, DECLINE],
  status: "pending", responder: "live", reason: null, response: null, delivery: "none",
  created_at: "2026-11-16 00:00:00", resolved_at: null, ...patch,
});

const draw = (r: HarnessRequest, extra: { count?: number; busy?: boolean; error?: string | null } = {}) =>
  renderToStaticMarkup(
    <TooltipProvider>
      <RequestTrayView request={r} count={extra.count ?? 1} busy={extra.busy ?? false} error={extra.error ?? null} onRespond={() => {}} onReveal={() => {}} />
    </TooltipProvider>,
  );

const enter = shortcut("enter");

test("the tray says who asks, the whole command with its folder and reason, and Deny and Allow with their keys", () => {
  const html = draw(request());
  expect(html).toContain('data-request-bar="3"');
  expect(html).toContain("Codex wants to run a command");
  expect(html).toContain("which oculus");
  expect(html).toContain("in /Users/me/gh/oculus");
  expect(html).toContain("Check the binary path");
  expect(html).not.toContain("“");
  expect(html).toContain('data-risk="safe"');
  expect(html).toContain("Read-only");
  expect(html).toMatch(/title="Decline"[^>]*>Deny<kbd[^>]*>esc<\/kbd>/);
  expect(html).toMatch(new RegExp(`title="Approve once"[^>]*>Allow<kbd[^>]*>${enter}</kbd>`));
  expect(html).not.toContain(">Decline<");
  expect(html).not.toContain(">Approve<");
});

test("a session grant is its own button, its scope in its title", () => {
  const html = draw(request());
  expect(html).toContain(">Always allow this exact command</span>");
  expect(html).toContain(`title="Always allow this exact command — ${SESSION.scope}"`);
  expect(html).not.toContain(">More<");
});

test("more than one waiting says 1 of 3 with a dot each", () => {
  const html = draw(request(), { count: 3 });
  expect(html).toContain(">1 of 3</span>");
  expect(html.match(/size-\[5px\] rounded-full/g)?.length).toBe(3);
  expect(draw(request())).not.toContain("1 of");
});

test("a danger request is washed red and Enter is on Deny; Allow has no key", () => {
  const html = draw(request({ payload: { command: "rm -rf build" } }));
  expect(html).toContain('data-risk="danger"');
  expect(html).toContain("bg-destructive/[0.07]");
  expect(html).toContain("Deletes files");
  expect(html).toMatch(new RegExp(`title="Decline"[^>]*>Deny<kbd[^>]*>${enter}</kbd>`));
  expect(html).toMatch(/title="Approve once"[^>]*>Allow<\/button>/);
  expect(html).not.toContain(">esc</kbd>");
  // Allow comes first, Deny is the filled default on the right.
  expect(html.indexOf(">Allow<")).toBeLessThan(html.indexOf(">Deny<"));
});

test("caution chips name each fact; no shield in the tray", () => {
  const html = draw(request({ action: "network", payload: { command: "npm install" } }));
  expect(html).toContain('data-risk="caution"');
  expect(html).toContain(">Network</span>");
  // The chip says it; the body does not say it again.
  expect(html).not.toContain("Needs the network");
});

test("a file change names each file with its kind and counts", () => {
  const html = draw(request({
    action: "file_change",
    options: [APPROVE, DECLINE],
    payload: { changes: [{ path: "/notes/sheet.md", kind: { type: "update" }, diff: "@@ -1 +1,3 @@\n-old\n+new\n+more\n+again\n" }] },
  }));
  expect(html).toContain("/notes/sheet.md");
  expect(html).toContain(">Edit</span>");
  expect(html).toContain(">+3</span>");
  expect(html).toContain(">−1</span>");
  expect(html).toContain("Writes");
});

test("busy answers nothing twice, and Rust's refusal is said inside it", () => {
  const html = draw(request(), { busy: true, error: "This request was already answered." });
  expect(html).toContain('role="alert"');
  expect(html).toContain("This request was already answered.");
  expect(html.match(/disabled=""/g)?.length).toBe(3);
});
