/**
 * @typedef {object} ResourceMetadata
 * @property {string} integrity Content integrity of the resource
 * @property {number} lastModified Last modified timestamp (mtimeMs)
 * @property {number} inode Inode number of the resource
 * @property {number} size Size of the resource in bytes
 */

/**
 * Compares a resource instance with cached resource metadata.
 *
 * Optimized for quickly rejecting changed files
 *
 * @param {object} resource Resource instance to compare
 * @param {ResourceMetadata} resourceMetadata Resource metadata to compare against
 * @param {number} indexTimestamp Timestamp of the metadata creation
 * @returns {Promise<boolean>} True if resource is found to match the metadata
 * @throws {Error} If resource or metadata is undefined
 */
export async function matchResourceMetadata(resource, resourceMetadata, indexTimestamp) {
	if (!resource || !resourceMetadata) {
		throw new Error("Cannot compare undefined resources or metadata");
	}

	const currentLastModified = resource.getLastModified();
	if (currentLastModified > indexTimestamp) {
		// Resource modified after index was created, no need for further checks
		return false;
	}
	if (currentLastModified !== resourceMetadata.lastModified) {
		return false;
	}
	if (await resource.getSize() !== resourceMetadata.size) {
		return false;
	}
	const incomingInode = resource.getInode();
	if (resourceMetadata.inode !== undefined && incomingInode !== undefined &&
		incomingInode !== resourceMetadata.inode) {
		return false;
	}

	if (currentLastModified === indexTimestamp) {
		// If the source modification time is equal to index creation time,
		// it's possible for a race condition to have occurred where the file was modified
		// during index creation without changing its size.
		// In this case, we need to perform an integrity check to determine if the file has changed.
		if (await resource.getIntegrity() !== resourceMetadata.integrity) {
			return false;
		}
	}
	return true;
}

/**
 * Determines if a resource has changed compared to cached metadata
 *
 * Optimized for quickly accepting unchanged files.
 * I.e. Resources are assumed to be usually unchanged (same lastModified timestamp)
 *
 * @param {object} resource - Resource instance with methods: getInode(), getSize(), getLastModified(), getIntegrity()
 * @param {ResourceMetadata} cachedMetadata - Cached metadata from the tree
 * @param {number} indexTimestamp - Timestamp when the tree state was created
 * @returns {Promise<boolean>} True if resource content is unchanged
 * @throws {Error} If resource or metadata is undefined
 */
export async function matchResourceMetadataStrict(resource, cachedMetadata, indexTimestamp) {
	if (!resource || !cachedMetadata) {
		throw new Error("Cannot compare undefined resources or metadata");
	}

	// Check 1: Inode mismatch would indicate file replacement (comparison only if inodes are provided)
	const currentInode = resource.getInode();
	if (cachedMetadata.inode !== undefined && currentInode !== undefined &&
		currentInode !== cachedMetadata.inode) {
		return false;
	}

	// Check 2: Modification time unchanged would suggest no update needed
	const currentLastModified = resource.getLastModified();
	if (currentLastModified === cachedMetadata.lastModified) {
		if (currentLastModified !== indexTimestamp) {
			// File has not been modified since last indexing. No update needed
			return true;
		} // else: Edge case. File modified exactly at index time
		// Race condition possible - content may have changed during indexing
		// Fall through to integrity check
	}

	// Check 3: Size mismatch indicates definite content change
	const currentSize = await resource.getSize();
	if (currentSize !== cachedMetadata.size) {
		return false;
	}

	// Check 4: Compare integrity (expensive)
	// lastModified has changed, but the content might be the same. E.g. in case of a metadata-only update
	const currentIntegrity = await resource.getIntegrity();
	return currentIntegrity === cachedMetadata.integrity;
}

export async function createResourceIndex(resources, includeInode = false) {
	return await Promise.all(resources.map(async (resource) => {
		const resourceMetadata = {
			path: resource.getOriginalPath(),
			integrity: await resource.getIntegrity(),
			lastModified: resource.getLastModified(),
			size: await resource.getSize(),
		};
		if (includeInode) {
			resourceMetadata.inode = resource.getInode();
		}
		return resourceMetadata;
	}));
}

/**
 * Returns the first truthy value from an array of promises
 *
 * This function evaluates all promises in parallel and returns immediately
 * when the first truthy value is found. If all promises resolve to falsy
 * values, null is returned.
 *
 * @private
 * @param {Promise[]} promises - Array of promises to evaluate
 * @returns {Promise<*>} The first truthy resolved value or null if all are falsy
 */
export async function firstTruthy(promises) {
	return new Promise((resolve, reject) => {
		let completed = 0;
		const total = promises.length;

		if (total === 0) {
			resolve(null);
			return;
		}

		promises.forEach((promise) => {
			Promise.resolve(promise)
				.then((value) => {
					if (value) {
						resolve(value);
					} else {
						completed++;
						if (completed === total) {
							resolve(null);
						}
					}
				})
				.catch(reject);
		});
	});
}
