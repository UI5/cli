import express from "express";
import MiddlewareManager from "./middleware/MiddlewareManager.js";
import createErrorHandler from "./middleware/errorHandler.js";
import {createReaderCollection} from "@ui5/fs/resourceFactory";
import ReaderCollectionPrioritized from "@ui5/fs/ReaderCollectionPrioritized";
import {getLogger} from "@ui5/logger";
import Cache from "@ui5/project/build/cache/Cache";

const log = getLogger("server");

/**
 * Builds the Express application and its BuildServer for a project graph, without binding
 * to a port. Everything the dev server needs to answer requests is assembled here; the
 * {@link module:@ui5/server.serve} wrapper and the {@link ServeSupervisor} own the listener
 * so a graph swap can re-create the app behind a stable HTTP server.
 *
 * @private
 * @module @ui5/server/serveApp
 * @param {@ui5/project/graph/ProjectGraph} graph Project graph
 * @param {object} config Server configuration — the resolved options passed to
 *   {@link module:@ui5/server.serve} (<code>sendSAPTargetCSP</code>, <code>simpleIndex</code>,
 *   <code>liveReload</code>, <code>serveCSPReports</code>, <code>cache</code>, <code>ui5DataDir</code>,
 *   <code>includedTasks</code>, <code>excludedTasks</code>), plus a stable
 *   <code>webSocketToken</code> shared across swaps
 * @param {Function} [error] Error callback invoked when the BuildServer emits an error outside
 *   of request handling
 * @returns {Promise<object>} Resolves with <code>{app, buildServer, liveReloadOptions}</code>
 */
export default async function buildServeApp(graph, config, error) {
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

	const app = express();
	await middlewareManager.applyMiddleware(app);
	// Terminal error handler for the middleware chain. Registered after applyMiddleware
	// so it sits last and intercepts every next(err) — including those from custom
	// middleware where we can't wrap a try/catch. Threads the live-reload config in
	// so the HTML error page can embed the live-reload client script.
	app.use(createErrorHandler({liveReload: liveReloadOptions}));

	return {app, buildServer, liveReloadOptions};
}
