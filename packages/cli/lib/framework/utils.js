import {graphFromStaticFile, graphFromPackageDependencies} from "@ui5/project/graph";

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

export async function getFrameworkResolver(frameworkName, frameworkVersion) {
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
