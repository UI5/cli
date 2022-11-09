import {getRootProjectConfiguration, getFrameworkResolver} from "./utils.js";

/**
 * Adds the given set of libraries to the framework libraries section in the ui5.yaml
 *
 * @param {object} parameters Parameters
 * @param {object} parameters.projectGraphOptions
 * @param {object} parameters.libraries
 */
export default async function({projectGraphOptions, libraries}) {
	const project = await getRootProjectConfiguration(projectGraphOptions);

	if (project.getSpecVersion().lt("2.0")) {
		throw new Error(
			`ui5 add command requires specVersion "2.0" or higher. ` +
			`Project ${project.getName()} uses specVersion "${project.getSpecVersion().toString()}"`
		);
	}

	const frameworkName = project.getFrameworkName();
	const frameworkVersion = project.getFrameworkVersion();

	if (!frameworkName) {
		throw new Error(
			`Project ${project.getName()} is missing a framework configuration. ` +
			`Please use "ui5 use" to configure a framework and version.`
		);
	}
	if (!frameworkVersion) {
		throw new Error(
			`Project ${project.getName()} does not define a framework version configuration. ` +
			`Please use "ui5 use" to configure a version.`
		);
	}

	const Resolver = await getFrameworkResolver(frameworkName, frameworkVersion);

	const resolver = new Resolver({
		cwd: project.getRootPath(),
		version: frameworkVersion
	});

	// Get metadata of all libraries to verify that they can be installed
	await Promise.all(libraries.map(async ({name}) => {
		try {
			await resolver.getLibraryMetadata(name);
		} catch (err) {
			throw new Error(`Failed to find ${frameworkName} framework library ${name}: ` + err.message);
		}
	}));

	// Shallow copy of given libraries to not modify the input parameter when pushing other libraries
	const allLibraries = [...libraries];

	project.getFrameworkDependencies().forEach((library) => {
		// Don't add libraries twice!
		if (allLibraries.findIndex(($) => $.name === library.name) === -1) {
			allLibraries.push(library);
		}
	});

	allLibraries.sort((a, b) => {
		return a.name.localeCompare(b.name);
	});

	// Try to update YAML file but still return with name and resolved version in case it failed
	let yamlUpdated = false;
	try {
		const {default: updateYaml} = await import("./updateYaml.js");
		await updateYaml({
			project,
			configPathOverride: projectGraphOptions.config,
			data: {
				framework: {
					libraries: allLibraries
				}
			}
		});
		yamlUpdated = true;
	} catch (err) {
		if (err.name !== "FrameworkUpdateYamlFailed") {
			throw err;
		}
	}
	return {
		yamlUpdated
	};
}
