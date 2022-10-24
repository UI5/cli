import test from "ava";
import path from "node:path";
import {fileURLToPath} from "node:url";
import sinon from "sinon";
import Specification from "../../../../../lib/specifications/Specification.js";
import ServerMiddleware from "../../../../../lib/specifications/types/extensions/ServerMiddleware.js";

function clone(obj) {
	return JSON.parse(JSON.stringify(obj));
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const genericCjsExtensionPath = path.join(__dirname, "..", "..", "..", "..", "fixtures", "extension.a");
const genericEsmExtensionPath = path.join(__dirname, "..", "..", "..", "..", "fixtures", "extension.a.esm");
const basicCjsServerMiddlewareInput = {
	id: "server.middleware.a",
	version: "1.0.0",
	modulePath: genericCjsExtensionPath,
	configuration: {
		specVersion: "2.6",
		kind: "extension",
		type: "server-middleware",
		metadata: {
			name: "middleware-a"
		},
		middleware: {
			path: "lib/extensionModule.js"
		}
	}
};
const basicEsmServerMiddlewareInput = {
	id: "server.middleware.a",
	version: "1.0.0",
	modulePath: genericEsmExtensionPath,
	configuration: {
		specVersion: "2.6",
		kind: "extension",
		type: "server-middleware",
		metadata: {
			name: "middleware-a"
		},
		middleware: {
			path: "lib/extensionModule.js"
		}
	}
};

test.afterEach.always((t) => {
	sinon.restore();
});

test("Correct class (CJS)", async (t) => {
	const extension = await Specification.create(clone(basicCjsServerMiddlewareInput));
	t.true(extension instanceof ServerMiddleware, `Is an instance of the ServerMiddleware class`);
});
test("Correct class (ESM)", async (t) => {
	const extension = await Specification.create(clone(basicEsmServerMiddlewareInput));
	t.true(extension instanceof ServerMiddleware, `Is an instance of the ServerMiddleware class`);
});

test("getMiddleware (CJS)", async (t) => {
	const extension = await Specification.create(clone(basicCjsServerMiddlewareInput));
	const middlewarePromise = extension.getMiddleware();
	t.is(typeof middlewarePromise.then, "function");
	t.is(await middlewarePromise, "extension module",
		"Returned correct module");
});

test("getMiddleware (ESM)", async (t) => {
	const extension = await Specification.create(clone(basicEsmServerMiddlewareInput));
	const middlewarePromise = extension.getMiddleware();
	t.is(typeof middlewarePromise.then, "function");
	t.is(await middlewarePromise, "extension module",
		"Returned correct module");
});

test("Middleware with illegal suffix", async (t) => {
	const serverMiddlewareInput = clone(basicCjsServerMiddlewareInput);
	serverMiddlewareInput.configuration.metadata.name += "--1";
	const err = await t.throwsAsync(Specification.create(serverMiddlewareInput));
	t.is(err.message,
		"Failed to validate configuration of server-middleware extension middleware-a--1: " +
		"Server middleware name must not end with '--<number>'",
		"Threw with expected error message");
});
