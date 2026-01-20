import AbstractReader from "@ui5/fs/AbstractReader";

/**
 * Reader for accessing build results of multiple projects
 *
 * Provides efficient resource access by delegating to appropriate project readers
 * based on resource paths and namespaces. Supports namespace-based routing to
 * minimize unnecessary project searches.
 *
 * @class
 * @extends @ui5/fs/AbstractReader
 */
class BuildReader extends AbstractReader {
	#projects;
	#projectNames;
	#namespaces = new Map();
	#getReaderForProject;
	#getReaderForProjects;

	/**
	 * Creates a new BuildReader instance
	 *
	 * @public
	 * @param {string} name Name of the reader
	 * @param {Array<@ui5/project/specifications/Project>} projects Array of projects to read from
	 * @param {Function} getReaderForProject Function that returns a reader for a single project by name
	 * @param {Function} getReaderForProjects Function that returns a combined reader for multiple project names
	 * @throws {Error} If multiple projects share the same namespace
	 */
	constructor(name, projects, getReaderForProject, getReaderForProjects) {
		super(name);
		this.#projects = projects;
		this.#projectNames = projects.map((p) => p.getName());
		this.#getReaderForProject = getReaderForProject;
		this.#getReaderForProjects = getReaderForProjects;

		for (const project of projects) {
			const ns = project.getNamespace();
			// Not all projects have a namespace, e.g. modules or theme-libraries
			if (ns) {
				if (this.#namespaces.has(ns)) {
					throw new Error(`Multiple projects with namespace '${ns}' found: ` +
						`${this.#namespaces.get(ns)} and ${project.getName()}`);
				}
				this.#namespaces.set(ns, project.getName());
			}
		}
	}

	/**
	 * Locates resources by glob pattern
	 *
	 * Retrieves a combined reader for all projects and delegates the glob search to it.
	 *
	 * @public
	 * @param {...*} args Arguments to pass to the underlying reader's byGlob method
	 * @returns {Promise<Array<@ui5/fs/Resource>>} Promise resolving to list of resources
	 */
	async byGlob(...args) {
		const reader = await this.#getReaderForProjects(this.#projectNames);
		return reader.byGlob(...args);
	}

	/**
	 * Locates a resource by path
	 *
	 * Attempts to determine the appropriate project reader based on the resource path
	 * and namespace. Falls back to searching all projects if the resource cannot be found.
	 *
	 * @public
	 * @param {string} virPath Virtual path of the resource
	 * @param {...*} args Additional arguments to pass to the underlying reader's byPath method
	 * @returns {Promise<@ui5/fs/Resource|null>} Promise resolving to resource or null if not found
	 */
	async byPath(virPath, ...args) {
		const reader = await this._getReaderForResource(virPath);
		let res = await reader.byPath(virPath, ...args);
		if (!res) {
			// Fallback to unspecified projects
			const allReader = await this.#getReaderForProjects(this.#projectNames);
			res = await allReader.byPath(virPath, ...args);
		}
		return res;
	}

	/**
	 * Gets the appropriate reader for a resource at the given path
	 *
	 * Determines which project(s) might contain the resource based on namespace matching
	 * and returns a reader for those projects. For single-project readers, returns that
	 * project's reader directly.
	 *
	 * @param {string} virPath Virtual path of the resource
	 * @returns {Promise<@ui5/fs/AbstractReader>} Promise resolving to appropriate reader
	 */
	async _getReaderForResource(virPath) {
		let reader;
		if (this.#projects.length === 1) {
			// Filtering on a single project (typically the root project)
			reader = await this.#getReaderForProject(this.#projectNames[0]);
		} else {
			// Determine project for resource path
			const projects = this._getProjectsForResourcePath(virPath);
			if (projects.length) {
				reader = await this.#getReaderForProjects(projects);
			} else {
				// Unable to determine project for resource
				// Request reader for all projects
				reader = await this.#getReaderForProjects(this.#projectNames);
			}
		}

		return reader;
	}

	/**
	 * Determines which projects might contain the resource for the given path
	 *
	 * Analyzes the resource path to identify matching project namespaces. Only processes
	 * paths starting with /resources/ or /test-resources/. Returns project names in order
	 * from most specific to least specific namespace match.
	 *
	 * @param {string} virPath Virtual resource path
	 * @returns {string[]} Array of project names that might contain the resource
	 */
	_getProjectsForResourcePath(virPath) {
		if (!virPath.startsWith("/resources/") && !virPath.startsWith("/test-resources/")) {
			return [];
		}
		// Remove first two entries (e.g. "/resources/")
		const parts = virPath.split("/").slice(2);

		const projectNames = [];
		while (parts.length > 1) {
			// Search for namespace, starting with the longest path
			parts.pop();
			const ns = parts.join("/");
			if (this.#namespaces.has(ns)) {
				projectNames.push(this.#namespaces.get(ns));
			}
		}
		return projectNames;
	}
}

export default BuildReader;
