import test from "ava";
import supertest from "supertest";
import {serve} from "../../../lib/server.js";
import http from "node:http";
import esmock from "esmock";
import {graphFromPackageDependencies} from "@ui5/project/graph";
import {isolatedUi5DataDir} from "../../utils/buildCacheIsolation.js";

test.serial("Start server - Port is already taken and an error occurs", async (t) => {
	t.plan(6);
	const port = 3360;
	const nodeServer = http.createServer((req, res) => {
		res.end();
	});

	await new Promise((resolve) => {
		nodeServer.on("listening", () => {
			resolve();
		});
		nodeServer.listen(port);
	});

	const graph = await graphFromPackageDependencies({
		cwd: "./test/fixtures/application.a"
	});

	const startServer = serve(graph, {
		port,
		ui5DataDir: isolatedUi5DataDir(t),
	});

	const error = await t.throwsAsync(startServer);
	t.is(
		error.message,
		"EADDRINUSE: Port 3360 is already in use.",
		"Correct error message"
	);
	t.is(
		error.code,
		"EADDRINUSE",
		"Correct error code"
	);
	t.is(
		error.errno,
		"EADDRINUSE",
		"Correct error number"
	);
	t.is(
		error.address,
		"127.0.0.1",
		"Correct error address"
	);
	t.is(
		error.port,
		3360,
		"Correct error port"
	);

	nodeServer.close();
});

test.serial("Start server together with node server - Port is already taken and the next one is used", async (t) => {
	t.plan(2);
	const port = 3370;
	const nextFoundPort = 3371;
	const nodeServer = http.createServer((req, res) => {
		res.end();
	});
	await new Promise((resolve) => {
		nodeServer.on("listening", () => {
			resolve();
		});
		nodeServer.listen(port);
	});

	const graph = await graphFromPackageDependencies({
		cwd: "./test/fixtures/application.a"
	});
	const server = await serve(graph, {
		port,
		changePortIfInUse: true,
		ui5DataDir: isolatedUi5DataDir(t),
	});

	t.deepEqual(server.port, nextFoundPort, "Resolves with correct port");
	const request = supertest(`http://127.0.0.1:${nextFoundPort}`);
	const result = await request.get("/index.html");
	if (result.error) {
		t.fail(result.error.text);
	}
	t.is(result.statusCode, 200, "Correct HTTP status code");
	nodeServer.close();
	server.close();
});

test.serial("listen - Port scan fails with a generic error", async (t) => {
	t.plan(3);
	// Simulate a non-ECONNREFUSED socket error during the port probe (e.g. an unreachable host):
	// it must be treated as a scan failure and propagate unchanged rather than be reported as "free".
	class FakeSocket {
		setTimeout() {}
		once(event, cb) {
			this._handlers = this._handlers || {};
			this._handlers[event] = cb;
		}
		connect() {
			const err = new Error("testError");
			err.code = "EHOSTUNREACH";
			queueMicrotask(() => this._handlers.error(err));
		}
		destroy() {}
	}
	const httpListener = await esmock("../../../lib/serve/httpListener.js", {
		"node:net": {default: {Socket: FakeSocket}, Socket: FakeSocket},
	});

	const server = httpListener.createServer({https: false}, (req, res) => res.end());
	const error = await t.throwsAsync(httpListener.listen(server, 3990, true, false));
	t.is(error.message, "testError", "Generic scan error is propagated unchanged");
	t.is(error.code, "EHOSTUNREACH", "Original error code is preserved");
});


test.serial(
	"Start server - Port is already taken and an error occurs because no other port can be determined",
	async (t) => {
		t.plan(6);
		const portStart = 4000;
		const portRange = 31;
		const servers = [];
		const serversStart = [];
		let port;
		let testServer;
		for (let i = 0; i < portRange; i++) {
			port = portStart + i;
			testServer = http.createServer((req, res) => {
				res.end();
			});
			servers.push(testServer);
			serversStart.push(new Promise((resolve) => {
				testServer.on("listening", () => {
					resolve();
				});
				testServer.listen(port);
			}));
		}

		await Promise.all(serversStart);
		const graph = await graphFromPackageDependencies({
			cwd: "./test/fixtures/application.a"
		});

		const startServer = serve(graph, {
			port: portStart,
			changePortIfInUse: true,
			ui5DataDir: isolatedUi5DataDir(t),
		});

		const error = await t.throwsAsync(startServer);
		for (let i = 0; i < servers.length; i++) {
			servers[i].close();
		}
		t.is(
			error.message,
			"EADDRINUSE: Could not find available ports between 4000 and 4030.",
			"Server could not start, port is already taken and no other port is used."
		);
		t.is(
			error.code,
			"EADDRINUSE",
			"Correct error code"
		);
		t.is(
			error.errno,
			"EADDRINUSE",
			"Correct error number"
		);
		t.is(
			error.address,
			"127.0.0.1",
			"Correct error address"
		);
		t.is(
			error.port,
			4030,
			"Correct error port"
		);
	});

test.serial("Start server twice - Port is already taken and the next one is used", async (t) => {
	t.plan(3);
	const port = 3380;
	const nextFoundPort = 3381;
	const ui5DataDir = isolatedUi5DataDir(t);
	const graph1 = await graphFromPackageDependencies({
		cwd: "./test/fixtures/application.a"
	});
	const serveResult1 = await serve(graph1, {
		port: port,
		changePortIfInUse: true,
		ui5DataDir,
	});
	t.deepEqual(serveResult1.port, port, "Resolves with correct port");

	const graph2 = await graphFromPackageDependencies({
		cwd: "./test/fixtures/application.a"
	});
	const serveResult2 = await serve(graph2, {
		port: port,
		changePortIfInUse: true,
		ui5DataDir,
	});
	t.deepEqual(serveResult2.port, nextFoundPort, "Resolves with correct port");

	const request = supertest(`http://127.0.0.1:${nextFoundPort}`);
	const result = await request.get("/index.html");
	if (result.error) {
		t.fail(result.error.text);
	}
	t.is(result.statusCode, 200, "Correct HTTP status code");
	serveResult1.close();
	serveResult2.close();
});
