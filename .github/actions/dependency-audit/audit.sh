#!/usr/bin/env bash
#
# Audits the current workspace's dependencies with audit-ci in three scopes, reports each one,
# and writes a comparison table to the GitHub job summary (or stdout when run locally).
#
#   locked · ci (dev + prod)   What the committed package-lock.json pins — the reproducible
#                              tree we build and test against.
#   latest (dev + prod)        What the repo resolves to today with the lockfile ignored —
#                              early warning across everything we pull in.
#   latest (prod only)         What a fresh install gives consumers today (production deps only).
#
# audit-ci runs every scope, so each repository/branch's own audit-ci config (allowlist, severity
# threshold, registry) is honoured — the config file is auto-detected from the checkout.
# "--ignore-scripts" is used for every install: the audit only needs the resolved dependency tree,
# and never running dependency lifecycle code keeps this safe on untrusted/unpinned versions.

# No "-e": a failing scope must not stop the remaining scopes from running.
set -uo pipefail

work="$(mktemp -d)"
trap 'rm -rf "${work}"' EXIT

failed=0

# Auto-detect this repo/branch's audit-ci config so audit-ci honours it (allowlist, levels, ...).
config_file=""
config_arg=""
for f in audit-ci.jsonc audit-ci.json .audit-ci.jsonc .audit-ci.json; do
	if [ -f "${f}" ]; then
		config_file="${f}"
		config_arg="--config ${f}"
		echo "Using audit-ci config: ${f}"
		break
	fi
done

# audit_scope <label> <snapshot-name> [extra audit-ci args]
# Runs audit-ci once per scope: its exit code gates pass/fail, its JSON output feeds the summary.
audit_scope() {
	local label="$1" name="$2"
	shift 2
	local rc=0
	echo "::group::Audit — ${label}"
	# shellcheck disable=SC2086 # intentional word-splitting of config_arg
	npx --yes audit-ci ${config_arg} "$@" --output-format json \
		> "${work}/${name}.json" 2> "${work}/${name}.log" || rc=$?
	cat "${work}/${name}.log" 2>/dev/null || true
	if [ "${rc}" -eq 0 ]; then
		echo "✓ ${label}: passed"
	else
		echo "✗ ${label}: audit-ci reported findings (exit ${rc})"
		failed=1
	fi
	echo "::endgroup::"
}

# 1) Locked tree, as committed.
npm ci --ignore-scripts
audit_scope "locked · ci (dev + prod)" locked

# Re-resolve every range to its latest satisfying version.
rm -rf node_modules package-lock.json
npm install --no-audit --no-fund --ignore-scripts

# 2) Latest, full tree. 3) Latest, production only (same install, narrower scope).
audit_scope "latest (dev + prod)" devprod
audit_scope "latest (prod only)" prod --skip-dev

# --- Comparison summary ---------------------------------------------------------
# Advisory ids the repo config allowlists, so the table matches audit-ci's effective verdict.
allowlist="${work}/allowlist.txt"
: > "${allowlist}"
if [ -n "${config_file}" ]; then
	# shellcheck disable=SC2016 # this is a Node.js program, not shell — no expansion wanted
	node -e '
		const fs = require("fs");
		const text = fs.readFileSync(process.argv[1], "utf8")
			.replace(/\/\*[\s\S]*?\*\//g, "")      // strip block comments
			.replace(/(^|[^:])\/\/.*$/gm, "$1");   // strip line comments (keep http://)
		const cfg = JSON.parse(text);
		for (const entry of (cfg.allowlist || [])) {
			console.log(String(entry).split("|")[0]); // advisory id, before any "|path"
		}
	' "${config_file}" > "${allowlist}" 2>/dev/null || true
fi

# extract <snapshot>: "ghsa <tab> package <tab> severity <tab> url", allowlisted ids removed.
extract() {
	jq -r --rawfile allow "${allowlist}" '
		($allow | split("\n") | map(select(length > 0))) as $al
		| [ (.advisories // {}) | to_entries[] | .value.via[]?
		    | select(type == "object")
		    | {g: ((.url // ("src-" + (.source|tostring))) | sub(".*/"; "")),
		       p: .name, s: .severity, u: (.url // "")} ]
		| map(select(.g as $g | ($al | index($g)) == null))
		| unique_by(.g)[] | [.g, .p, .s, .u] | @tsv
	' "${work}/$1.json" 2>/dev/null || true
}
extract prod    > "${work}/prod.tsv"
extract locked  > "${work}/locked.tsv"
extract devprod > "${work}/devprod.tsv"

# Join per advisory, mark presence per scope, sort ships-first then by severity.
rows="$(
	{
		awk -F'\t' '{print $1"\t1\t"$2"\t"$3"\t"$4}' "${work}/prod.tsv"
		awk -F'\t' '{print $1"\t2\t"$2"\t"$3"\t"$4}' "${work}/locked.tsv"
		awk -F'\t' '{print $1"\t3\t"$2"\t"$3"\t"$4}' "${work}/devprod.tsv"
	} | awk -F'\t' '
		{ g=$1; col=$2; pkg[g]=$3; sev[g]=$4; url[g]=$5; seen[g]=1; have[g SUBSEP col]=1 }
		END {
			rank["critical"]=0; rank["high"]=1; rank["moderate"]=2; rank["low"]=3; rank["info"]=4
			for (g in seen) {
				p=(have[g SUBSEP 1]?"✓":"–"); l=(have[g SUBSEP 2]?"✓":"–"); d=(have[g SUBSEP 3]?"✓":"–")
				adv=(url[g]!=""?"["g"]("url[g]")":g)
				sr=(sev[g] in rank)?rank[sev[g]]:4
				ships=(have[g SUBSEP 1]?0:1)
				printf "%d%d\t| %s | `%s` | %s | %s | %s | %s |\n", ships, sr, adv, pkg[g], sev[g], p, l, d
			}
		}' | sort | cut -f2-
)"

{
	echo "## Security audit comparison"
	echo
	echo "| Advisory | Package | Severity | prod · latest (ships) | locked · ci | dev + prod · latest |"
	echo "|---|---|---|:--:|:--:|:--:|"
	if [ -n "${rows}" ]; then echo "${rows}"; else echo "| _none_ | | | | | |"; fi
	echo
	echo "**How to read:** \`✓\` under **prod · latest** reaches a fresh install today — fix first." \
		"A row \`✓\` only under **locked · ci** clears by refreshing the lockfile." \
		"Advisories allowlisted in this repo's audit-ci config are excluded."
} >> "${GITHUB_STEP_SUMMARY:-/dev/stdout}"

exit "${failed}"
