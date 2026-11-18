//! The one `llama-server` that runs S1-mini: started on first use (or by
//! `dictation_warm` when a recording starts) on 127.0.0.1 at a port the OS
//! picks, stopped after [`IDLE`] without a request and when the app exits.
//!
//! It cannot outlive the app. The server runs under a `/bin/sh` watchdog that
//! holds the read end of a pipe whose write end is this process's: when the
//! app closes it (`stop`) or dies however it dies, the read returns and the
//! watchdog kills the server. [`super::strays::sweep`] covers the rest at
//! the next launch.

use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde_json::Value;

/// A server unused this long is stopped; the next cleanup starts it again
/// (about a second to load).
pub(super) const IDLE: Duration = Duration::from_secs(5 * 60);

/// How often the idle check looks.
const IDLE_CHECK: Duration = Duration::from_secs(15);

/// Loading the model takes about a second; a server not answering after this
/// is broken, not slow.
const STARTUP: Duration = Duration::from_secs(60);

/// How long a stop waits for the watchdog to end the server before killing it.
const STOP_GRACE: Duration = Duration::from_secs(3);

/// The model's name in the API, and how [`super::strays`] knows our servers.
pub(super) const ALIAS: &str = "oculus-s1-mini";

/// Runs the server (`$0` and its arguments) with no stdin, prints its pid,
/// and kills it once this shell's stdin — the app's pipe — reaches EOF. The
/// shell exits with the server.
const WATCHDOG: &str = r#"exec 3<&0
"$0" "$@" </dev/null >&2 &
child=$!
echo "$child"
exec >/dev/null
(read -r _ <&3; kill "$child" 2>/dev/null) &
exec 3<&- </dev/null
wait "$child""#;

/// What starts the server: the helper, the model and where its log goes.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct Launch {
    pub helper: PathBuf,
    pub model: PathBuf,
    pub log: PathBuf,
}

impl Launch {
    /// The server's arguments after its binary. Thinking is off through the
    /// chat template (`--reasoning off`, which in this llama.cpp sets the
    /// template's `enable_thinking` to false: the empty think block S1-mini
    /// was trained on; never `--reasoning-budget 0`). Greedy, one slot, a
    /// 4,096-token context.
    pub(super) fn args(&self, port: u16) -> Vec<String> {
        [
            "-m",
            &self.model.to_string_lossy(),
            "-c",
            "4096",
            "-np",
            "1",
            "--temp",
            "0",
            "--jinja",
            "--reasoning",
            "off",
            "--host",
            "127.0.0.1",
            "--port",
            &port.to_string(),
            "--alias",
            ALIAS,
        ]
        .map(str::to_string)
        .to_vec()
    }
}

struct Running {
    launch: Launch,
    /// The watchdog shell.
    shell: Child,
    /// The app's end of the watchdog's pipe; dropping it stops the server.
    pipe: Option<ChildStdin>,
    /// Killed outright when the watchdog does not end it in time (unix only).
    #[cfg_attr(not(unix), allow(dead_code))]
    server_pid: u32,
    port: u16,
    generation: u64,
    /// Requests in flight; the idle check never stops a busy server.
    busy: usize,
    last_used: Instant,
}

static SERVER: Mutex<Option<Running>> = Mutex::new(None);
static GENERATION: AtomicU64 = AtomicU64::new(0);

/// One chat completion, starting the server if it is not running.
pub(crate) fn complete(launch: &Launch, body: &Value) -> Result<Value, String> {
    let port = acquire(launch)?;
    let reply = post(port, body);
    release();
    reply
}

/// Start the server if it is not running, so the next cleanup finds it loaded.
pub(crate) fn warm(launch: &Launch) -> Result<(), String> {
    acquire(launch)?;
    release();
    Ok(())
}

/// Whether a server is up.
pub(crate) fn running() -> bool {
    lock().as_mut().is_some_and(alive)
}

/// Stop the server if one runs: on app exit, and before its model is removed.
pub(crate) fn stop() {
    let taken = lock().take();
    if let Some(running) = taken {
        shut(running);
    }
}

fn lock() -> std::sync::MutexGuard<'static, Option<Running>> {
    SERVER
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn alive(running: &mut Running) -> bool {
    matches!(running.shell.try_wait(), Ok(None))
}

/// The running server's port, counted busy; a dead or different one is
/// replaced. Starting holds the lock, so a second caller waits for the same
/// server rather than starting another.
fn acquire(launch: &Launch) -> Result<u16, String> {
    let mut held = lock();
    if let Some(running) = held.as_mut() {
        if alive(running) && running.launch == *launch {
            running.busy += 1;
            running.last_used = Instant::now();
            return Ok(running.port);
        }
    }
    if let Some(old) = held.take() {
        shut(old);
    }
    let mut running = start(launch)?;
    running.busy = 1;
    let port = running.port;
    let generation = running.generation;
    *held = Some(running);
    drop(held);
    std::thread::spawn(move || watch_idle(generation));
    Ok(port)
}

