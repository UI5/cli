import AbstractReader from "@ui5/fs/AbstractReader";

class BuildReader extends AbstractReader {
	#projects;
	#projectNames;
	#namespaces = new Map();
	#getReaderForProject;
	#getReaderForProjects;

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

	async byGlob(...args) {
		const reader = await this.#getReaderForProjects(this.#projectNames);
		return reader.byGlob(...args);
	}

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
	 * Determine which projects might contain the resource for the given path.
	 *
	 * @param {string} virPath Virtual resource path
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
