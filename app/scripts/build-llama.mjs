// Build llama.cpp's llama-server from a pinned release into a Tauri sidecar,
// which runs S1-mini for dictation cleanup. macOS only; needs cmake and Xcode
// or its command-line tools. Skipped while the installed binary reports the
// pinned build; --force rebuilds.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { availableParallelism } from "node:os";
import {
  chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { app, binaries, hostTriple } from "./runtime.mjs";

const BUILD = "12359";
const COMMIT = "b1b770d90d94cad9e9ea5b993bdbc383a522fb28";
const TARBALL = `https://github.com/ggml-org/llama.cpp/archive/refs/tags/b${BUILD}.tar.gz`;
const SHA256 = "e2eadc0fd06f81abea3b8012584e67bea3b403d91bcd1b3072b656cbcb2fb4bb";
const SHORT = COMMIT.slice(0, 9);

// The same floor as whisper-cli (build-whisper.mjs).
const MIN_MACOS = "13.3";

const log = (msg) => console.log(`[llama] ${msg}`);

if (process.platform !== "darwin") {
  log("llama.cpp is only packaged for macOS — nothing built");
  process.exit(0);
}

const triple = hostTriple();
const dest = join(binaries, `llama-server-${triple}`);

// `--version` prints to stderr: "version: X (build N, commit H)".
function installedBuild() {
  if (!existsSync(dest)) return null;
  const run = spawnSync(dest, ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return /\(build (\d+), commit ([0-9a-f]+)\)/.exec(`${run.stdout}${run.stderr}`);
}

const installed = installedBuild();
if (!process.argv.includes("--force") && installed?.[1] === BUILD && installed?.[2] === SHORT) {
  log(`${dest} is current (b${BUILD})`);
  process.exit(0);
}

try {
  execFileSync("cmake", ["--version"], { stdio: "ignore" });
} catch {
  console.error("[llama] cmake is not on PATH — install it with `brew install cmake`");
  process.exit(1);
}

// node_modules/.cache is gitignored and outside src-tauri, which tauri dev watches.
const cache = join(app, "node_modules", ".cache", "llama.cpp");
const source = join(cache, `llama.cpp-b${BUILD}`);
const build = join(cache, `build-b${BUILD}-${triple}`);

async function fetchSource() {
  if (existsSync(join(source, "CMakeLists.txt"))) return;
  log(`downloading ${TARBALL}`);
  const res = await fetch(TARBALL, { redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} fetching ${TARBALL}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const sha = createHash("sha256").update(buf).digest("hex");
  if (sha !== SHA256) throw new Error(`llama.cpp b${BUILD} tarball hash ${sha}, expected ${SHA256}`);

  mkdirSync(cache, { recursive: true });
  const scratch = mkdtempSync(join(cache, "extract-"));
  try {
    const archive = join(scratch, "src.tar.gz");
    writeFileSync(archive, buf);
    execFileSync("tar", ["-xzf", archive, "-C", scratch], { stdio: "inherit" });
    rmSync(source, { recursive: true, force: true });
    renameSync(join(scratch, `llama.cpp-b${BUILD}`), source);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

// Every non-system dylib would be missing from the bundle, so refuse it here.
function assertSystemLinkage(binary) {
  const deps = execFileSync("otool", ["-L", binary], { encoding: "utf8" })
    .split("\n").slice(1).map((l) => l.trim().split(" ")[0]).filter(Boolean);
  const foreign = deps.filter((d) => !d.startsWith("/usr/lib/") && !d.startsWith("/System/Library/"));
  if (foreign.length) throw new Error(`llama-server links non-system libraries: ${foreign.join(", ")}`);
}

const started = Date.now();
try {
  await fetchSource();
  const arch = triple.startsWith("aarch64") ? "arm64" : "x86_64";
  execFileSync("cmake", [
    "-S", source, "-B", build,
    "-DCMAKE_BUILD_TYPE=Release",
    `-DCMAKE_OSX_ARCHITECTURES=${arch}`,
    `-DCMAKE_OSX_DEPLOYMENT_TARGET=${MIN_MACOS}`,
    // A tarball has no git history, so --version would say build 0; the skip
    // check reads these.
    `-DLLAMA_BUILD_NUMBER=${BUILD}`,
    `-DLLAMA_BUILD_COMMIT=${SHORT}`,
    // Static, with the Metal shaders compiled in: one file and system frameworks only.
    "-DBUILD_SHARED_LIBS=OFF",
    "-DGGML_METAL=ON",
    "-DGGML_METAL_EMBED_LIBRARY=ON",
    // Generic CPU code, not tuned to the machine that happens to build it.
    "-DGGML_NATIVE=OFF",
    // Apple clang has no OpenMP; a Homebrew libomp would otherwise be linked in.
    "-DGGML_OPENMP=OFF",
    // No network: the model is always a local file, so no HTTPS (OpenSSL)
    // and no web UI fetched from Hugging Face at build time.
    "-DLLAMA_OPENSSL=OFF",
    "-DLLAMA_BUILD_UI=OFF",
    "-DLLAMA_USE_PREBUILT_UI=OFF",
    "-DLLAMA_BUILD_TESTS=OFF",
    "-DLLAMA_BUILD_EXAMPLES=OFF",
    "-DLLAMA_BUILD_TOOLS=ON",
    "-DLLAMA_BUILD_SERVER=ON",
  ], { stdio: "inherit" });
  execFileSync("cmake", [
    "--build", build, "--config", "Release", "--target", "llama-server",
    "--parallel", String(availableParallelism()),
  ], { stdio: "inherit" });

  const built = join(build, "bin", "llama-server");
  assertSystemLinkage(built);
  mkdirSync(binaries, { recursive: true });
  const partial = `${dest}.part`;
  try {
    copyFileSync(built, partial);
    chmodSync(partial, 0o755);
    renameSync(partial, dest);
  } finally {
    rmSync(partial, { force: true });
  }
} catch (e) {
  console.error(`[llama] build failed: ${e.message}`);
  process.exit(1);
}
log(`built ${dest} (b${BUILD}) in ${((Date.now() - started) / 1000).toFixed(0)}s`);
