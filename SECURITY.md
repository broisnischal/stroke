# Security policy

## Reporting a vulnerability

**Please do not open a public issue.** Stroke holds database credentials and
connects to production systems, so a public report is a working exploit until
it is patched.

Report privately through
[GitHub Security Advisories](https://github.com/broisnischal/stroke/security/advisories/new),
or email **nischal.dahal@aitc.ai**.

Please include what you can: the version, your OS, what an attacker gains, and
the smallest set of steps that shows it. A proof of concept helps but is not
required — a clear description of the flaw is enough to start.

You will get a first response within 72 hours. If a report is valid you will be
told when a fix ships, and credited in the release notes unless you would
rather not be.

## What is in scope

- Credential or connection-secret disclosure — including anything that writes
  them somewhere they should not be
- Arbitrary code or SQL execution not initiated by the user
- Anything that lets a database, an AI provider, or a file the app opens reach
  outside its intended boundary
- Bypassing read-only mode
- Flaws in the updater or in release signing

## What is not

- Findings that need physical access to an unlocked machine
- Anything that requires the user to paste in a malicious connection string
  *and* confirm a destructive action, which the app already warns about
- Dependency advisories with no exploitable path in Stroke — report those
  upstream, or open a normal issue if a version bump is all that is needed

## Where secrets live

API keys and provider OAuth tokens go in the OS keychain (macOS Keychain,
Windows Credential Manager, Linux Secret Service), never in plaintext. Database
passwords are stored with the connection locally. If you find a path where any
of that reaches disk, a log, telemetry, or the network in the clear, that is a
vulnerability and is in scope.
