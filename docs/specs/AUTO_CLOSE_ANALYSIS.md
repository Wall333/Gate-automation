# Auto-Close Gate — Test Cases & Mitigations

> **Feature:** v1.7 — Automatic Gate  
> **Date:** March 3, 2026  
> **Status:** Pre-implementation analysis

This document captures the edge cases and failure modes for the auto-close feature, given that the CAME DEIMOS ULTRA BT motor uses a **toggle-style cycle** (START input only, no discrete open/close commands).

---

## Background

### Motor behaviour

The CAME DEIMOS ULTRA BT control board has a single START input (terminal 61). Each pulse advances an internal cycle:

```
OPEN → STOP → CLOSE → STOP → OPEN → …
```

A pulse sent **during movement** always means **STOP**. There is no way to send a dedicated "open" or "close" command.

### Current sensing (v1.3.0+)

A normally-open reed switch is mounted at the **closed** position:

| Reed switch state | Meaning |
|-------------------|---------|
| LOW (magnet near) | Gate is fully closed |
| HIGH (magnet far) | Gate is **not closed** (open, opening, closing, or stopped mid-travel) |

The reed switch cannot distinguish between fully open, mid-travel, or which direction the gate is moving.

---

## Test Cases

| # | Scenario | What happens without mitigation | Result |
|---|----------|--------------------------------|--------|
| **1** | **Happy path** — gate opens, timer expires, Arduino pulses | Motor is stopped-while-open → pulse starts close cycle | ✅ Gate closes |
| **2** | **Manual remote open** — someone uses CAME remote to open, timer expires | Same as #1 — motor stopped-while-open → pulse closes | ✅ Gate closes |
| **3** | **Toggle open → toggle stop mid-travel** — gate starts opening, user pulses again to stop halfway | Motor stopped-during-opening. Reed says NOT CLOSED. Timer expires → pulse → motor's next step is CLOSE | ✅ Gate closes |
| **4** | **Gate stopped mid-close** — gate was closing, someone hit the remote to stop it mid-travel | Motor stopped-during-closing. Reed says NOT CLOSED. Timer expires → pulse → motor's next step is **OPEN** | ❌ Gate opens instead of closing |
| **5** | **Timer fires while gate is still opening** — timer set to 15s, gate takes 20s to fully open | Reed goes NOT CLOSED immediately when gate starts → timer starts → fires while motor is still running → pulse = STOP | ❌ Gate stops mid-travel, doesn't close |
| **6** | **Obstacle reversal** — auto-close pulse fires, gate starts closing, hits an obstacle, motor auto-reverses → gate reopens | Gate is open again. Without retry logic → stuck open. With naive retry → could loop forever | ❌ Infinite loop or stuck open |
| **7** | **Race condition: user + auto-close** — timer fires pulse, gate starts closing, user also taps toggle in app | Gate was moving (closing) → user pulse = STOP → gate stuck mid-travel, no active timer | ❌ Gate stuck half-open |
| **8** | **Arduino reboots while gate is open** — power loss, watchdog reset, or OTA update | Timer state lost. Gate stays open. Arduino reconnects but has no memory that auto-close was pending | ❌ Gate stays open forever |
| **9** | **Rapid toggles** — user presses toggle 3 times fast | Open → Stop → Close (or unpredictable). Motor state unclear. Timer may start/cancel erratically | ❌ Unpredictable motor state |
| **10** | **Reed switch bounce** — gate almost closed, magnet passes reed switch, contact bounces | Reed flickers CLOSED→OPEN rapidly → timer starts on the OPEN blip → fires later while gate is actually closed → pulse **opens** the gate | ❌ Gate unexpectedly opens |
| **11** | **Someone holds gate physically** — auto-close fires, gate tries to close, person holds it, motor stalls/reverses | Motor hits force limit → reverses or stops. Gate ends up open. Naive retry → repeated attempts → potential motor damage | ❌ Repeated close attempts |
| **12** | **Concurrent external close** — timer is counting down, but someone closes the gate via remote first | Gate closes → reed says CLOSED → timer fires anyway → pulse **opens** the gate | ❌ Gate reopens after manual close |
| **13** | **Gate partially open as "normal"** — someone intentionally stops mid-travel for airflow/pets | System treats it as "open" → keeps trying to auto-close → user keeps stopping → never-ending fight | ❌ Fights the user |

