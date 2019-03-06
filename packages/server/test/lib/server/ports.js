const {test} = require("ava");
const supertest = require("supertest");
const ui5Server = require("../../../");
const server = ui5Server.server;
const normalizer = require("@ui5/project").normalizer;
const http = require("http");
const portscanner = require("portscanner");
const sinon = require("sinon");

let serve;

// Start server before running tests
test.before((t) => {
	return normalizer.generateProjectTree({
		cwd: "./test/fixtures/application.a"
	}).then((tree) => {
		return server.serve(tree, {
			port: 3335
		}).then((serveResult) => {
			serve = serveResult;
		});
	});
});

test.after(() => {
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
	t.plan(2);
	const port = 3360;
	const nodeServer = http.createServer((req, res) => {
		res.end();
	});

	const startServer = new Promise((resolve) => {
		nodeServer.on("listening", () => {
			resolve();
		});
		nodeServer.listen(port);
	}).then(() => {
		return normalizer.generateProjectTree({
			cwd: "./test/fixtures/application.a"
		}).then((tree) => {
			return server.serve(tree, {
				port: port
			});
		});
	});

	return t.throws(startServer).then((error) => {
		t.deepEqual(
			error.message,
			"Port 3360 already in use.", "Server could not start, port is already taken and no other port is used."
		);
	});
});

test("Start server together with node server - Port is already taken and the next one is used", (t) => {
	t.plan(2);
	const port = 3370;
	const nextFoundPort = 3371;
	const nodeServer = http.createServer((req, res) => {
		res.end();
	});
	return new Promise((resolve) => {
		nodeServer.on("listening", () => {
			resolve();
		});
		nodeServer.listen(port);
	}).then(() => {
		return normalizer.generateProjectTree({
			cwd: "./test/fixtures/application.a"
		}).then((tree) => {
			return server.serve(tree, {
				port: port,
				changePortIfInUse: true
			}).then((serveResult) => {
				t.deepEqual(serveResult.port, nextFoundPort, "Resolves with correct port");
				const request = supertest(`http://localhost:${nextFoundPort}`);
				return request.get("/index.html").then((res) => {
					if (res.error) {
						t.fail(res.error.text);
					}
					t.deepEqual(res.statusCode, 200, "Correct HTTP status code");
					nodeServer.close();
					serveResult.close();
				});
			});
		});
	});
});

test.serial("Start server - Port can not be determined and an error occurs", (t) => {
	t.plan(2);
	const portscannerFake = function(port, portMax, host, callback) {
		return new Promise((resolve) => {
			callback("testError", false);
			resolve();
		});
	};
	const portScannerStub = sinon.stub(portscanner, "findAPortNotInUse").callsFake(portscannerFake);

	const startServer = normalizer.generateProjectTree({
		cwd: "./test/fixtures/application.a"
	}).then((tree) => {
		return server.serve(tree, {
			port: 3990,
			changePortIfInUse: true
		});
	});

	return t.throws(startServer).then((error) => {
		t.deepEqual(error, "testError", "Server could not start, port is already taken and no other port is used.");
		portScannerStub.restore();
	});
});


test("Start server - Port is already taken and an error occurs because no other port can be determined", (t) => {
	t.plan(2);
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

	const startServer = Promise.all(serversStart).then(() => {
		return normalizer.generateProjectTree({
			cwd: "./test/fixtures/application.a"
		}).then((tree) => {
			return server.serve(tree, {
				port: portStart,
				changePortIfInUse: true
			});
		});
	});
	return t.throws(startServer).then((error) => {
		for (let i = 0; i < servers.length; i++) {
			servers[i].close();
		}
		t.deepEqual(
			error.message,
			"Could not find available ports between 4000 and 4030.",
			"Server could not start, port is already taken and no other port is used."
		);
	});
});

test("Start server twice - Port is already taken and the next one is used", (t) => {
	t.plan(3);
	const port = 3380;
	const nextFoundPort = 3381;
	return normalizer.generateProjectTree({
		cwd: "./test/fixtures/application.a"
	}).then((tree) => {
		return server.serve(tree, {
			port: port,
			changePortIfInUse: true
		});
	}).then((serveResult1) => {
		t.deepEqual(serveResult1.port, port, "Resolves with correct port");
		return normalizer.generateProjectTree({
			cwd: "./test/fixtures/application.a"
		}).then((tree) =>{
			return server.serve(tree, {
				port: port,
				changePortIfInUse: true
			}).then((serveResult2) => {
				t.deepEqual(serveResult2.port, nextFoundPort, "Resolves with correct port");
				const request = supertest(`http://localhost:${nextFoundPort}`);
				return request.get("/index.html").then((res) => {
					if (res.error) {
						t.fail(res.error.text);
					}
					t.deepEqual(res.statusCode, 200, "Correct HTTP status code");
					serveResult1.close();
					serveResult2.close();
				});
			});
		});
	});
});
