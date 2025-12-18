import ResourcePool from "./ResourcePool.js";
import LocatorResource from "./LocatorResource.js";

class LocatorResourcePool extends ResourcePool {
	/**
	 * Prepares the resource pool with either a reader or resources array.
	 *
	 * @param {object|Array} readerOrResources - Either a @ui5/fs reader or array of resources
	 * @param {object} [moduleNameMapping] - Optional mapping from resource path to module name
	 * @returns {Promise<void>}
	 */
	async prepare(readerOrResources, moduleNameMapping) {
		// Check if this is a reader (has byGlob/byPath methods) or resources array
		if (Array.isArray(readerOrResources)) {
			// Pre-load resources array
			const resources = readerOrResources.filter((res) => !res.getStatInfo().isDirectory());
			await Promise.all(
				resources.map((resource) => {
					let moduleName = moduleNameMapping && moduleNameMapping[resource.getPath()];
					if (!moduleName) {
						moduleName = resource.getPath().slice("/resources/".length);
					}
					return this.addResource(new LocatorResource(this, resource, moduleName));
				}).filter(Boolean)
			);
		} else {
			// Reader-based lazy loading only
			this._reader = readerOrResources;
			this._moduleNameMapping = moduleNameMapping || {};
			// Resources will be loaded on-demand when accessed
		}
	}

	/**
	 * Lazily loads a resource by name from the reader if not already cached.
	 *
	 * @param {string} name - Resource/module name
	 * @returns {Promise<Resource>}
	 * @override
	 */
	async findResource(name) {
		// Check cache first
		let resource = this._resourcesByName.get(name);
		if (resource) {
			return resource;
		}

		// If we have a reader, try to load the resource
		if (this._reader) {
			// Convert module name to resource path
			const resourcePath = "/resources/" + name;

			try {
				const fsResource = await this._reader.byPath(resourcePath);
				if (fsResource && !fsResource.getStatInfo().isDirectory()) {
					// Wrap in LocatorResource and cache
					let moduleName = this._moduleNameMapping[resourcePath];
					if (!moduleName) {
						moduleName = name;
					}
					resource = new LocatorResource(this, fsResource, moduleName);

					// Add to cache
					this._resources.push(resource);
					this._resourcesByName.set(name, resource);

					// Handle .library files
					if (/\.library$/.test(name)) {
						const buffer = await resource.buffer();
						const {getDependencyInfos} = await import("./LibraryFileAnalyzer.js");
						const infos = getDependencyInfos(name, buffer);
						for (const infoName of Object.keys(infos)) {
							this._rawModuleInfos.set(infoName, infos[infoName]);
						}
					}

					return resource;
				}
			} catch (err) {
				// Resource not found in reader, fall through to error
			}
		}

		// Resource not found
		throw new Error("resource not found in pool: '" + name + "'");
	}
}

export default LocatorResourcePool;
