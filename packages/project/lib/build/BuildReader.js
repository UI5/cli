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
	#applicationProjectName;
	#themeLibraryProjectNames = [];
	#namespaces = new Map();
	#buildServerInterface;

	/**
	 * Creates a new BuildReader instance
	 *
	 * @public
	 * @param {string} name Name of the reader
	 * @param {Array<@ui5/project/specifications/Project>} projects Array of projects to read from
	 * @param {object} buildServerInterface Function that returns a reader for a single project by name
	 * @throws {Error} If multiple projects share the same namespace
	 */
	constructor(name, projects, buildServerInterface) {
		super(name);
		this.#projects = projects;
		this.#projectNames = projects.map((p) => p.getName());
		this.#buildServerInterface = buildServerInterface;

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

			if (project.getType() === "application") {
				this.#applicationProjectName = project.getName();
			}

			// Theme libraries have no namespace (they can contribute themes to several) and serve
			// their resources under a path owned by another project, e.g. themelib_sap_horizon
			// serves /resources/sap/ui/core/themes/sap_horizon/. Namespace matching therefore
			// routes such a request to the wrong project, so theme libraries are tracked
			// separately and offered as a routing candidate for theme resource paths.
			if (project.getType() === "theme-library") {
				this.#themeLibraryProjectNames.push(project.getName());
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
		const reader = await this.#buildServerInterface.getReaderForProjects(this.#projectNames);
		return reader.byGlob(...args);
	}

	/**
	 * Locates a resource by path
	 *
	 * Tries candidate readers in priority order (see {@link BuildReader#_getReaderCandidates})
	 * and returns the first resource found. Each candidate reader is requested from the build server
	 * only when the preceding ones did not yield the resource, so the minimal set of projects is
	 * built. The reader for all projects is the last resort.
	 *
	 * @public
	 * @param {string} virPath Virtual path of the resource
	 * @param {...*} args Additional arguments to pass to the underlying reader's byPath method
	 * @returns {Promise<@ui5/fs/Resource|null>} Promise resolving to resource or null if not found
	 */
	async byPath(virPath, ...args) {
		for (const getReader of this._getReaderCandidates(virPath)) {
			const reader = await getReader();
			if (!reader) {
				continue;
			}
			const res = await reader.byPath(virPath, ...args);
			if (res) {
				return res;
			}
		}
		return null;
	}

	/**
	 * Builds the ordered list of candidate readers for a resource path
	 *
	 * Each entry is a factory resolving to a reader (or undefined when its strategy does not apply).
	 * Factories are evaluated lazily by {@link BuildReader#byPath} and requesting a reader from the
	 * build server may (re)build the associated projects, so ordering minimizes unnecessary builds:
	 * cheaper and more specific strategies come first, the reader for all projects comes last.
	 *
	 * @param {string} virPath Virtual path of the resource
	 * @returns {Array<function(): Promise<@ui5/fs/AbstractReader|undefined>>} Ordered readers
	 */
	_getReaderCandidates(virPath) {
		if (this.#projects.length === 1) {
			// Filtering on a single project (typically the root project)
			return [
				() => this.#buildServerInterface.getReaderForProject(this.#projectNames[0]),
			];
		}

		const readers = [];

		// Cached readers hold the results of already-built (fresh) projects and are free to query,
		// so consult them first: a hit identifies the owning project without building anything.
		readers.push(async () => {
			const cachedReader = this.#buildServerInterface.getCachedReadersForProjects(this.#projectNames);
			if (!cachedReader) {
				return;
			}
			const res = await cachedReader.byPath(virPath);
			if (res) {
				// Found in a cached reader. Request the project's own reader so a subsequent
				// invalidation is reflected, assuming the resource still belongs to that project.
				return await this.#buildServerInterface.getReaderForProject(res.getProject().getName());
			}
		});

		// Namespace matches, most specific first. Offered individually so a more specific match is
		// tried (and its project built) before a less specific one.
		for (const projectName of this._getProjectsForResourcePath(virPath)) {
			readers.push(() => this.#buildServerInterface.getReaderForProject(projectName));
		}

		// Theme libraries serve resources under a path owned by another project's namespace, so the
		// namespace match above can miss them. When the path looks like a theme resource, offer the
		// theme libraries as a candidate before falling back to all projects.
		if (this.#themeLibraryProjectNames.length && this._isThemeResourcePath(virPath)) {
			readers.push(() =>
				this.#buildServerInterface.getReaderForProjects(this.#themeLibraryProjectNames));
		}

		// If the root project is an application and the request does not start with /resources/ or
		// /test-resources/, the resource may live in the application project itself.
		if (this.#applicationProjectName && !virPath.startsWith("/resources/") &&
			!virPath.startsWith("/test-resources/")) {
			readers.push(() => this.#buildServerInterface.getReaderForProject(this.#applicationProjectName));
		}

		// Last resort: a reader for all projects. This (re)builds every non-fresh project, so it is
		// only reached when no more specific strategy located the resource.
		readers.push(() => this.#buildServerInterface.getReaderForProjects(this.#projectNames));

		return readers;
	}

	/**
	 * Checks whether a path looks like a theme-library resource
	 *
	 * Theme libraries serve their resources under a "themes/<theme-name>/" segment
	 * (e.g. /resources/sap/ui/core/themes/sap_horizon/library.css), so only such paths
	 * are routed to theme libraries.
	 *
	 * @param {string} virPath Virtual resource path
	 * @returns {boolean} True if the path is a resource path with a "themes" segment
	 */
	_isThemeResourcePath(virPath) {
		if (!virPath.startsWith("/resources/") && !virPath.startsWith("/test-resources/")) {
			return false;
		}
		return virPath.split("/").includes("themes");
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
