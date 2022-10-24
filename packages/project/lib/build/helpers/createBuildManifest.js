import {createRequire} from "node:module";

// Using CommonsJS require as importing json files causes an ExperimentalWarning
const require = createRequire(import.meta.url);

async function getVersion(pkg) {
	return require(`${pkg}/package.json`).version;
}

export default async function(project, buildConfig) {
	const projectName = project.getName();
	const type = project.getType();

	const pathMapping = {};
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

	const metadata = {
		project: {
			specVersion: project.getSpecVersion(),
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
		buildManifest: {
			manifestVersion: "0.1",
			timestamp: new Date().toISOString(),
			versions: {
				builderVersion: await getVersion("@ui5/builder"),
				projectVersion: await getVersion("@ui5/project"),
				fsVersion: await getVersion("@ui5/fs"),
			},
			buildConfig,
			version: project.getVersion(),
			namespace: project.getNamespace(),
			tags: Object.fromEntries(Object.entries(project.getResourceTagCollection().getAllTags()).sort())
		}
	};

	return metadata;
}
