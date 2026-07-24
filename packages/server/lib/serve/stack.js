import express from "express";
import MiddlewareManager from "../middleware/MiddlewareManager.js";
import createErrorHandler from "../middleware/errorHandler.js";
import {createReaderCollection} from "@ui5/fs/resourceFactory";
import ReaderCollectionPrioritized from "@ui5/fs/ReaderCollectionPrioritized";
import {getLogger} from "@ui5/logger";
import Cache from "@ui5/project/build/cache/Cache";

const log = getLogger("server");

/**
 * Builds the middleware-bearing router and its BuildServer for a project graph, without
 * binding to a port and without a terminal error handler. This is the router-agnostic core
 * shared between the {@link module:@ui5/server.serve} wrapper (via {@link buildApp}) and
 * the {@link module:@ui5/server.serveMiddleware} embedding API: everything needed to answer
 * requests is mounted onto an {@link https://expressjs.com/en/4x/api.html#router Express Router},
 * which both an Express application and a Connect app accept via <code>use()</code>.
 *
 * @private
 * @param {@ui5/project/graph/ProjectGraph} graph Project graph
 * @param {object} config Server configuration: the resolved options
 *   (<code>sendSAPTargetCSP</code>, <code>simpleIndex</code>, <code>liveReload</code>,
 *   <code>serveCSPReports</code>, <code>cache</code>, <code>ui5DataDir</code>,
 *   <code>includedTasks</code>, <code>excludedTasks</code>), plus a stable
 *   <code>webSocketToken</code> shared across swaps
 * @param {Function} [error] Error callback invoked when the BuildServer emits an error outside
 *   of request handling
 * @returns {Promise<object>} Resolves with <code>{router, buildServer, liveReloadOptions}</code>
 */
export async function buildRouter(graph, config, error) {
	const {
		sendSAPTargetCSP = false, simpleIndex = false, liveReload = false, serveCSPReports = false,
		cache = Cache.Default, ui5DataDir, includedTasks, excludedTasks, webSocketToken = null,
	} = config;
	const rootProject = graph.getRoot();

	const readers = [];
	await graph.traverseBreadthFirst(async function({project: dep}) {
		if (dep.getName() === rootProject.getName()) {
			// Ignore root project
			return;
		}
		readers.push(dep.getSourceReader("runtime"));
	});

	const dependencies = createReaderCollection({
		name: `Dependency reader collection for sources of project ${rootProject.getName()}`,
		readers
	});

	const rootReader = rootProject.getSourceReader("runtime");

	// TODO change to ReaderCollection once duplicates are sorted out
	const combo = new ReaderCollectionPrioritized({
		name: "Server: Reader for sources of all projects",
		readers: [rootReader, dependencies]
	});
	const sources = {
		rootProject: rootReader,
		dependencies: dependencies,
		all: combo
	};

	const initialBuildIncludedDependencies = [];
	if (graph.getProject("sap.ui.core")) {
		// Ensure sap.ui.core is always built initially (if present in the graph)
		initialBuildIncludedDependencies.push("sap.ui.core");
	}
	const buildServer = await graph.serve({
		initialBuildIncludedDependencies,
		includedTasks,
		excludedTasks,
		cache,
		ui5DataDir,
	});

	// graph.serve() above already started the BuildServer, which holds a source watcher and a
	// build-cache handle. If middleware assembly below throws, the caller gets neither the
	// buildServer nor a close() handle, so destroy it here before rethrowing.
	try {
		const resources = {
			rootProject: buildServer.getRootReader(),
			dependencies: buildServer.getDependenciesReader(),
			all: buildServer.getReader(),
		};

		buildServer.on("error", (err) => {
			if (typeof error === "function") {
				error(err);
				return;
			}
			log.error(`BuildServer error: ${err?.message ?? err}`);
			if (err?.stack) {
				log.verbose(err.stack);
			}
		});

		const liveReloadOptions = {
			active: liveReload,
			token: webSocketToken
		};

		const middlewareManager = new MiddlewareManager({
			graph,
			rootProject,
			sources,
			resources,
			options: {
				sendSAPTargetCSP,
				serveCSPReports,
				simpleIndex,
				liveReload: liveReloadOptions,
				// Consulted by the serveBuildError gate to divert HTML navigations while the
				// build server is globally in ERROR.
				getServeError: () => buildServer.getServeError()
			}
		});

		// eslint-disable-next-line new-cap -- express.Router is a factory, not a constructor
		const router = express.Router();
		await middlewareManager.applyMiddleware(router);
		return {router, buildServer, liveReloadOptions};
	} catch (err) {
		await buildServer.destroy();
		throw err;
	}
}

/**
 * Builds the Express application and its BuildServer for a project graph, without binding
 * to a port. Wraps {@link buildRouter} with an {@link express} application and the
 * terminal error handler, so the {@link module:@ui5/server.serve} wrapper and the
 * {@link Supervisor} can own the listener and re-create the app behind a stable HTTP
 * server on a graph swap. The error handler and the live-reload WebSocket server are
 * CLI-owned concerns and stay out of the router core used by the embedding API.
 *
 * @private
 * @module @ui5/server/serve/stack
 * @param {@ui5/project/graph/ProjectGraph} graph Project graph
 * @param {object} config Server configuration; see {@link buildRouter}
 * @param {Function} [error] Error callback invoked when the BuildServer emits an error outside
 *   of request handling
 * @returns {Promise<object>} Resolves with <code>{app, buildServer, liveReloadOptions}</code>
 */
export default async function buildApp(graph, config, error) {
	const {router, buildServer, liveReloadOptions} = await buildRouter(graph, config, error);

	const app = express();
	app.use(router);
	// Terminal error handler for the middleware chain. Registered after the router so it sits
	// last and intercepts every next(err), including those from custom middleware we can't wrap
	// in a try/catch. Threads the live-reload config in so the HTML error page can embed the
	// live-reload client script.
	app.use(createErrorHandler({liveReload: liveReloadOptions}));

	return {app, buildServer, liveReloadOptions};
}
