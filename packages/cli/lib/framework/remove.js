const {getRootProjectConfiguration, isValidSpecVersion} = require("./utils");
const log = require("@ui5/logger").getLogger("cli:framework:remove");


/**
 * Removes the given set of libraries from the framework libraries section in the ui5.yaml
 */
module.exports = async function({normalizerOptions, libraries}) {
	const project = await getRootProjectConfiguration({normalizerOptions});

	if (!isValidSpecVersion(project.specVersion)) {
		throw new Error(
			`ui5 remove command requires specVersion "2.0" or higher. ` +
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

	if (!project.framework.libraries) {
		throw new Error(
			`Project ${project.metadata.name} does not define framework libraries.`
		);
	}

	const allLibraries = [...project.framework.libraries];

	libraries.forEach((library) => {
		const iIndexToRemove = allLibraries.findIndex(($) => $.name === library.name);
		if (iIndexToRemove === -1) {
			// do not fail here just log, because the framework library is not present afterwards
			log.warn(
				`Failed to remove framework library ${library.name} from project ${project.metadata.name} because it is not present.`
			);
		} else {
			allLibraries.splice(iIndexToRemove, 1);
		}
	});


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
