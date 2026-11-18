import path from "node:path";
import Specification from "../../../../../lib/specifications/Specification.js";
import {createResource} from "@ui5/fs/resourceFactory";

// Use a real project specification while keeping package metadata independent of the fixture's package.json.
export async function createFrameworkProject(name, {
	id, version, dependencies = [], optionalDependencies = [], type = "library"
}) {
	const project = await Specification.create({
		id,
		version,
		modulePath: path.resolve(import.meta.dirname,
			`../../../../fixtures/${type === "theme-library" ? "theme.library.e" : "library.e"}`),
		configuration: {
			specVersion: "3.1",
			kind: "project",
			type,
			metadata: {name},
			framework: {
				name: id.startsWith("@sapui5/") ? "SAPUI5" : "OpenUI5",
				libraries: [
					...dependencies.map((dependency) => ({name: dependency})),
					...optionalDependencies.map((dependency) => ({name: dependency, optional: true})),
				],
			},
		},
	});
	const packageResource = createResource({
		path: "/package.json",
		string: JSON.stringify({
			dependencies: Object.fromEntries(dependencies.map((dependency) => [`@openui5/${dependency}`, version])),
			devDependencies: Object.fromEntries(optionalDependencies.map((dependency) =>
				[`@openui5/${dependency}`, version])),
		}),
	});
	const rootReader = project.getRootReader();
	const byPath = rootReader.byPath.bind(rootReader);
	rootReader.byPath = (resourcePath) => resourcePath === "/package.json" ? Promise.resolve(packageResource) :
		byPath(resourcePath);
	project.getRootReader = () => rootReader;
	return project;
}
