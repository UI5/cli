import path from "node:path";
import {graphFromStaticFile, graphFromPackageDependencies} from "@ui5/project/graph";
import Configuration from "@ui5/project/config/Configuration";

export async function getRootProjectConfiguration(projectGraphOptions) {
	let graph;
	if (projectGraphOptions.dependencyDefinition) {
		graph = await graphFromStaticFile({
			filePath: projectGraphOptions.dependencyDefinition,
			resolveFrameworkDependencies: false
		});
	} else {
		graph = await graphFromPackageDependencies({
			rootConfigPath: projectGraphOptions.config,
			resolveFrameworkDependencies: false
		});
	}

	return graph.getRoot();
}

async function getFrameworkResolver(frameworkName, frameworkVersion) {
	if (frameworkVersion.toLowerCase().endsWith("-snapshot")) {
		// Framework version could be for example: "latest-snapshot" or "1.112.0-SNAPSHOT"
		return (await import("@ui5/project/ui5Framework/Sapui5MavenSnapshotResolver")).default;
	} else if (frameworkName === "OpenUI5") {
		return (await import("@ui5/project/ui5Framework/Openui5Resolver")).default;
	} else if (frameworkName === "SAPUI5") {
		return (await import("@ui5/project/ui5Framework/Sapui5Resolver")).default;
	} else {
		throw new Error("Invalid framework.name: " + frameworkName);
	}
}

export async function createFrameworkResolverInstance({frameworkName, frameworkVersion}, {cwd}) {
	const Resolver = await utils.getFrameworkResolver(frameworkName, frameworkVersion);
	return new Resolver({
		cwd,
		version: frameworkVersion,
		ui5DataDir: await utils.getUi5DataDir({cwd})
	});
}

export async function frameworkResolverResolveVersion({frameworkName, frameworkVersion}, {cwd}) {
	const Resolver = await utils.getFrameworkResolver(frameworkName, frameworkVersion);
	return Resolver.resolveVersion(frameworkVersion, {
		cwd,
		ui5DataDir: await utils.getUi5DataDir({cwd})
	});
}

async function getUi5DataDir({cwd}) {
	// ENV var should take precedence over the dataDir from the configuration.
	let ui5DataDir = process.env.UI5_DATA_DIR;
	if (!ui5DataDir) {
		const config = await Configuration.fromFile();
		ui5DataDir = config.getUi5DataDir();
	}
	return ui5DataDir ? path.resolve(cwd, ui5DataDir) : undefined;
}

const utils = {
	getRootProjectConfiguration,
	getFrameworkResolver,
	createFrameworkResolverInstance,
	frameworkResolverResolveVersion,
	getUi5DataDir
};
let _utils;
// For mocking of functions in unit tests and testing internal functions
/* istanbul ignore else */
if (process.env.NODE_ENV === "test") {
	_utils = utils;
}
export {_utils};
