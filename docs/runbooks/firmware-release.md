# Firmware Release Runbook

This is the fastest way to publish new Arduino firmware on the server so the app sees it as the latest available version and offers the OTA update prompt.

## Important Behavior

- The app compares the device's reported `firmwareVersion` against the latest record in the server's `Firmware` table.
- "Latest" is selected by `uploadedAt DESC`, not semantic version parsing.
- That means the most recently published firmware becomes the one the app offers, even if the version string is lower.

## 1. Build the Firmware Locally

From Arduino IDE, build/export the current sketch so you get a `.bin` file for the release you want to publish.

Expected release for the current recovery fix: `1.5.9`

## 2. Convert `.bin` to `.ota`

From the repo root on your local machine:

```bash
python tools/bin2ota.py <input.bin> <output.ota>
```

Example:

```bash
python tools/bin2ota.py build/gate_controller.bin build/gate_controller_v1.5.9.ota
```

Use the `.ota` file for server publishing and OTA delivery.

## 3. Copy the OTA File to the VM

Example with `gcloud`:

```bash
gcloud compute scp build/gate_controller_v1.5.9.ota gate-server:~/gate_controller_v1.5.9.ota --zone us-west1-b
```

## 4. Publish It on the Server Over SSH

SSH into the VM and run:

```bash
cd ~/Gate-automation/server
npm run publish:firmware -- ~/gate_controller_v1.5.9.ota --version 1.5.9
```

That command:

- copies the file into `server/firmware/`
- creates the `Firmware` DB row
- makes it the newest firmware the app will see

Expected output includes the new firmware `id`, `storedName`, `version`, and `uploadedAt`.

## 5. Verify Before Triggering OTA

In the app:

- open Device Settings for the gate
- confirm the device still shows online
- confirm the app now shows latest available firmware as `1.5.9`
- confirm the device's current firmware is still below that, such as `1.5.4`

At that point the app should show the update action automatically.

## 6. Trigger the OTA Update

Use the app's existing update button. The server already knows which firmware is latest and will serve the file from `/firmware/download/:storedName`.

Wait for the device to:

- download the firmware
- reboot
- reconnect to the server
- report firmware version `1.5.9`

## 7. Change the WiFi After the OTA Succeeds

Only do this after the device is confirmed on the new firmware.

Then:

1. Change the router SSID and/or password.
2. Wait several minutes while the Arduino fails to reconnect to the old saved WiFi.
3. The device should automatically reopen the `GateController` setup AP.
4. On your phone, connect to the `GateController` WiFi.
5. In the app, use Add Device again and enter the new WiFi credentials.
6. Keep the same server host/domain settings used now.
7. Finish provisioning and wait for the device to reconnect.

If the setup AP does not come back, use the physical fallback:

1. Hold pin 3 LOW during boot.
2. Re-provision through Add Device.

## Notes

- Do not publish an older firmware after a newer one unless you want the app to offer the older one as the latest release.
- The server-side publisher accepts `.bin` or `.ota`, but `.ota` is the intended OTA payload format for the UNO R4 WiFi.
- The device must still be online when you trigger OTA. Once it has lost connectivity, OTA cannot rescue it.