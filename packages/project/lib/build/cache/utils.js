/**
 * @typedef {object} ResourceMetadata
 * @property {string} integrity Content integrity of the resource
 * @property {number} lastModified Last modified timestamp (mtimeMs)
 * @property {number} inode Inode number of the resource
 * @property {number} size Size of the resource in bytes
 */

const PERF_TRACKING = !!process.env.UI5_CACHE_PERF;
const perfCounters = {
	calls: 0,
	shortCircuitTrue: 0,
	sizeMismatch: 0,
	inodeMismatch: 0,
	integrityFallback: 0,
};
export {perfCounters as isResourceUnchangedCounters};

/**
 * Determines if a resource has changed compared to cached metadata
 *
 * Optimized for quickly accepting unchanged files. Resources are assumed to be
 * usually unchanged (same lastModified timestamp). Performs checks from cheapest
 * to most expensive, falling back to integrity comparison when necessary.
 *
 * @public
 * @param {@ui5/fs/Resource} resource Resource instance to compare
 * @param {ResourceMetadata} cachedMetadata Cached metadata from the tree
 * @param {number} [indexTimestamp] Timestamp when the tree state was created
 * @returns {Promise<boolean>} True if resource content is unchanged
 * @throws {Error} If resource or metadata is undefined
 */
export async function isResourceUnchanged(resource, cachedMetadata, indexTimestamp) {
	if (!resource || !cachedMetadata) {
		throw new Error("Cannot compare undefined resources or metadata");
	}
	if (PERF_TRACKING) perfCounters.calls++;

	// Size mismatch indicates a definite content change. Required before any
	// "unchanged" decision because mtime preservation (cp -p, tar -x, rsync -t,
	// atomic rename) does not imply content unchanged.
	const currentSize = await resource.getSize();
	if (currentSize !== cachedMetadata.size) {
		if (PERF_TRACKING) perfCounters.sizeMismatch++;
		return false;
	}

	// Inode mismatch indicates the file was replaced (atomic rename, cp, tar
	// extraction, ...). Content may still be identical, so fall through to the
	// integrity check rather than returning false. Inode is optional on both
	// sides (e.g. virtual resources, older caches without inode); skip the
	// check when either is undefined.
	const currentInode = resource.getInode();
	const inodeMismatch =
		cachedMetadata.inode !== undefined && currentInode !== undefined &&
		currentInode !== cachedMetadata.inode;
	if (inodeMismatch && PERF_TRACKING) perfCounters.inodeMismatch++;

	// mtime + size both match and the file has not been replaced → unchanged,
	// unless we are in the racy-git window (mtime === indexTimestamp), where
	// content may have changed during indexing without mtime moving.
	const currentLastModified = resource.getLastModified();
	if (!inodeMismatch && currentLastModified === cachedMetadata.lastModified) {
		if (indexTimestamp && currentLastModified !== indexTimestamp) {
			if (PERF_TRACKING) perfCounters.shortCircuitTrue++;
			return true;
		}
		// Race condition possible — fall through to integrity check
	}

	// mtime differs, file was replaced, or racy window — verify content.
	if (PERF_TRACKING) perfCounters.integrityFallback++;
	const currentIntegrity = await resource.getIntegrity();
	return currentIntegrity === cachedMetadata.integrity;
}


/**
 * Creates an index of resource metadata from an array of resources
 *
 * Processes all resources in parallel, extracting their metadata including
 * path, integrity, lastModified timestamp, size and inode (when available).
 *
 * @public
 * @param {Array<@ui5/fs/Resource>} resources Array of resources to index
 * @returns {Promise<Array<@ui5/project/build/cache/index/HashTree~ResourceMetadata>>}
 *   Array of resource metadata objects
 */
export async function createResourceIndex(resources) {
	return await Promise.all(resources.map(async (resource) => {
		return {
			path: resource.getOriginalPath(),
			integrity: await resource.getIntegrity(),
			lastModified: resource.getLastModified(),
			size: await resource.getSize(),
			inode: resource.getInode(),
			tags: resource.getTags(),
		};
	}));
}

/**
 * Returns the first truthy value from an array of promises
 *
 * This function evaluates all promises in parallel and returns immediately
 * when the first truthy value is found. If all promises resolve to falsy
 * values, null is returned.
 *
 * @param {Promise[]} promises Array of promises to evaluate
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
