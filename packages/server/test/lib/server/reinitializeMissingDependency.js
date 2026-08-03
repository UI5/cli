import test from "ava";
import supertest from "supertest";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {serve} from "../../../lib/server.js";
import {graphFromPackageDependencies} from "@ui5/project/graph";
import {isolatedUi5DataDir} from "../../utils/buildCacheIsolation.js";

// A newly-declared but missing dependency drives the server DEGRADED (500 on every request). Once it
// is installed at its node_modules path, the server recovers on its own via the Supervisor's
// slow-phase recovery poll, without a further definition edit.
//
// Recovery is two-phase: a fast burst (5 attempts, ~550 ms apart) bounded by RecoveryBudget, then an
// indefinite slow poll. To exercise the slow poll, the install must land after the fast budget is
// spent, so the test drains it (waits for ui5.project-resolve-failed to go quiet) before installing.

test(
	"a late-installed missing dependency lets the server recover without a further edit",
	async (t) => {
		// Fast-burst drain (~3 s) plus the real 30 s slow-poll interval before recovery. The slow
		// interval is not injectable (it is not a shipped option), so the test waits it out.
		t.timeout(60000);

		const ui5DataDir = isolatedUi5DataDir(t);
		const tmpProject = path.join("./test/tmp", `reinit-missingdep-${process.pid}`);
		await fs.rm(tmpProject, {recursive: true, force: true});
		await fs.cp("./test/fixtures/application.a", tmpProject, {recursive: true});

		const graphFactory = () => graphFromPackageDependencies({cwd: tmpProject});
		const graph = await graphFactory();

		const server = await serve(graph, {
			port: 3399,
			changePortIfInUse: true,
			liveReload: false,
			ui5DataDir,
			cwd: tmpProject,
		}, undefined, graphFactory);

		t.teardown(async () => {
			await new Promise((resolve) => server.close(resolve));
			await fs.rm(tmpProject, {recursive: true, force: true});
		});

		const request = supertest(`http://127.0.0.1:${server.port}`);
		t.is((await request.get("/index.html")).statusCode, 200, "serves before the missing dependency");

		// Timestamp each failed re-resolve so the drain loop can tell when the fast budget is spent.
		let lastResolveFailure = 0;
		const onResolveFailed = () => {
			lastResolveFailure = Date.now();
		};
		process.on("ui5.project-resolve-failed", onResolveFailed);
		t.teardown(() => process.off("ui5.project-resolve-failed", onResolveFailed));

		// Declare an uninstalled dependency. The watched root package.json fires the re-resolve, which
		// throws "Unable to locate module library.e ..." and goes DEGRADED.
		const pkgPath = path.join(tmpProject, "package.json");
		const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8"));
		pkg.dependencies["library.e"] = "file:../library.e";
		await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

		// The server goes DEGRADED and serves 500.
		const degradedDeadline = Date.now() + 10000;
		let degraded = false;
		while (Date.now() < degradedDeadline) {
			if ((await request.get("/index.html")).statusCode === 500) {
				degraded = true;
				break;
			}
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
		t.true(degraded, "the missing dependency drives the server into a degraded (500) state");

		// Drain the fast recovery budget: wait for a ~1.2 s quiet window (over the ~550 ms fast cadence,
		// under the slow interval, so the burst has ended and the next slow poll has not yet fired).
		// Installing before this drains would recover in the fast phase, not exercising the slow poll.
		const quietWindow = 1200;
		const drainDeadline = Date.now() + 15000;
		while (Date.now() < drainDeadline) {
			if (lastResolveFailure !== 0 && Date.now() - lastResolveFailure > quietWindow) {
				break;
			}
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		// Install the dependency at its node_modules path, after the fast budget is spent.
		await fs.cp("./test/fixtures/library.e",
			path.join(tmpProject, "node_modules", "library.e"), {recursive: true});

		// The slow poll detects the install and re-resolves to 200, without a further definition edit.
		// Allow one full slow interval (30 s) plus margin for the re-resolve and build.
		const recoverDeadline = Date.now() + 35000;
		let status = 500;
		while (Date.now() < recoverDeadline) {
			status = (await request.get("/index.html")).statusCode;
			if (status === 200) {
				break;
			}
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		t.is(status, 200, "the server recovers on its own once the missing dependency is installed");
	});
