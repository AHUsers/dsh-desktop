# Desktop Next implementation boundary

Desktop Next is a separate experimental package in the outer Yarn workspace.
Its reference is the MIT-licensed upstream `apps/desktop` and `apps/desktop-host`
at `fb2c4b9e698e30edb738bca4cf0618587db7d203` (DSH 0.1.5-rc.2).

The first implementation will use an Electron shell, an independent Node Host,
the upstream framed pipe transport, and the upstream Web client. The first
additional features are named Profiles, recovery, the existing Agents Anywhere
bridge, and the existing Community Market. Window presentation extensions are
deferred. Stable and Beta keep their current implementations.

Next owns its development home and Electron state. Profile switching and
recovery stop the old Host before starting the next generation. Recovery must
be reachable without loading the broken plugin graph. Market HTTP-style routes
need a socket-free adapter; merely inserting its Loader row is not sufficient.
Remote control is explicitly enabled and keeps its Connector state in Next's
home. Build, typecheck, unit tests, and Host smokes must not launch Electron.

This iteration targets a runnable development package. Signed installers,
offline release seeds, automatic updates, data migration from Stable/Beta,
and enhanced windows require separate release qualification.
