#!/bin/sh
set -eu

database_path="${TRACKER_DATABASE_PATH:-/var/lib/trackmeprivately/data/trackmeprivately.db}"
backup_directory="${TRACKER_BACKUP_DIRECTORY:-/var/backups/trackmeprivately}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
temporary_path="${backup_directory}/.${timestamp}.sqlite.tmp"
backup_path="${backup_directory}/${timestamp}.sqlite"

umask 077
install -d -m 0700 "${backup_directory}"

if [ ! -f "${database_path}" ]; then
  echo "Tracker database does not exist at the configured path." >&2
  exit 1
fi

sqlite3 "${database_path}" ".timeout 5000" ".backup '${temporary_path}'"

integrity="$(sqlite3 "${temporary_path}" "PRAGMA integrity_check;")"
if [ "${integrity}" != "ok" ]; then
  rm -f "${temporary_path}"
  echo "SQLite backup integrity check failed." >&2
  exit 1
fi

mv "${temporary_path}" "${backup_path}"
chmod 0600 "${backup_path}"

echo "SQLite backup completed and passed integrity check."