---

## Mitigations

### Software (no extra hardware)

| Mitigation | Description | Solves |
|-----------|-------------|--------|
| **Cancel timer on CLOSED** | If reed switch returns to CLOSED (LOW), immediately cancel any pending auto-close timer | #12 |
| **Debounce reed switch** | Ignore state changes shorter than 500 ms before acting on them | #10 |
| **Travel-time cooldown** | Don't start the auto-close timer until `TRAVEL_TIME` seconds after reed goes NOT CLOSED (e.g., 25s for a CAME DEIMOS that takes ~20s to fully open). Ensures the gate has finished opening before the countdown begins | #5 |
| **Single attempt only** | Auto-close tries once. If reed doesn't return to CLOSED within `TRAVEL_TIME` after the pulse, give up and send a notification ("Gate failed to auto-close") instead of retrying | #6, #11 |
| **Suppress during recent activity** | If any toggle (from app or detected reed movement) happened in the last `TRAVEL_TIME` seconds, postpone the auto-close timer | #7, #9 |
| **Persist timer state** | Save "gate opened at" timestamp to EEPROM. On reboot, check elapsed time — if auto-close is overdue, fire it; if still within window, restart the timer for the remaining time | #8 |
| **Track own pulses** | Record when we send a pulse and the expected result. If the outcome doesn't match within `TRAVEL_TIME` (e.g., we pulsed to close but reed never went CLOSED), flag a warning | #4, #6 |

### Hardware (one extra component)

| Mitigation | Description | Solves |
|-----------|-------------|--------|
| **Second reed switch at fully-open position** | Mount a second reed switch + magnet at the gate's fully-open end-stop. Now we have four observable states: CLOSED, OPENING/CLOSING (neither switch triggered), and OPEN. Only start auto-close when state is definitively OPEN. Only pulse if state is OPEN (not already CLOSING) | #3, #4, #5, #13 |

**Cost:** ~$1-2 for a second reed switch, one additional Arduino digital pin, two wires.

The second reed switch is the **single biggest improvement** because it eliminates the core ambiguity — with two switches we know the gate's actual position and can infer direction.

#### Two-switch state table

| Closed switch | Open switch | State |
|---------------|-------------|-------|
| LOW (magnet) | HIGH | CLOSED |
| HIGH | HIGH | MID-TRAVEL (opening or closing) |
| HIGH | LOW (magnet) | FULLY OPEN |
| LOW | LOW | INVALID (both magnets — wiring error) |

---

## Recommended Approach for v1.7

1. **Require a second reed switch** at the fully-open position
2. **Start auto-close timer only** when state = FULLY OPEN (open switch triggered)
3. **Cancel timer immediately** if state leaves FULLY OPEN (someone or something moved the gate)
4. **Single close attempt** — if gate doesn't reach CLOSED within `TRAVEL_TIME`, send a push notification ("Gate failed to auto-close") and stop
5. **Debounce both switches** (500 ms)
6. **Configurable timer** per device from the app (30s, 1 min, 2 min, 5 min)
7. **Cancel on CLOSED** — if gate reaches CLOSED before timer fires, cancel it
8. **Persist across reboots** — save open timestamp to EEPROM

### Wiring (v1.7)

```
Closed Reed Switch       Arduino UNO R4 WiFi
──────────────────       ───────────────────
Wire 1  ────────────►    Pin D4 (existing)
Wire 2  ────────────►    GND

Open Reed Switch
──────────────────
Wire 1  ────────────►    Pin D5 (new)
Wire 2  ────────────►    GND
```

Both pins use `INPUT_PULLUP`. LOW = magnet present, HIGH = no magnet.
