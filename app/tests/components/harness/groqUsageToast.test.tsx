import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GroqUsageCard, GroqUsageToast } from "@/components/harness/dictation/GroqUsageToast";
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

describe("Groq usage toast", () => {
  test("no Groq reading draws nothing", () => {
    expect(renderToStaticMarkup(<GroqUsageToast usage={null} onDismiss={() => {}} />)).toBe("");
    expect(renderToStaticMarkup(<GroqUsageToast usage={{}} onDismiss={() => {}} />)).toBe("");
  });

  test("a meter per figure, with its reset and a close", () => {
    const rows = usageRows({
      transcription: reading({}),
      cleanup: reading({ model: "qwen/qwen3.8-27b", role: "cleanup", requestsRemaining: 1996, requestsReset: 43 }),
    });
    const html = renderToStaticMarkup(<GroqUsageCard rows={rows} now={NOW} onDismiss={() => {}} />);
    expect(html).toContain("Transcriptions today");
    expect(html).toContain("1,999 of 2,000 left");
    expect(html).toContain("Cleanups today");
    expect(html).toContain("Resets in 3h 12m");
    expect(html).toContain("Resets in 43s");
    expect(html.match(/role="meter"/g)).toHaveLength(2);
    expect(html).toContain('aria-valuenow="1999"');
    expect(html).toContain('aria-label="Dismiss Groq usage"');
    expect(html).not.toContain("text-warning");
    expect(html).not.toContain("font-mono");
  });

  test("under a tenth takes the warning colour", () => {
    const rows = usageRows({ transcription: reading({ requestsRemaining: 150 }) });
    const html = renderToStaticMarkup(<GroqUsageCard rows={rows} now={NOW} onDismiss={() => {}} />);
    expect(html).toContain("text-warning");
    expect(html).toContain("bg-warning");
  });
});
