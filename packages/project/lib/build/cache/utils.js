/**
 * Determines if a resource has changed compared to cached metadata
 *
 * Optimized for quickly accepting unchanged files. Resources are assumed to be
 * usually unchanged (same lastModified timestamp). Performs checks from cheapest
 * to most expensive, falling back to integrity comparison when necessary.
 *
 * @public
 * @param {@ui5/fs/Resource} resource Resource instance to compare
 * @param {@ui5/project/build/cache/index/HashTree~ResourceMetadata} cachedMetadata
 *   Cached metadata from the tree
 * @param {number} [indexTimestamp] Timestamp when the tree state was created
 * @returns {Promise<boolean>} True if resource content is unchanged
 * @throws {Error} If resource or metadata is undefined
 */
export async function isResourceUnchanged(resource, cachedMetadata, indexTimestamp) {
	if (!resource || !cachedMetadata) {
		throw new Error("Cannot compare undefined resources or metadata");
	}

	// Size mismatch indicates a definite content change. Required before any
	// "unchanged" decision because mtime preservation (cp -p, tar -x, rsync -t,
	// atomic rename) does not imply content unchanged.
	const currentSize = await resource.getSize();
	if (currentSize !== cachedMetadata.size) {
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

	// mtime + size both match and the file has not been replaced → unchanged,
	// unless we are in the racy-git window (mtime === indexTimestamp), where
	// content may have changed during indexing without mtime moving.
	const currentLastModified = resource.getLastModified();
	if (!inodeMismatch && currentLastModified === cachedMetadata.lastModified) {
		if (indexTimestamp && currentLastModified !== indexTimestamp) {
			return true;
		}
		// Race condition possible — fall through to integrity check
	}

	// mtime differs, file was replaced, or racy window — verify content.
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
