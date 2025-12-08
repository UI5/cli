import {createRequire} from "node:module";

// Using CommonsJS require since JSON module imports are still experimental
const require = createRequire(import.meta.url);

async function getVersion(pkg) {
	return require(`${pkg}/package.json`).version;
}

function getSortedTags(project) {
	const tags = project.getResourceTagCollection().getAllTags();
	const entities = Object.entries(tags);
	entities.sort(([keyA], [keyB]) => {
		return keyA.localeCompare(keyB);
	});
	return Object.fromEntries(entities);
}

export default async function(project, graph, buildConfig, taskRepository, buildSignature, cache) {
	if (!project) {
		throw new Error(`Missing parameter 'project'`);
	}
	if (!graph) {
		throw new Error(`Missing parameter 'graph'`);
	}
	if (!buildConfig) {
		throw new Error(`Missing parameter 'buildConfig'`);
	}
	if (!taskRepository) {
		throw new Error(`Missing parameter 'taskRepository'`);
	}

	const projectName = project.getName();
	const type = project.getType();

	const pathMapping = Object.create(null);
	switch (type) {
	case "application":
		pathMapping.webapp = `resources/${project.getNamespace()}`;
		break;
	case "library":
	case "theme-library":
		pathMapping.src = `resources`;
		pathMapping.test = `test-resources`;
		break;
	default:
		throw new Error(
			`Unable to create archive metadata for project ${project.getName()}: ` +
			`Project type ${type} is currently not supported`);
	}
	// let buildManifest;
	// if (project.isFrameworkProject()) {
	// 	buildManifest = await createFrameworkManifest(project, buildConfig, taskRepository);
	// } else {
	// 	buildManifest = {
	// 		manifestVersion: "0.3",
	// 		timestamp: new Date().toISOString(),
	// 		dependencies: collectDepInfo(graph, project),
	// 		version: project.getVersion(),
	// 		namespace: project.getNamespace(),
	// 		tags: getSortedTags(project),
	// 	};
	// }

	const metadata = {
		project: {
			specVersion: project.getSpecVersion().toString(),
			type,
			metadata: {
				name: projectName,
			},
			resources: {
				configuration: {
					paths: pathMapping
				}
			}
		},
		buildManifest: createBuildManifest(project, buildConfig, taskRepository, buildSignature),
	};

	if (cache) {
		metadata.cache = cache;
	}

	return metadata;
}

async function createBuildManifest(project, buildConfig, taskRepository, buildSignature) {
	// Use legacy manifest version for framework libraries to ensure compatibility
	const {builderVersion, fsVersion: builderFsVersion} = await taskRepository.getVersions();
	const buildManifest = {
		manifestVersion: "1.0",
		timestamp: new Date().toISOString(),
		buildSignature,
		versions: {
			builderVersion: builderVersion,
			projectVersion: await getVersion("@ui5/project"),
			fsVersion: await getVersion("@ui5/fs"),
		},
		buildConfig,
		version: project.getVersion(),
		namespace: project.getNamespace(),
		tags: getSortedTags(project)
	};

	if (buildManifest.versions.fsVersion !== builderFsVersion) {
		// Added in manifestVersion 0.2:
		// @ui5/project and @ui5/builder use different versions of @ui5/fs.
		// This should be mentioned in the build manifest:
		buildManifest.versions.builderFsVersion = builderFsVersion;
	}
	return buildManifest;
}
