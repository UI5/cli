import "../../utils/forcePollingWatcher.js";
import test from "ava";
import supertest from "supertest";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {serve} from "../../../lib/server.js";
import {graphFromPackageDependencies} from "@ui5/project/graph";
import * as projectWatcher from "@ui5/project/internal/graph/ProjectDefinitionWatcher";
import {isolatedUi5DataDir} from "../../utils/buildCacheIsolation.js";

// Integration coverage for stopping the build loop on a project-definition change. Before this fix,
// the outgoing BuildServer kept building through the stack swap while the incoming stack built too,
// and the two contended on the same refcounted CacheManager. serve() hides the BuildServer, so this
// watches the two places the concurrency surfaced: the `error` callback (shared-cache read failing)
// and the build-progress feed (a build-status outside the announced batch, shown as e.g. 5/1).

// Records build-metadata/build-status events, flagging any build-status for a project outside the
// last-announced batch (what advanceToProject() turns into a counter overrun), plus serve-error
// events. Returns a stop() that detaches the listeners and reports {violations, serveErrors}.
function trackBuildProgress() {
	let currentBatch = null; // project names from the last ui5.build-metadata
	const violations = [];
	const serveErrors = [];

	const onMetadata = ({projectsToBuild}) => {
		currentBatch = new Set(projectsToBuild);
	};
	const onStatus = ({projectName, status}) => {
		if (status !== "project-build-start" && status !== "project-build-skip") {
			return;
		}
		if (!currentBatch || !currentBatch.has(projectName)) {
			// A status for a project the current batch never announced: only two concurrent
			// builders (each with its own build-metadata) produce this on the shared feed.
			violations.push({projectName, batch: currentBatch ? [...currentBatch] : null});
		}
	};
	const onServeStatus = (evt) => {
		if (evt.status === "serve-error") {
			serveErrors.push(evt.error?.message ?? String(evt.error));
		}
	};

	process.on("ui5.build-metadata", onMetadata);
	process.on("ui5.build-status", onStatus);
	process.on("ui5.serve-status", onServeStatus);

	return () => {
		process.off("ui5.build-metadata", onMetadata);
		process.off("ui5.build-status", onStatus);
		process.off("ui5.serve-status", onServeStatus);
		return {violations, serveErrors};
	};
}

test.serial(
	"a definition change does not run two build loops concurrently across the swap",
	async (t) => {
		const ui5DataDir = isolatedUi5DataDir(t);
		const tmpProject = path.join("./test/tmp", `reinit-concurrency-${process.pid}`);
		await fs.rm(tmpProject, {recursive: true, force: true});
		await fs.cp("./test/fixtures/application.a", tmpProject, {recursive: true});

		const buildTmpGraph = () => graphFromPackageDependencies({cwd: tmpProject});
		const graph = await buildTmpGraph();

		let graphBuilds = 0;
		const graphFactory = async () => {
			graphBuilds++;
			return buildTmpGraph();
		};

		// The overlapping build loops fail on the shared cache: surfaces via the error callback and as
		// a serve-error on the feed (tracked above).
		const serverErrors = [];
		const onError = (err) => serverErrors.push(err?.message ?? String(err));

		const stop = trackBuildProgress();

		const server = await serve(graph, {
			port: 3398,
			changePortIfInUse: true,
			liveReload: false,
			ui5DataDir,
			cwd: tmpProject,
		}, onError, graphFactory, projectWatcher);

		t.teardown(async () => {
			stop();
			await new Promise((resolve) => server.close(resolve));
			await fs.rm(tmpProject, {recursive: true, force: true});
		});

		// Keep the outgoing build loop busy the way a `git checkout` does: a bounded source burst plus
		// reader requests. Bounded so the definition watcher can settle and fire the swap; a never-ending
		// burst would keep resetting the watcher and the swap would never happen.
		const request = supertest(`http://127.0.0.1:${server.port}`);
		const ui5YamlPath = path.join(tmpProject, "ui5.yaml");
		const sourcePath = path.join(tmpProject, "webapp", "test.js");
		const original = await fs.readFile(ui5YamlPath, "utf8");
		const sourceOriginal = await fs.readFile(sourcePath, "utf8");

		// Definition change (watched by ProjectDefinitionWatcher) opens the burst.
		await fs.writeFile(ui5YamlPath, original + "\n# definition-change edit\n");

		// Burst window: rewrite the source and hammer reader requests for ~2s, then go quiet.
		const burstEnd = Date.now() + 2000;
		let n = 0;
		while (Date.now() < burstEnd) {
			await request.get("/index.html").catch(() => {}); // suspended requests reject; ignore
			await fs.writeFile(sourcePath, sourceOriginal + `\n// burst ${n++}\n`).catch(() => {});
			await new Promise((resolve) => setTimeout(resolve, 50));
		}

		// Quiet: let the definition watcher settle and drive the re-init (settle + graph rebuild).
		const deadline = Date.now() + 15000;
		while (graphBuilds === 0 && Date.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
		t.true(graphBuilds >= 1, "the definition change drove at least one re-init via the watcher");

		// Let any post-swap build activity drain so late events/errors are captured before asserting.
		await new Promise((resolve) => setTimeout(resolve, 1000));

		const {violations, serveErrors} = stop();
		t.deepEqual([...serverErrors, ...serveErrors], [],
			"no BuildServer/serve error across the swap (a shared-cache failure would indicate two " +
			"build loops contending on the CacheManager)");
		t.deepEqual(violations, [],
			"no build-status was emitted for a project outside the announced batch " +
			"(would indicate two build loops running concurrently across the swap)");
	});
