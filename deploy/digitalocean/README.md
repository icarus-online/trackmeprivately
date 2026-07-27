# DigitalOcean production deployment

This directory contains the public-safe runtime configuration for the
single-purpose DigitalOcean analytics host. Provider resource identifiers,
credentials, DNS values, database files, and rollback records remain in private
operations storage.

## Boundaries

- Deploy only from `icarus-online/trackmeprivately`.
- Pin and record the reviewed source commit before building.
- Keep the application port on `127.0.0.1`; expose only HTTPS through Caddy.
- Use a dedicated host. Do not place this workload on the Icarus management
  gateway.
- Use private Tailscale administration and remove any temporary public SSH rule
  after enrollment.
- Persist SQLite at `/var/lib/trackmeprivately/data`.
- Enable DigitalOcean infrastructure backups and the SQLite backup timer.

## Install

Clone the organization repository into `/opt/trackmeprivately`, check out the
reviewed commit, and create a root-owned `.env` containing:

```env
NEXTAUTH_SECRET=replace-through-the-private-secret-workflow
ALLOWED_RP_ID=analytics.mathiaskoeppel.com
ALLOWED_RP_ORIGIN=https://analytics.mathiaskoeppel.com
SESSION_COOKIE_SAME_SITE=strict
```

Build and start the loopback-only service:

```bash
docker compose \
  -f docker-compose.yml \
  -f deploy/digitalocean/docker-compose.production.yml \
  up -d --build
```

Install the Caddy and backup configuration:

```bash
install -m 0644 deploy/digitalocean/Caddyfile /etc/caddy/Caddyfile
install -m 0755 deploy/digitalocean/backup-sqlite.sh /usr/local/sbin/trackmeprivately-backup
install -m 0644 deploy/digitalocean/trackmeprivately-backup.service /etc/systemd/system/
install -m 0644 deploy/digitalocean/trackmeprivately-backup.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now caddy trackmeprivately-backup.timer
```

Run and verify the first application-level backup before cutover:

```bash
systemctl start trackmeprivately-backup.service
systemctl is-active trackmeprivately-backup.timer
journalctl -u trackmeprivately-backup.service --no-pager -n 20
```

Backups are not automatically deleted by this configuration. Retention or
deletion requires a separately reviewed policy.

## Authority and cutover

Deploying and validating this target does not make it authoritative production.
Production DNS, the existing source service, and its rollback role remain
unchanged until a separately authorized DNS cutover has completed and public
validation has passed.

Keep the migration sequence explicit:

1. Record the exact reviewed source commit.
2. Deploy this independent analytics target and validate login, tracker
   collection, origin controls, persistence, and backups.
3. Record the rollback procedure privately, then authenticate the DNS workflow.
4. Change only the approved analytics DNS record; coordinate any website record
   change through the website repository's operations documentation.
5. Verify public TLS, passkey login, tracker collection, and persistence, then
   retain the source service through the agreed soak period.
6. Confirm that no dependencies remain before any shutdown-only decommission,
   then rerun production checks.

Deleting backups, snapshots, volumes, or account records is out of scope for
this migration and requires separate approval.

## Stateful migration gate

1. Stop writes on the source tracker long enough to take a consistent SQLite
   backup.
2. Verify the source backup with `PRAGMA integrity_check`.
3. Copy the backup through the private administration path into the persistent
   target directory and verify it again.
4. Start the container from the pinned organization commit.
5. Confirm the existing admin passkey login, tracker script, allowed-origin
   collection, unrelated-origin rejection, and event persistence across an
   application restart.
6. Verify Caddy HTTPS, the SQLite backup timer, and DigitalOcean recovery policy.
7. Change only the analytics DNS record and keep the source service available
   for rollback through the agreed soak period.

If rollback is needed after the new target accepted writes, stop writes on the
new target, restore DNS to the private pre-change value, verify the original
service, and reconcile new events before retrying. Do not discard either
database.
