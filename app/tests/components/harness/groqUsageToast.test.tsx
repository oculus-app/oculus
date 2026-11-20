import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GroqUsageLine, GroqUsageToast } from "@/components/harness/dictation/GroqUsageToast";
import { usageRows, type GroqReading } from "@/lib/dictation/groqUsage";

const NOW = new Date(2026, 10, 19, 14, 2).getTime();
const reading = (patch: Partial<GroqReading>): GroqReading => ({
  model: "whisper-large-v3-turbo",
  role: "transcription",
  readAt: NOW,
  requestsLimit: 2000,
  requestsRemaining: 1999,
  requestsReset: 11_520,
  ...patch,
});
const text = (html: string) => html.replace(/<svg.*?<\/svg>/g, "").replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'");

describe("Groq usage toast", () => {
  test("no Groq reading draws nothing", () => {
    expect(renderToStaticMarkup(<GroqUsageToast usage={null} onDismiss={() => {}} />)).toBe("");
    expect(renderToStaticMarkup(<GroqUsageToast usage={{}} onDismiss={() => {}} />)).toBe("");
  });

  test("one line, the window said once, no resets while plenty is left", () => {
    const rows = usageRows({
      transcription: reading({}),
      cleanup: reading({ model: "qwen/qwen3.8-27b", role: "cleanup", requestsRemaining: 1996, requestsReset: 43 }),
    });
    const html = renderToStaticMarkup(<GroqUsageLine rows={rows} now={NOW} />);
    expect(text(html)).toBe("Groq left today1,999 transcriptions1,996 cleanups");
    expect(html).toContain('aria-label="Dismiss Groq usage"');
    expect(html).not.toContain("text-warning");
    expect(html).not.toContain("font-mono");
  });

  test("a low figure takes the warning colour and its reset", () => {
    const rows = usageRows({ transcription: reading({ requestsRemaining: 150 }) });
    const html = renderToStaticMarkup(<GroqUsageLine rows={rows} now={NOW} />);
    expect(html).toContain("text-warning");
    expect(text(html)).toBe("Groq left today150 transcriptions, resets in 3h 12m");
  });

  test("mixed windows say each figure's own", () => {
    const rows = usageRows({
      transcription: reading({}),
      cleanup: reading({ role: "cleanup", requestsLimit: undefined, requestsRemaining: undefined, tokensLimit: 6000, tokensRemaining: 5800 }),
    });
    const html = renderToStaticMarkup(<GroqUsageLine rows={rows} now={NOW} />);
    expect(text(html)).toBe("Groq left1,999 transcriptions today5,800 cleanup tokens this minute");
  });
});
