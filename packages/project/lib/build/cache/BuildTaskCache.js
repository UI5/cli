import micromatch from "micromatch";
import {getLogger} from "@ui5/logger";
const log = getLogger("build:cache:BuildTaskCache");

function unionArray(arr, items) {
	for (const item of items) {
		if (!arr.includes(item)) {
			arr.push(item);
		}
	}
}
function unionObject(target, obj) {
	for (const key in obj) {
		if (Object.prototype.hasOwnProperty.call(obj, key)) {
			target[key] = obj[key];
		}
	}
}

async function createMetadataForResources(resourceMap) {
	const metadata = Object.create(null);
	await Promise.all(Object.keys(resourceMap).map(async (resourcePath) => {
		const resource = resourceMap[resourcePath];
		if (resource.hash) {
			// Metadata object
			metadata[resourcePath] = resource;
			return;
		}
		// Resource instance
		metadata[resourcePath] = {
			hash: await resource.getHash(),
			lastModified: resource.getStatInfo()?.mtimeMs,
		};
	}));
	return metadata;
}

export default class BuildTaskCache {
	#projectName;
	#taskName;

	// Track which resource paths (and patterns) the task reads
	// This is used to check whether a resource change *might* invalidates the task
	#projectRequests;
	#dependencyRequests;

	// Track metadata for the actual resources the task has read and written
	// This is used to check whether a resource has actually changed from the last time the task has been executed (and
	// its result has been cached)
	// Per resource path, this reflects the last known state of the resource (a task might be executed multiple times,
	// i.e. with a small delta of changed resources)
	// This map can contain either a resource instance (if the cache has been filled during this session) or an object
	// containing the last modified timestamp and an md5 hash of the resource (if the cache has been loaded from disk)
	#resourcesRead;
	#resourcesWritten;

	constructor(projectName, taskName, {projectRequests, dependencyRequests, resourcesRead, resourcesWritten}) {
		this.#projectName = projectName;
		this.#taskName = taskName;

		this.#projectRequests = projectRequests ?? {
			pathsRead: [],
			patterns: [],
		};

		this.#dependencyRequests = dependencyRequests ?? {
			pathsRead: [],
			patterns: [],
		};
		this.#resourcesRead = resourcesRead ?? Object.create(null);
		this.#resourcesWritten = resourcesWritten ?? Object.create(null);
	}

	getTaskName() {
		return this.#taskName;
	}

	updateResources(projectRequests, dependencyRequests, resourcesRead, resourcesWritten) {
		unionArray(this.#projectRequests.pathsRead, projectRequests.pathsRead);
		unionArray(this.#projectRequests.patterns, projectRequests.patterns);

		if (dependencyRequests) {
			unionArray(this.#dependencyRequests.pathsRead, dependencyRequests.pathsRead);
			unionArray(this.#dependencyRequests.patterns, dependencyRequests.patterns);
		}

		unionObject(this.#resourcesRead, resourcesRead);
		unionObject(this.#resourcesWritten, resourcesWritten);
	}

	async toObject() {
		return {
			taskName: this.#taskName,
			resourceMetadata: {
				projectRequests: this.#projectRequests,
				dependencyRequests: this.#dependencyRequests,
				resourcesRead: await createMetadataForResources(this.#resourcesRead),
				resourcesWritten: await createMetadataForResources(this.#resourcesWritten)
			}
		};
	}

	checkPossiblyInvalidatesTask(projectResourcePaths, dependencyResourcePaths) {
		if (this.#isRelevantResourceChange(this.#projectRequests, projectResourcePaths)) {
			log.verbose(
				`Build cache for task ${this.#taskName} of project ${this.#projectName} possibly invalidated ` +
				`by changes made to the following resources ${Array.from(projectResourcePaths).join(", ")}`);
			return true;
		}

		if (this.#isRelevantResourceChange(this.#dependencyRequests, dependencyResourcePaths)) {
			log.verbose(
				`Build cache for task ${this.#taskName} of project ${this.#projectName} possibly invalidated ` +
				`by changes made to the following resources: ${Array.from(dependencyResourcePaths).join(", ")}`);
			return true;
		}

		return false;
	}

	getReadResourceCacheEntry(searchResourcePath) {
		return this.#resourcesRead[searchResourcePath];
	}

	getWrittenResourceCache(searchResourcePath) {
		return this.#resourcesWritten[searchResourcePath];
	}

	async isResourceInReadCache(resource) {
		const cachedResource = this.#resourcesRead[resource.getPath()];
		if (!cachedResource) {
			return false;
		}
		if (cachedResource.hash) {
			return this.#isResourceFingerprintEqual(resource, cachedResource);
		} else {
			return this.#isResourceEqual(resource, cachedResource);
		}
	}

	async isResourceInWriteCache(resource) {
		const cachedResource = this.#resourcesWritten[resource.getPath()];
		if (!cachedResource) {
			return false;
		}
		if (cachedResource.hash) {
			return this.#isResourceFingerprintEqual(resource, cachedResource);
		} else {
			return this.#isResourceEqual(resource, cachedResource);
		}
	}

	async #isResourceEqual(resourceA, resourceB) {
		if (!resourceA || !resourceB) {
			throw new Error("Cannot compare undefined resources");
		}
		if (resourceA === resourceB) {
			return true;
		}
		if (resourceA.getStatInfo()?.mtimeMs !== resourceA.getStatInfo()?.mtimeMs) {
			return false;
		}
		if (await resourceA.getString() === await resourceB.getString()) {
			return true;
		}
		return false;
	}

	async #isResourceFingerprintEqual(resourceA, resourceBMetadata) {
		if (!resourceA || !resourceBMetadata) {
			throw new Error("Cannot compare undefined resources");
		}
		if (resourceA.getStatInfo()?.mtimeMs !== resourceBMetadata.lastModified) {
			return false;
		}
		if (await resourceA.getHash() === resourceBMetadata.hash) {
			return true;
		}
		return false;
	}

	#isRelevantResourceChange({pathsRead, patterns}, changedResourcePaths) {
		for (const resourcePath of changedResourcePaths) {
			if (pathsRead.includes(resourcePath)) {
				return true;
			}
			if (patterns.length && micromatch.isMatch(resourcePath, patterns)) {
				return true;
			}
		}
		return false;
	}
}
