const {getRootProjectConfiguration, getFrameworkResolver, isValidSpecVersion} = require("./utils");

async function resolveVersion({frameworkName, frameworkVersion}, resolverOptions) {
	return await getFrameworkResolver(frameworkName).resolveVersion(frameworkVersion, resolverOptions);
}

function getEffectiveFrameworkName({project, frameworkOptions}) {
	if (!project.framework && !frameworkOptions.name) {
		throw new Error("No framework configuration defined. Make sure to also provide the framework name.");
	}
	if (project.framework && !project.framework.name) {
		// This should not happen as the configuration should have been validated against the schema
		throw new Error(`Project ${project.metadata.name} does not define a framework name configuration`);
	}
	if (frameworkOptions.name) {
		if (frameworkOptions.name.toLowerCase() === "openui5") {
			return "OpenUI5";
		} else if (frameworkOptions.name.toLowerCase() === "sapui5") {
			return "SAPUI5";
		} else {
			throw new Error("Invalid framework name: " + frameworkOptions.name);
		}
	} else {
		return project.framework.name;
	}
}

module.exports = async function({normalizerOptions, frameworkOptions}) {
	const project = await getRootProjectConfiguration({normalizerOptions});

	if (!isValidSpecVersion(project.specVersion)) {
		throw new Error(
			`ui5 use command requires specVersion "2.0" or higher. ` +
			`Project ${project.metadata.name} uses specVersion "${project.specVersion}"`
		);
	}

	const framework = {
		name: getEffectiveFrameworkName({project, frameworkOptions})
	};

	const frameworkVersion = frameworkOptions.version || (project.framework && project.framework.version);
	if (frameworkVersion) {
		framework.version = await resolveVersion({
			frameworkName: framework.name,
			frameworkVersion
		}, {
			cwd: project.path
		});
	}

	// Try to update YAML file but still return with name and resolved version in case it failed
	let yamlUpdated = false;
	try {
		await require("./updateYaml")({
			project,
			data: {
				framework: framework
			}
		});
		yamlUpdated = true;
	} catch (err) {
		if (err.name !== "FrameworkUpdateYamlFailed") {
			throw err;
		}
	}
	return {
		yamlUpdated,
		usedFramework: framework.name,
		usedVersion: framework.version || null
	};
};
