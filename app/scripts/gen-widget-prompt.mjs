// Bun evaluates the component schemas; browser globals are not used by the printer.
import { writeFileSync } from "node:fs";
for (const name of ["window", "document"]) {
  globalThis[name] ??= Object.assign(new EventTarget(), {
    documentElement: { style: {} },
  });
}
const { generateOculusUiPrompt, OCULUS_UI_SKILL_FRONTMATTER } = await import(
  "../src/components/markdown/openui/prompt.ts"
);
const path = new URL(
  "../src-tauri/templates/skills/oculus-ui/SKILL.md",
  import.meta.url,
);
writeFileSync(
  path,
  `${OCULUS_UI_SKILL_FRONTMATTER}\n\n# Chat widgets and proposal cards\n\n${generateOculusUiPrompt()}\n`,
);
console.log("[docs] refreshed oculus-ui signatures and examples");
