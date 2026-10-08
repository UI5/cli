#!/usr/bin/env bash
#
# Audits the current workspace's dependencies in three scopes and reports each one.
# All scopes always run; the script exits non-zero if any scope reported advisories.
#
#   locked · ci (dev + prod)   What the committed package-lock.json pins — the reproducible
#                              tree we build and test against.
#   latest (dev + prod)        What the whole repo resolves to today when the lockfile is
#                              ignored — early warning across everything we pull in.
#   latest (prod only)         What a fresh install gives consumers today (we publish without
#                              a lockfile) — the scope that reaches end users.
#
# npm resolves "latest" by re-installing after the lockfile is removed. "--ignore-scripts" is
# used everywhere: the audit only needs the resolved dependency tree, and never executing
# dependency lifecycle code keeps this safe to run on untrusted/unpinned versions.

# Note: no "-e" — a failing scope must not stop the remaining scopes from running.
set -uo pipefail

AUDIT_COMMAND="${AUDIT_COMMAND:-npm run audit}"
PROD_ONLY_ARGS="${PROD_ONLY_ARGS:- -- --skip-dev}"

failed=0

# run_scope <label> <command...>
run_scope() {
	local label="$1"
	shift
	echo "::group::Audit — ${label}"
	if "$@"; then
		echo "✓ ${label}: no blocking advisories"
	else
		echo "✗ ${label}: advisories found"
		failed=1
	fi
	echo "::endgroup::"
}

# 1) Locked tree, as committed.
npm ci --ignore-scripts
# shellcheck disable=SC2086 # intentional word-splitting of the configured command
run_scope "locked · ci (dev + prod)" ${AUDIT_COMMAND}

# Re-resolve every range to its latest satisfying version.
rm -rf node_modules package-lock.json
npm install --no-audit --no-fund --ignore-scripts

# 2) Latest, full tree. 3) Latest, production only (same install, narrower audit scope).
# shellcheck disable=SC2086
run_scope "latest (dev + prod)" ${AUDIT_COMMAND}
# shellcheck disable=SC2086
run_scope "latest (prod only)" ${AUDIT_COMMAND} ${PROD_ONLY_ARGS}

exit "${failed}"
