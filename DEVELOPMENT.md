# Development Workflow

This project follows a **specification-first** workflow. No production code should be written for a feature until its specification has been reviewed and approved.

## Specification-First Process

### 1. Write or Update a Spec

Before starting work on a new feature or significant change, create (or update) a Markdown specification in `docs/specs/`. Use a clear, versioned name:

```
docs/specs/MVP_GATE_CONTROLLER_v1.md
docs/specs/GUEST_ACCESS_v1.md
```

### 2. Required Sections

Every spec must include:

- **Overview** — What is being built and why.
- **Architecture** — How the components interact (text diagram preferred).
- **Auth & Authorization** — How users and devices authenticate; what permissions are required.
- **Data Model** — Tables/collections with columns, types, and constraints.
- **API Endpoints** — Method, path, request/response examples.
- **Implementation Steps** — Ordered list of incremental work items (MVP-first).
- **Test Plan** — Key scenarios to verify before the feature is considered complete.
- **Security Considerations** — Threat mitigations relevant to this feature.

### 3. Review Checklist

Before approving a spec, confirm:

- [ ] All required sections are present and complete.
- [ ] The scope is clearly bounded (what's in, what's out).
- [ ] Security concerns are addressed (secrets, auth, input validation).
- [ ] The implementation steps are small and independently testable.
- [ ] Environment variables are documented in `.env.example`.

### 4. Approval Gate

**No production code is written until the spec is approved.** The spec author must receive explicit approval (PR review, verbal confirmation, or written sign-off) before proceeding to implementation.

### 5. Incremental Delivery

After approval, implement in small steps:

1. Complete one implementation step from the spec.
2. Summarize what changed and how to run/test it.
3. Get confirmation before moving to the next step.

This keeps changes reviewable and reduces the risk of large, hard-to-debug commits.

## Local Development

### Server

```bash
cd server
cp .env.example .env   # fill in values
npm install
npm run dev             # starts with file-watching
```

### Mobile

```bash
cd mobile
npm install
```

#### Building the APK (Local — Windows)

Requires **JDK 17** and **Android SDK** (installed via `winget install Microsoft.OpenJDK.17` + Android SDK command-line tools).

```bash
# Generate native Android project
npx expo prebuild --platform android --clean

# Build APK with Gradle
cd android
# Set env vars (PowerShell)
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
.\gradlew.bat assembleRelease
```

APK output: `mobile/android/app/build/outputs/apk/release/app-release.apk`

Transfer to your phone via USB or cloud storage and install.

> **Note:** The local build uses a debug keystore. Its SHA-1 (`5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`) must be registered in Google Cloud Console for Google Sign-In to work.

#### Building the APK (EAS Cloud)

```bash
npx eas build --platform android --profile preview --non-interactive
```

EAS cloud builds use a separate keystore (SHA-1 `44:9E:A1:1F:93:D6:0F:5A:43:E4:C1:B1:3B:A8:DF:54:01:D1:66:21`). The free tier has monthly build limits.

### Arduino

Open the sketch in Arduino IDE, install the required libraries (WiFiS3, ArduinoHttpClient, ArduinoJson v7+, Arduino_LED_Matrix), and upload to the board.

On first boot the Arduino starts as a WiFi Access Point named **GateController** (password: `gatesetup`). Use the mobile app → Settings → Add Device to provision:

1. The app **auto-detects** your current WiFi network name (SSID).
2. Server host and port are **auto-filled** from the app's configuration.
3. A unique device token is **auto-generated** by calling `POST /admin/devices`.
4. You only need to enter your **WiFi password** (and optionally rename the device).

Config is stored in EEPROM — no secrets in source code. When the Arduino successfully authenticates with the server, it shows a **heart shape** on the built-in 12×8 LED matrix.

To view device settings (connected server, WiFi info, etc.), long-press a device card in the app and select "Device Settings", or tap the ⚙️ icon on the device detail screen. You can rename the device by tapping the ✎ pencil icon on the settings screen.

To factory-reset: hold pin 3 LOW during boot (the sketch waits up to 3 seconds for serial, then checks the pin — no Serial Monitor required).

## Environment Variables

All secrets and configuration values are stored in `.env` files (never committed). A template is provided at the repo root (`.env.example`) and in each component directory.
