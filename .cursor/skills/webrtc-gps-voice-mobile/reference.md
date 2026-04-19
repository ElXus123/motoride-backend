# Reference: RTDB signaling, ICE, and telemetry

Use this file when the main skill is not enough—for schema design, edge cases, or review checklists.

## RTDB: signaling shape (illustrative)

Keep messages versioned by a **session id** so stale ICE/SDP from an old session are ignored.

```text
/rideSessions/{sessionId}/
  participants/{uid}: { joinedAt, displayName? }
  signal/{uid}/outgoing/{msgId}: { type, payload, ts, from }
```

Rotate or prune old `signal` nodes; use short TTL via Cloud Functions if needed.

## ICE restart vs full reconnect

| Symptom | First try | If that fails |
|--------|-----------|----------------|
| ICE disconnected briefly | `iceRestart` offer | Full PC recreate + new session id |
| Auth expired | Refresh token, keep PC if possible | New PC after token OK |
| App killed | N/A | Cold start: new session, reconcile presence |

## GPS ordering

- Prefer **server timestamp** for conflict resolution when multiple clients write.
- Client can send **local monotonic sequence** alongside to detect out-of-order merges on the client UI.

## Testing matrix (manual)

- Wi‑Fi → LTE → Wi‑Fi while session active
- Brief airplane mode (5–30 s)
- App background 1–5 min, return
- Low battery mode (OS may throttle)

## Anti-patterns

- Storing full SDP blobs repeatedly without deduplication or session scoping
- Location writes on a fixed 10 Hz regardless of motion
- Multiple `RTCPeerConnection`s per peer for audio only
- No cleanup of RTDB listeners on navigation
