const {getRootProjectConfiguration, getFrameworkResolver, isValidSpecVersion} = require("./utils");

module.exports = async function({normalizerOptions, libraries}) {
	const project = await getRootProjectConfiguration({normalizerOptions});

	if (!isValidSpecVersion(project.specVersion)) {
		throw new Error(
			`ui5 add command requires specVersion "2.0" or higher. ` +
			`Project ${project.metadata.name} uses specVersion "${project.specVersion}"`
		);
	}

	if (!project.framework) {
		throw new Error(
			`Project ${project.metadata.name} is missing a framework configuration. ` +
			`Please use "ui5 use" to configure a framework and version.`
		);
	}
	if (!project.framework.version) {
		throw new Error(
			`Project ${project.metadata.name} does not define a framework version configuration. ` +
			`Please use "ui5 use" to configure a version.`
		);
	}

	const Resolver = getFrameworkResolver(project.framework.name);

	const resolver = new Resolver({
		cwd: project.path,
		version: project.framework.version
	});

	// Get metadata of all libraries to verify that they can be installed
	await Promise.all(libraries.map(async ({name}) => {
		try {
			await resolver.getLibraryMetadata(name);
		} catch (err) {
			throw new Error(`Failed to find ${project.framework.name} framework library ${name}: ` + err.message);
		}
	}));

	// Shallow copy of given libraries to not modify the input parameter when pushing other libraries
	const allLibraries = [...libraries];

	if (project.framework.libraries) {
		project.framework.libraries.forEach((library) => {
			// Don't add libraries twice!
			if (allLibraries.findIndex(($) => $.name === library.name) === -1) {
				allLibraries.push(library);
			}
		});
	}
	allLibraries.sort((a, b) => {
		return a.name.localeCompare(b.name);
	});

	// Try to update YAML file but still return with name and resolved version in case it failed
	let yamlUpdated = false;
	try {
		await require("./updateYaml")({
			project,
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
};