fn release() {
    if let Some(running) = lock().as_mut() {
        running.busy = running.busy.saturating_sub(1);
        running.last_used = Instant::now();
    }
}

fn watch_idle(generation: u64) {
    loop {
        std::thread::sleep(IDLE_CHECK);
        let mut held = lock();
        let idle = match held.as_ref() {
            Some(r) if r.generation == generation => r.busy == 0 && r.last_used.elapsed() >= IDLE,
            _ => return,
        };
        if idle {
            let running = held.take();
            drop(held);
            if let Some(running) = running {
                elog!("[oculus] S1-mini idle for 5 minutes, stopping its server");
                shut(running);
            }
            return;
        }
    }
}

/// A port nobody is listening on, from the OS. Freed again before the server
/// binds it; another process taking it in between fails the start.
fn free_port() -> Result<u16, String> {
    TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .map_err(|e| format!("could not find a free port for S1-mini: {e}"))
}

fn start(launch: &Launch) -> Result<Running, String> {
    let port = free_port()?;
    let log =
        std::fs::File::create(&launch.log).map_err(|e| format!("{}: {e}", launch.log.display()))?;
    let mut shell = crate::runtime::platform::command("/bin/sh")
        .arg("-c")
        .arg(WATCHDOG)
        .arg(&launch.helper)
        .args(launch.args(port))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(log)
        .spawn()
        .map_err(|e| format!("could not start S1-mini's server: {e}"))?;
    let pipe = shell.stdin.take();
    let mut line = String::new();
    if let Some(stdout) = shell.stdout.take() {
        BufReader::new(stdout).read_line(&mut line).ok();
    }
    let server_pid = line.trim().parse::<u32>().unwrap_or(0);
    let mut running = Running {
        launch: launch.clone(),
        shell,
        pipe,
        server_pid,
        port,
        generation: GENERATION.fetch_add(1, Ordering::Relaxed) + 1,
        busy: 0,
        last_used: Instant::now(),
    };
    let started = Instant::now();
    loop {
        if !alive(&mut running) {
            let tail = log_tail(&launch.log);
            shut(running);
            return Err(format!("S1-mini's server stopped while loading: {tail}"));
        }
        if healthy(port) {
            elog!(
                "[oculus] S1-mini's server is up on port {port} in {} ms",
                started.elapsed().as_millis()
            );
            return Ok(running);
        }
        if started.elapsed() >= STARTUP {
            shut(running);
            return Err("S1-mini's server did not load the model within a minute".into());
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}

/// `/health` answers 503 while the model loads and 200 once it can serve.
fn healthy(port: u16) -> bool {
    ureq::get(&format!("http://127.0.0.1:{port}/health"))
        .timeout(Duration::from_secs(2))
        .call()
        .is_ok()
}

/// Close the watchdog's pipe so it kills the server, and wait for both; past
/// [`STOP_GRACE`], kill them outright.
fn shut(mut running: Running) {
    drop(running.pipe.take());
    let deadline = Instant::now() + STOP_GRACE;
    while Instant::now() < deadline {
        if !matches!(running.shell.try_wait(), Ok(None)) {
            return;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    #[cfg(unix)]
    if running.server_pid > 0 {
        unsafe { libc::kill(running.server_pid as libc::pid_t, libc::SIGKILL) };
    }
    running.shell.kill().ok();
    running.shell.wait().ok();
}

/// The last lines of the server's log, for an error that says why.
fn log_tail(path: &Path) -> String {
    let mut text = String::new();
    if let Ok(mut file) = std::fs::File::open(path) {
        let len = file.metadata().map(|m| m.len()).unwrap_or(0);
        file.seek(SeekFrom::Start(len.saturating_sub(2_000))).ok();
        file.read_to_string(&mut text).ok();
    }
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    let tail = lines[lines.len().saturating_sub(3)..].join(" / ");
    if tail.is_empty() {
        "it printed nothing".into()
    } else {
        tail
    }
}

/// POST one chat completion to the server; a refusal carries its message.
fn post(port: u16, body: &Value) -> Result<Value, String> {
    let sent = ureq::post(&format!("http://127.0.0.1:{port}/v1/chat/completions"))
        .set("Content-Type", "application/json")
        .send_string(&body.to_string());
    match sent {
        Ok(response) => response
            .into_string()
            .map_err(|e| e.to_string())
            .and_then(|text| serde_json::from_str(&text).map_err(|e| e.to_string()))
            .map_err(|e| format!("S1-mini's reply could not be read: {e}")),
        Err(ureq::Error::Status(status, response)) => {
            let text = response.into_string().unwrap_or_default();
            let message = serde_json::from_str::<Value>(&text)
                .ok()
                .and_then(|v| v["error"]["message"].as_str().map(str::to_string))
                .unwrap_or(text);
            Err(format!(
                "S1-mini's server refused the request ({status}): {message}"
            ))
        }
        Err(e) => Err(format!("could not reach S1-mini's server: {e}")),
    }
}
