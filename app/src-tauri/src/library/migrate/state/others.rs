//! Another running Oculus, found by its executable: the app, installed or a
//! build from a checkout, or an `oculus` command. The SQLite probe (`alone`)
//! sees only open connections, and an app idle past its pool's timeout holds
//! none, so the move also refuses while one of these runs, a parent of this
//! process included: an app or `oculus` that ran `at_launch` before spawning
//! this one would have moved the library already, so an Oculus parent on an
//! unmoved library is one that does not know the move (an older app still
//! running), and it must not have the library moved under it.

use std::path::{Path, PathBuf};

/// One process, as the platform lists it.
#[derive(Debug, Clone)]
pub struct Running {
    pub pid: u32,
    pub exe: PathBuf,
}

/// The first process in `all` that is an Oculus, other than `me` itself.
pub fn another_oculus(all: &[Running], me: u32) -> Option<&Running> {
    all.iter().find(|p| p.pid != me && is_oculus(&p.exe))
}

/// The app's or the CLI's executable: `oculus` anywhere; the binary of an
/// `Oculus.app` bundle (not its keyd helper's own bundle); the app as cargo
/// builds it, `target/<profile>/app`; the installed `Oculus.exe`.
pub fn is_oculus(exe: &Path) -> bool {
    let name = |p: Option<&Path>| {
        p.and_then(|p| p.file_name())
            .map(|n| n.to_string_lossy().to_ascii_lowercase())
            .unwrap_or_default()
    };
    let file = name(Some(exe));
    let stem = file.strip_suffix(".exe").unwrap_or(&file);
    if stem == "oculus" {
        return true;
    }
    let dir = exe.parent();
    let up = dir.and_then(Path::parent);
    if name(dir) == "macos"
        && name(up) == "contents"
        && name(up.and_then(Path::parent)) == "oculus.app"
    {
        return true;
    }
    let profile = name(dir);
    stem == "app" && (profile == "debug" || profile == "release") && name(up) == "target"
}

/// Every process this user can see. Empty where listing is not supported.
pub fn list() -> Vec<Running> {
    platform::list()
}

#[cfg(target_os = "macos")]
mod platform {
    use super::Running;
    use std::ffi::{c_int, c_void};
    use std::path::PathBuf;

    pub fn list() -> Vec<Running> {
        // SAFETY: a null buffer asks only for the count.
        let count = unsafe { libc::proc_listallpids(std::ptr::null_mut(), 0) };
        if count <= 0 {
            return Vec::new();
        }
        let mut pids = vec![0 as c_int; count as usize + 64];
        let bytes = (pids.len() * std::mem::size_of::<c_int>()) as c_int;
        // SAFETY: the buffer holds `bytes` bytes of `c_int`s.
        let got = unsafe { libc::proc_listallpids(pids.as_mut_ptr().cast::<c_void>(), bytes) };
        pids.truncate(got.max(0) as usize);
        pids.into_iter()
            .filter(|&pid| pid > 0)
            .filter_map(|pid| {
                Some(Running {
                    pid: pid as u32,
                    exe: path(pid)?,
                })
            })
            .collect()
    }

    fn path(pid: c_int) -> Option<PathBuf> {
        let mut buf = vec![0u8; libc::PROC_PIDPATHINFO_MAXSIZE as usize];
        // SAFETY: the buffer is as long as the size passed.
        let n =
            unsafe { libc::proc_pidpath(pid, buf.as_mut_ptr().cast::<c_void>(), buf.len() as u32) };
        (n > 0).then(|| PathBuf::from(String::from_utf8_lossy(&buf[..n as usize]).into_owned()))
    }
}

#[cfg(windows)]
mod platform {
    use super::Running;
    use std::path::PathBuf;
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
    };

    pub fn list() -> Vec<Running> {
        let mut out = Vec::new();
        // SAFETY: a snapshot handle is closed below; each entry is sized
        // before the first call, as the API requires.
        unsafe {
            let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if snapshot == INVALID_HANDLE_VALUE {
                return out;
            }
            let mut entry: PROCESSENTRY32W = std::mem::zeroed();
            entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
            let mut more = Process32FirstW(snapshot, &mut entry) != 0;
            while more {
                if let Some(exe) = path(entry.th32ProcessID) {
                    out.push(Running {
                        pid: entry.th32ProcessID,
                        exe,
                    });
                }
                more = Process32NextW(snapshot, &mut entry) != 0;
            }
            CloseHandle(snapshot);
        }
        out
    }

    fn path(pid: u32) -> Option<PathBuf> {
        // SAFETY: the handle is closed before returning; the buffer's length
        // is passed in and the written length read back.
        unsafe {
            let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if process.is_null() {
                return None;
            }
            let mut buf = vec![0u16; 32768];
            let mut len = buf.len() as u32;
            let ok = QueryFullProcessImageNameW(process, 0, buf.as_mut_ptr(), &mut len) != 0;
            CloseHandle(process);
            ok.then(|| PathBuf::from(String::from_utf16_lossy(&buf[..len as usize])))
        }
    }
}

#[cfg(not(any(target_os = "macos", windows)))]
mod platform {
    pub fn list() -> Vec<super::Running> {
        Vec::new()
    }
}
