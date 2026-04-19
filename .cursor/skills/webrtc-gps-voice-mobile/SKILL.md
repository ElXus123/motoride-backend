---
name: webrtc-gps-voice-mobile
description: >-
  Architects low-latency GPS tracking and voice intercom using WebRTC, Firebase
  Realtime Database, and the Web Audio API, optimizing bandwidth and reconnection
  on cellular (4G/5G). Use when designing or debugging real-time location sharing,
  rider voice chat, RTDB signaling, ICE/TURN, mobile backgrounding, or flaky networks.
---

# WebRTC + RTDB: GPS & Voice on Mobile

## Role

Prefer a **clear split**: signaling and lightweight state in **Firebase Realtime Database**; **voice** over **WebRTC** (audio tracks). **GPS telemetry** is usually **not** WebRTC—use RTDB (or a dedicated path) with aggressive throttling unless the user explicitly needs a WebRTC Data Channel for peer-to-peer location (rare).

## Architecture checklist

1. **Signaling path (RTDB)**: SDP/ICE offers/answers, session version, participant presence. Keep payloads small; use short keys in JSON if volume matters.
2. **Media path (WebRTC)**: Audio in/out via `getUserMedia` / `RTCPeerConnection`. Prefer **Opus**; set sensible `RTCRtpSender` params where supported.
3. **Telemetry path (RTDB or batch)**: Location updates with **adaptive intervals**, **delta encoding** (only when lat/lng/speed/bearing change meaningfully), and **server timestamps** or monotonic clocks for ordering.
4. **TURN**: Plan for **symmetric NAT** and carrier CGNAT on cellular—**TURN over TLS** (443) often works where UDP is constrained; budget for TURN egress cost vs P2P success rate.

## Bandwidth: GPS

- **Throttle** by speed: slower when stationary or slow; faster when moving quickly (cap max rate, e.g. 1–4 Hz effective with smoothing).
- **Send deltas**: skip writes when movement is below a distance threshold or heading change is negligible.
- **Batch** if the client allows: multiple points in one write only if ordering and merge semantics stay correct.
- **Avoid** huge JSON: minimal fields; avoid redundant user profile on every location write.
- **Compress semantics**, not gzip in the client for RTDB—RTDB is JSON over a persistent connection; savings come from **fewer writes** and **smaller documents**.

## Bandwidth: voice (WebRTC)

- Prefer **mono**, **low bitrate Opus** for intercom-style speech; stereo only if required.
- **Disable** video unless explicitly needed.
- **DTX / inactivity**: use codec features that reduce silence if appropriate for the product (test for clipping).
- **One peer connection per session design**: avoid redundant PCs; multiplex audio with `addTrack` / transceivers as needed.

## Mobile network: reconnection

### WebRTC

- Listen for `connectionstatechange`, `iceconnectionstatechange`, `signalingstatechange`.
- On **failed** / **disconnected**: **ICE restart** (`createOffer({ iceRestart: true })`) before full teardown; escalate to full reconnect if restart fails.
- **ICE candidate** trickling via RTDB: debounce bursts; cap queue size; drop stale generations using a **session id** incremented on each new "call".
- Recreate `RTCPeerConnection` after app **background** on iOS/Android if the platform tears down tracks—test on real devices.

### Firebase Realtime Database

- Use **`onDisconnect`** for presence cleanup where applicable.
- Handle **auth token refresh** (`onIdTokenChanged`) so RTDB reconnects with valid creds.
- Avoid duplicating listeners: **single** listener per path pattern; unsubscribe on unroute/unmount.
- Model **explicit connection state**: `.info/connected` (or SDK connection state) to pause non-critical writes during outages and **flush a queue** when back.

### App lifecycle

- **Foreground**: normal cadence for GPS and ICE keepalives.
- **Background**: reduce or pause GPS and expect WebRTC to suspend—renegotiate on resume; show UX for "reconnecting".

## Web Audio API

- Use for **local monitoring**, **gain staging**, **VU metering**, or **processing**—not as a replacement for WebRTC transport.
- Always **disconnect** `AudioNode`s and close `AudioContext` when tearing down sessions to avoid leaks.
- Respect **echo cancellation / noise suppression** constraints in `getUserMedia` for intercom clarity.

## Implementation order (suggested)

1. RTDB presence + minimal signaling schema (session id, participant map).
2. WebRTC offer/answer flow with ICE restart path tested on **Wi‑Fi → cellular** handoff.
3. GPS pipeline with adaptive throttle + delta writes; verify ordering under load.
4. Stress: toggle airplane mode, background app, kill/reopen; confirm no duplicate listeners and no runaway writes.

## Additional resources

- Deeper patterns, schema sketches, and failure modes: [reference.md](reference.md)
