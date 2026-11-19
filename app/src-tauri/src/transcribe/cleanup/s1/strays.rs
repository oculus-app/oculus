//! Reaping S1-mini servers an app left behind, at launch. The watchdog
//! (`server.rs`) normally ends a server with its app; this catches a server
//! or watchdog that was itself killed outright.

/// Kill every process of ours that carries the server's alias and that
/// launchd has adopted (`ppid == 1`), and answer with the pids. A living
/// app's server — a worktree build running beside this one — is parented to
/// its watchdog and never touched.
#[cfg(unix)]
pub fn sweep() -> Vec<u32> {
    let listing = crate::runtime::platform::command("/bin/ps")
        .args(["-axww", "-o", "pid=,ppid=,uid=,command="])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
        .unwrap_or_default();
    let found = strays(&listing, unsafe { libc::getuid() });
    for pid in &found {
        unsafe { libc::kill(*pid as libc::pid_t, libc::SIGKILL) };
    }
    found
}

#[cfg(not(unix))]
pub fn sweep() -> Vec<u32> {
    Vec::new()
}

/// The stray pids in a `ps -axww -o pid=,ppid=,uid=,command=` listing.
#[cfg(any(unix, test))]
pub(super) fn strays(listing: &str, uid: u32) -> Vec<u32> {
    let marker = format!("--alias {}", super::server::ALIAS);
    listing
        .lines()
        .filter_map(|line| {
            let mut fields = line.split_whitespace();
            let pid: u32 = fields.next()?.parse().ok()?;
            let ppid: u32 = fields.next()?.parse().ok()?;
            let owner: u32 = fields.next()?.parse().ok()?;
            let ours = ppid == 1 && owner == uid && pid != std::process::id();
            (ours && line.contains(&marker)).then_some(pid)
        })
        .collect()
}
