export const props = { n: num(), title: str(), narrated: bool() };
export const examples = { basic: { n: 12, title: "Row", narrated: false } };

// A fixture for the CLI's output sizes: a title, then `n` keyed dots that
// fade in one every 0.25 s and then drop a row one by one, all in the left
// half, then nothing moves while the narration goes on, so every scene
// draws many beats and warnings.
export default ({ n, title }, { t, theme }) => {
  const { color } = theme;
  const dots = Array.from({ length: n }, (_, i) => i);
  const drop = (i) => interpolate(t, [0.3 + n * 0.25 + i * 0.15, 0.5 + n * 0.25 + i * 0.15], [0, 24]);
  return (
    <Box style={{ fill: color.bg }}>
      <Text key="title" style={{ position: "absolute", left: 12, top: 10, fontFamily: "Inter", fontSize: 14, color: color.text }}>{title}</Text>
      {dots.map((i) => (
        <Enter key={`d${i}`} preset="fade" at={0.3 + i * 0.25} dur={0.2}>
          <Box style={{ position: "absolute", left: 12 + (i % 6) * 20, top: 40 + Math.floor(i / 6) * 20 + drop(i), width: 12, height: 12, radius: 6, fill: color.accent }} />
        </Enter>
      ))}
    </Box>
  );
};
