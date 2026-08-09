// Spawning child processes without showing the user a console window.
//
// On Windows a GUI process has no console, so when it starts a console program
// the OS allocates one — and that console is a cmd.exe window that pops up in
// front of the app. Every process this app runs is a background detail nobody
// asked to watch: npm installs, docker, ssh tunnels, port scans. All of them go
// through here.
//
// Unix has no equivalent behaviour and no equivalent flag, so on those platforms
// these are pass-throughs that the optimiser removes entirely.

/// `CREATE_NO_WINDOW` — run the console program with no console at all.
///
/// Not `SW_HIDE` via `STARTUPINFO`: that still allocates the console and merely
/// starts it hidden, which leaves a taskbar entry and a window that anything can
/// show again.
///
/// <https://learn.microsoft.com/windows/win32/procthread/process-creation-flags>
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Suppress the console window for an async command.
pub fn quiet(cmd: &mut tokio::process::Command) -> &mut tokio::process::Command {
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

/// Suppress the console window for a blocking command.
///
/// Both callers sit in Windows-only `cfg` blocks (the registry machine-id read
/// and the netstat port scan), so off Windows this compiles to an unused
/// pass-through rather than dead code worth removing.
#[cfg_attr(not(windows), allow(dead_code))]
pub fn quiet_std(cmd: &mut std::process::Command) -> &mut std::process::Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}
