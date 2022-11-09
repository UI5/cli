import {getRootProjectConfiguration, getFrameworkResolver} from "./utils.js";

async function resolveVersion({frameworkName, frameworkVersion}, resolverOptions) {
	const Resolver = await getFrameworkResolver(frameworkName, frameworkVersion);
	return Resolver.resolveVersion(frameworkVersion, resolverOptions);
}

function getEffectiveFrameworkName({project, frameworkOptions}) {
	if (!project.getFrameworkName() && !frameworkOptions.name) {
		throw new Error("No framework configuration defined. Make sure to also provide the framework name.");
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
		return project.getFrameworkName();
	}
}

export default async function({projectGraphOptions, frameworkOptions}) {
	const project = await getRootProjectConfiguration(projectGraphOptions);

	if (project.getSpecVersion().lt("2.0")) {
		throw new Error(
			`ui5 use command requires specVersion "2.0" or higher. ` +
			`Project ${project.getName()} uses specVersion "${project.getSpecVersion().toString()}"`
		);
	}

	const framework = {
		name: getEffectiveFrameworkName({project, frameworkOptions})
	};

	const frameworkVersion = frameworkOptions.version || project.getFrameworkVersion();
	if (frameworkVersion) {
		framework.version = await resolveVersion({
			frameworkName: framework.name,
			frameworkVersion
		}, {
			cwd: project.getRootPath()
		});
	}

	// Try to update YAML file but still return with name and resolved version in case it failed
	let yamlUpdated = false;
	try {
		const {default: updateYaml} = await import("./updateYaml.js");
		await updateYaml({
			project,
			configPathOverride: projectGraphOptions.config,
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
}
