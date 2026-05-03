# GovBus Mobile

Expo mobile app for GovBus live route broadcasting and commuter tracking.

## Setup

```bash
npm install
cp .env.example .env
npm start
```

`EXPO_PUBLIC_SOCKET_URL` must point to the production Socket.IO backend. Do not put database credentials or backend-only secrets in this mobile project.

## Quality Gates

```bash
npm run lint
npm run typecheck
```

## Production Notes

- Replace `com.govbus.mobile` in `app.json` if your final Play Store or App Store package ID is different.
- Build with a development build or EAS build when testing background location; Expo Go does not cover the full background-task behavior.
- Rotate any MongoDB credential that was ever stored in this repository or local `.env` before release.
- Confirm that the backend accepts `register_bus`, `update_location`, `stop_bus`, `request_bus_list`, and `join_route` events over the configured Socket.IO URL.
