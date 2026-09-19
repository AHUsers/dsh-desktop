# Desktop Next implementation boundary

Desktop Next is a separate experimental package in the outer Yarn workspace.
Its reference is the MIT-licensed upstream `apps/desktop` and `apps/desktop-host`
at `ddefc45fbc7f8e46dd73185e68295696d1297887` (DSH 0.1.6-alpha.2).

The first implementation will use an Electron shell, an Electron Node-mode Host,
the authenticated WebServer and WebSocket transport, and the upstream Web client. The first
additional features are named Profiles, recovery, the existing Agents Anywhere
bridge, and the existing Community Market. Window presentation extensions are
deferred. Stable and Beta keep their current implementations.

Next owns its development home and Electron state. Profile switching and
recovery stop the old Host before starting the next generation. Recovery must
be reachable without loading the broken plugin graph. Market routes use the real upstream WebServer; application-origin forwarding
must preserve their mutation authority checks.
Remote control is explicitly enabled and keeps its Connector state in Next's
home. Build, typecheck, unit tests, and Host smokes must not launch Electron.

This iteration targets a runnable development package. Signed installers,
offline release seeds, automatic updates, data migration from Stable/Beta,
and enhanced windows require separate release qualification.
