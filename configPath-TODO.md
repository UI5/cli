configPath CODEX Issues:
A. Make “most specific wins” deterministic for overlapping workspace globs; add a regression test.
		--> (🧪 TEST WITH SAMPLE-APP -> file structure is prepared and script inside can be used -> see below!!)
B. Normalize resolution paths consistently so trailing slashes cannot defeat overrides
 --> ⚠️ package.json & ui5-workspace.yamls affected
C. ✅Correct duplicate-path detection to resolve against the workspace directory.


opencode -s ses_e3f2a7263ffeM3pcOD71cZzYDO


------------
A. Two sub issues: 

1. ✅🩹 The workspace resolution is a race condition which sometimes selects the wrong config (specified by `configPath`) due to a race [RACE CONDITION❗️ only applies sometimes, see cases below]
2. ✅🩹 The project graph logic (for npm workspaces) loses this `configPath` and loads the default ui5.yaml of this resolved library [ALWAYS HAPPENING❗️]
---

for 1.: bug occurs for..

case A:
"workspaces": [
    "common",
    "reporting/*",
   ]

case B:
  "workspaces": [
    "common",			// ---> This actually is related to issue B ("trailing slash")
    "reporting/"
   ]

case C:
`"workspaces": [
    "common",
    "reporting/chart",
	"reporting/table"
   ]`

⚠️..but does NOT occur for..
case O:
`"workspaces": [
    "common",
    "reporting"
   ]`
---

🧪 Testing: inside sample-app run (20 threads with 20 runs each -> 400 total):
`for worker in {1..20}; do
  node ./check-configpath-race.mjs 20 &
done
wait`

-----
