const test = require("ava");
const supertest = require("supertest");
const ui5Server = require("../../../");
const server = ui5Server.server;
const http = require("http");
const portscanner = require("portscanner");
const sinon = require("sinon");
const generateProjectGraph = require("@ui5/project").generateProjectGraph.usingNodePackageDependencies;

let serve;

// Start server before running tests
test.before(async (t) => {
	const graph = await generateProjectGraph({
		cwd: "./test/fixtures/application.a"
	});

	serve = await server.serve(graph, {
		port: 3335
	});
});

test.after(() => {
	sinon.restore();
	return new Promise((resolve, reject) => {
		serve.close((error) => {
			if (error) {
				reject(error);
			} else {
				resolve();
			}
		});
	});
});

test("Start server - Port is already taken and an error occurs", async (t) => {
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

	const graph = await generateProjectGraph({
		cwd: "./test/fixtures/application.a"
	});

	const startServer = server.serve(graph, {
		port
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
		"localhost",
		"Correct error address"
	);
	t.is(
		error.port,
		3360,
		"Correct error port"
	);
});

test("Start server together with node server - Port is already taken and the next one is used", async (t) => {
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

	const graph = await generateProjectGraph({
		cwd: "./test/fixtures/application.a"
	});
	const serve = await server.serve(graph, {
		port,
		changePortIfInUse: true
	});

	t.deepEqual(serve.port, nextFoundPort, "Resolves with correct port");
	const request = supertest(`http://localhost:${nextFoundPort}`);
	const result = await request.get("/index.html");
	if (result.error) {
		t.fail(result.error.text);
	}
	t.is(result.statusCode, 200, "Correct HTTP status code");
	nodeServer.close();
	serve.close();
});

test.serial("Start server - Port can not be determined and an error occurs", async (t) => {
	t.plan(2);
	const portscannerFake = function(port, portMax, host, callback) {
		return new Promise((resolve) => {
			callback(new Error("testError"), false);
			resolve();
		});
	};
	const portScannerStub = sinon.stub(portscanner, "findAPortNotInUse").callsFake(portscannerFake);

	const graph = await generateProjectGraph({
		cwd: "./test/fixtures/application.a"
	});
	const startServer = server.serve(graph, {
		port: 3990,
		changePortIfInUse: true
	});

	const error = await t.throwsAsync(startServer);
	t.is(error.message, "testError",
		"Server could not start, port is already taken and no other port is used.");
	portScannerStub.restore();
});


test("Start server - Port is already taken and an error occurs because no other port can be determined", async (t) => {
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
	const graph = await generateProjectGraph({
		cwd: "./test/fixtures/application.a"
	});

	const startServer = server.serve(graph, {
		port: portStart,
		changePortIfInUse: true
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
		"localhost",
		"Correct error address"
	);
	t.is(
		error.port,
		4030,
		"Correct error port"
	);
});

test("Start server twice - Port is already taken and the next one is used", async (t) => {
	t.plan(3);
	const port = 3380;
	const nextFoundPort = 3381;
	const graph1 = await generateProjectGraph({
		cwd: "./test/fixtures/application.a"
	});
	const serveResult1 = await server.serve(graph1, {
		port: port,
		changePortIfInUse: true
	});
	t.deepEqual(serveResult1.port, port, "Resolves with correct port");

	const graph2 = await generateProjectGraph({
		cwd: "./test/fixtures/application.a"
	});
	const serveResult2 = await server.serve(graph2, {
		port: port,
		changePortIfInUse: true
	});
	t.deepEqual(serveResult2.port, nextFoundPort, "Resolves with correct port");

	const request = supertest(`http://localhost:${nextFoundPort}`);
	const result = await request.get("/index.html");
	if (result.error) {
		t.fail(result.error.text);
	}
	t.is(result.statusCode, 200, "Correct HTTP status code");
	serveResult1.close();
	serveResult2.close();
});
