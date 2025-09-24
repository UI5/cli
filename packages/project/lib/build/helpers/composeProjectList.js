import {getLogger} from "@ui5/logger";
const log = getLogger("build:helpers:composeProjectList");

/**
 * Creates an object containing the flattened project dependency tree. Each dependency is defined as an object key while
 * its value is an array of all of its transitive dependencies.
 *
 * @param {@ui5/project/graph/ProjectGraph} graph
 * @returns {Promise<Object<string, string[]>>} A promise resolving to an object with dependency names as
 * 												key and each with an array of its transitive dependencies as value
 */
async function getFlattenedDependencyTree(graph) {
	const dependencyMap = Object.create(null);
	const rootName = graph.getRoot().getName();

	await graph.traverseDepthFirst(({project, dependencies}) => {
		if (project.getName() === rootName) {
			// Skip root project
			return;
		}
		const projectDeps = [];
		dependencies.forEach((depName) => {
			projectDeps.push(depName);
			if (dependencyMap[depName]) {
				projectDeps.push(...dependencyMap[depName]);
			}
		});
		dependencyMap[project.getName()] = projectDeps;
	});
	return dependencyMap;
}

/**
 * Creates dependency lists for 'includedDependencies' and 'excludedDependencies'.
 *
 * See [ProjectBuilder~DependencyIncludes]{@link @ui5/project/build/ProjectBuilder~DependencyIncludes}
 * for a detailed JSDoc.
 *
 * @param {@ui5/project/graph/ProjectGraph} graph
 * @param {@ui5/project/build/ProjectBuilder~DependencyIncludes} dependencyIncludes
 * @returns {{includedDependencies:string[],excludedDependencies:string[]}} An object containing the
 *   'includedDependencies' and 'excludedDependencies'
 */
async function createDependencyLists(graph, {
	includeAllDependencies = false,
	includeDependency = [], includeDependencyRegExp = [], includeDependencyTree = [],
	excludeDependency = [], excludeDependencyRegExp = [], excludeDependencyTree = [],
	defaultIncludeDependency = [], defaultIncludeDependencyRegExp = [], defaultIncludeDependencyTree = []
}) {
	if (
		!includeAllDependencies &&
		!includeDependency.length && !includeDependencyRegExp.length && !includeDependencyTree.length &&
		!excludeDependency.length && !excludeDependencyRegExp.length && !excludeDependencyTree.length &&
		!defaultIncludeDependency.length && !defaultIncludeDependencyRegExp.length &&
		!defaultIncludeDependencyTree.length
	) {
		return {includedDependencies: [], excludedDependencies: []};
	}

	const flattenedDependencyTree = await getFlattenedDependencyTree(graph);

	function isExcluded(excludeList, depName) {
		return excludeList && excludeList.has(depName);
	}
	function processDependencies({targetList, dependencies, dependenciesRegExp = [], excludeList, handleSubtree}) {
		if (handleSubtree && dependenciesRegExp.length) {
			throw new Error("dependenciesRegExp can't be combined with handleSubtree:true option");
		}
		dependencies.forEach((depName) => {
			if (depName === "*") {
				targetList.add(depName);
			} else if (flattenedDependencyTree[depName]) {
				if (!isExcluded(excludeList, depName)) {
					targetList.add(depName);
				}
				if (handleSubtree) {
					flattenedDependencyTree[depName].forEach((dep) => {
						if (!isExcluded(excludeList, dep)) {
							targetList.add(dep);
						}
					});
				}
			} else {
				log.warn(
					`Could not find dependency "${depName}" for project ${graph.getRoot().getName()}. ` +
					`Dependency filter is ignored`);
			}
		});
		dependenciesRegExp.map((exp) => new RegExp(exp)).forEach((regExp) => {
			for (const depName in flattenedDependencyTree) {
				if (regExp.test(depName) && !isExcluded(excludeList, depName)) {
					targetList.add(depName);
				}
			}
		});
	}

	const includedDependencies = new Set();
	const excludedDependencies = new Set();

	// add dependencies defined in includeDependency and includeDependencyRegExp to the list of includedDependencies
	processDependencies({
		targetList: includedDependencies,
		dependencies: includeDependency,
		dependenciesRegExp: includeDependencyRegExp
	});
	// add dependencies defined in excludeDependency and excludeDependencyRegExp to the list of excludedDependencies
	processDependencies({
		targetList: excludedDependencies,
		dependencies: excludeDependency,
		dependenciesRegExp: excludeDependencyRegExp
	});
	// add dependencies defined in includeDependencyTree with their transitive dependencies to the list of
	// includedDependencies; due to prioritization only those dependencies are added which are not excluded
	// by excludedDependencies
	processDependencies({
		targetList: includedDependencies,
		dependencies: includeDependencyTree,
		excludeList: excludedDependencies,
		handleSubtree: true
	});
	// add dependencies defined in excludeDependencyTree with their transitive dependencies to the list of
	// excludedDependencies; due to prioritization only those dependencies are added which are not excluded
	// by includedDependencies
	processDependencies({
		targetList: excludedDependencies,
		dependencies: excludeDependencyTree,
		excludeList: includedDependencies,
		handleSubtree: true
	});
	// due to the lower priority only add the dependencies defined in build settings if they are not excluded
	// by any other dependency defined in excludedDependencies
	processDependencies({
		targetList: includedDependencies,
		dependencies: defaultIncludeDependency,
		dependenciesRegExp: defaultIncludeDependencyRegExp,
		excludeList: excludedDependencies
	});
	processDependencies({
		targetList: includedDependencies,
		dependencies: defaultIncludeDependencyTree,
		excludeList: excludedDependencies,
		handleSubtree: true
	});

	if (includeAllDependencies) {
		// If requested, add all dependencies not excluded to include set
		Object.keys(flattenedDependencyTree).forEach((depName) => {
			if (!isExcluded(excludedDependencies, depName)) {
				includedDependencies.add(depName);
			}
		});
	}

	return {
		includedDependencies: Array.from(includedDependencies),
		excludedDependencies: Array.from(excludedDependencies)
	};
}

createDependencyLists._getFlattenedDependencyTree = getFlattenedDependencyTree;

export default createDependencyLists;
