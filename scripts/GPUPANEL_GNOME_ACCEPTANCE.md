# GPUPanel Desktop — real GNOME/Wayland acceptance

This checklist is intentionally **manual and fail-closed**. The GitHub Actions Xvfb and nested Weston tests are synthetic, use a CI-only WebKit sandbox debug exception, and do not prove a normal desktop session. Never add that exception to a real session to make the test pass.

## Preconditions

1. Log in locally to a normal **Ubuntu 24.04 GNOME Wayland** desktop as a non-root user. Do not run through SSH forwarding, Xvfb, Weston, containers, or CI.
2. Extract the unsigned preview archive and independently review `build/provenance.txt` and `build/binary.sha256`. Treat the archive as untrusted preview software; a checksum proves byte identity, not publisher identity.
3. Do not export either `WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS` or `GPUPANEL_CI_WEBKIT_UNSANDBOXED`. The acceptance tool refuses if either variable is present.
4. Run read-only preflight from the extracted archive directory:

   ```sh
   ./acceptance/gnome-wayland.py --preflight
   ```

   `BLOCKED` means stop. Do not work around a failure by changing sandbox or session variables.

## Direct application test

Copy the reviewed binary into the exact user-local preview location expected by the launcher:

```sh
install -d -m 0700 ~/GPUPanel/desktop-preview/bin
install -m 0700 ./bin/gpupanel-desktop ~/GPUPanel/desktop-preview/bin/gpupanel-desktop
sha256sum ~/GPUPanel/desktop-preview/bin/gpupanel-desktop
cat ./build/binary.sha256
```

Only proceed if you have independently reviewed and matched the digest. Use the digest printed by `build/binary.sha256` as `EXPECTED_SHA256`:

```sh
./acceptance/gnome-wayland.py --run \
  --binary "$HOME/GPUPanel/desktop-preview/bin/gpupanel-desktop" \
  --expected-sha256 EXPECTED_SHA256
```

Confirm the Chinese UI is actually visible and interactive. If it exits, fails to display, or hangs, record that failure. Do not set the WebKit sandbox bypass.

## Manual checklist

- Confirm the menu entry launches the same reviewed app after installing it via the app's own approval flow.
- Open a project and verify Terminal starts in the selected project directory.
- Verify the selected editor opens the intended project (not just that a process was spawned).
- Verify the user-local menu entry persists after logout/login or reboot.
- Test Polkit allow and deny in a disposable Ubuntu machine only. Record actual package changes and logs independently. This acceptance helper intentionally does not launch privileged installs.
- Check project restore on a separate HOME or disposable machine. Confirm conflicts do not overwrite existing projects.

## Evidence and limits

The helper writes a JSON observation under `~/GPUPanel/acceptance/` with mode 0600. It omits environment variables, usernames, stdout and app logs. It is **operator self-report**, not cryptographic proof and not an independent review. Reconcile evidence with actual process/session behavior before accepting.

The tool only reports a process surviving five seconds and the operator's explicit observations. It does not claim it can independently inspect GNOME Shell activation, prove WebKit's internal sandbox is active, certify Polkit behavior, or prove complete workspace restoration.

Do not publish the preview as a signed package or change the pull request from Draft until a separate reviewer has inspected a real session and all release gates.