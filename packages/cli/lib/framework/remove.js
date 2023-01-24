import {getRootProjectConfiguration} from "./utils.js";
import {getLogger} from "@ui5/logger";

const log = getLogger("cli:framework:remove");

/**
 * Removes the given set of libraries from the framework libraries section in the ui5.yaml
 *
 * @param {object} parameters Parameters
 * @param {object} parameters.projectGraphOptions
 * @param {object} parameters.libraries
 */
export default async function({projectGraphOptions, libraries}) {
	const project = await getRootProjectConfiguration(projectGraphOptions);

	if (project.getSpecVersion().lt("2.0")) {
		throw new Error(
			`ui5 remove command requires specVersion "2.0" or higher. ` +
			`Project ${project.getName()} uses specVersion "${project.getSpecVersion().toString()}"`
		);
	}

	if (!project.getFrameworkName()) {
		throw new Error(
			`Project ${project.getName()} is missing a framework configuration. ` +
			`Please use "ui5 use" to configure a framework and version.`
		);
	}
	if (!project.getFrameworkVersion()) {
		throw new Error(
			`Project ${project.getName()} does not define a framework version configuration. ` +
			`Please use "ui5 use" to configure a version.`
		);
	}

	if (!project.getFrameworkDependencies().length) {
		throw new Error(
			`Project ${project.getName()} does not define framework libraries.`
		);
	}

	const allLibraries = [...project.getFrameworkDependencies()];

	libraries.forEach((library) => {
		const iIndexToRemove = allLibraries.findIndex(($) => $.name === library.name);
		if (iIndexToRemove === -1) {
			// do not fail here just log, because the framework library is not present afterwards
			log.warn(
				`Failed to remove framework library ${library.name} from project ` +
				`${project.getName()} because it is not present.`
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
