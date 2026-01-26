/**
 * Output Writer Strategies
 *
 * Strategy pattern for writing bundled output to different targets:
 * - CacheWriter: Stores in memory Map for middleware (dev server)
 * - WorkspaceWriter: Writes to UI5 workspace for task (build)
 */

export class CacheWriter {
	constructor(pathResolver) {
		this.pathResolver = pathResolver;
		this.cache = new Map();
	}

	/**
	 * Write chunk to cache
	 *
	 * @param chunk
	 * @param log
	 */
	async writeChunk(chunk, log) {
		const fileName = chunk.fileName;
		const isWrapper = this.pathResolver.isUI5Wrapper(fileName);
		const isPackageExport = this.pathResolver.isPackageExport(fileName);

		if (isWrapper) {
			// UI5 wrapper goes to gen/
			const genPath = this.pathResolver.genPath(fileName);
			this.cache.set(genPath, chunk.code);

			// Package exports also to thirdparty/
			if (isPackageExport) {
				const thirdpartyPath = this.pathResolver.thirdpartyPath(fileName);
				this.cache.set(thirdpartyPath, chunk.code);
			}
		} else {
			// Native webcomponent goes to thirdparty/
			const thirdpartyPath = this.pathResolver.thirdpartyPath(fileName);
			this.cache.set(thirdpartyPath, chunk.code);
		}

		if (log) {
			log.info(`✅ Cached: ${fileName}`);
		}
	}

	/**
	 * Write asset to cache
	 *
	 * @param asset
	 * @param log
	 */
	async writeAsset(asset, log) {
		const fileName = asset.fileName;
		const cachePath = fileName.replace(/\.js$/, "");
		this.cache.set(cachePath, asset.source);

		if (log) {
			log.info(`✅ Cached: ${fileName}`);
		}
	}

	/**
	 * Write custom content to cache
	 *
	 * @param path
	 * @param content
	 * @param log
	 */
	async write(path, content, log) {
		this.cache.set(path, content);
		if (log) {
			log.info(`✅ Cached: ${path}`);
		}
	}

	/**
	 * Get cached content
	 *
	 * @param path
	 */
	get(path) {
		return this.cache.get(path);
	}

	/**
	 * Get all cache keys
	 */
	keys() {
		return Array.from(this.cache.keys());
	}

	/**
	 * Duplicate chunks with friendly names
	 *
	 * @param chunkMapping
	 * @param log
	 */
	async duplicateChunks(chunkMapping, log) {
		for (const [moduleName, chunkInfo] of chunkMapping.entries()) {
			const friendlyName = this.pathResolver.getFriendlyName(moduleName);
			const friendlyPath = `${this.pathResolver.thirdpartyNamespace}/${friendlyName}`.replace(/\.js$/, "");
			this.cache.set(friendlyPath, chunkInfo.code);

			if (log) {
				log.info(`✅ Duplicated chunk: ${friendlyPath}`);
			}
		}
	}
}

export class WorkspaceWriter {
	constructor(pathResolver, workspace, resourceFactory) {
		this.pathResolver = pathResolver;
		this.workspace = workspace;
		this.resourceFactory = resourceFactory;
	}

	/**
	 * Write chunk to workspace
	 *
	 * @param chunk
	 * @param log
	 */
	async writeChunk(chunk, log) {
		const fileName = chunk.fileName;
		const isWrapper = this.pathResolver.isUI5Wrapper(fileName);
		const isPackageExport = this.pathResolver.isPackageExport(fileName);

		if (isWrapper) {
			// UI5 wrapper goes to gen/
			const resourcePath = this.pathResolver.resourcePath(fileName, false);
			const resource = this.resourceFactory.createResource({
				path: resourcePath,
				string: chunk.code
			});
			await this.workspace.write(resource);

			if (log) {
				log.info(`✅ Generated: ${resourcePath.replace("/resources/", "")}`);
			}

			// Package exports also to thirdparty/
			if (isPackageExport) {
				const thirdpartyPath = this.pathResolver.resourcePath(fileName, true);
				const thirdpartyResource = this.resourceFactory.createResource({
					path: thirdpartyPath,
					string: chunk.code
				});
				await this.workspace.write(thirdpartyResource);

				if (log) {
					log.info(`✅ Generated: ${thirdpartyPath.replace("/resources/", "")}`);
				}
			}
		} else {
			// Native webcomponent goes to thirdparty/
			const resourcePath = this.pathResolver.resourcePath(fileName, true);
			const resource = this.resourceFactory.createResource({
				path: resourcePath,
				string: chunk.code
			});
			await this.workspace.write(resource);

			if (log) {
				log.info(`✅ Generated: ${resourcePath.replace("/resources/", "")}`);
			}
		}
	}

	/**
	 * Write asset to workspace
	 *
	 * @param asset
	 * @param log
	 */
	async writeAsset(asset, log) {
		const fileName = asset.fileName;
		const resourcePath = this.pathResolver.resourcePath(fileName, false);
		const resource = this.resourceFactory.createResource({
			path: resourcePath,
			string: asset.source
		});
		await this.workspace.write(resource);

		if (log) {
			log.info(`✅ Generated: ${resourcePath.replace("/resources/", "")}`);
		}
	}

	/**
	 * Write custom content to workspace
	 *
	 * @param path
	 * @param content
	 * @param log
	 */
	async write(path, content, log) {
		const resource = this.resourceFactory.createResource({
			path: `/resources/${this.pathResolver.namespace}/${path}.js`,
			string: content
		});
		await this.workspace.write(resource);

		if (log) {
			log.info(`✅ Generated: ${path}`);
		}
	}

	/**
	 * Duplicate chunks with friendly names
	 *
	 * @param chunkMapping
	 * @param log
	 */
	async duplicateChunks(chunkMapping, log) {
		for (const [moduleName, chunkInfo] of chunkMapping.entries()) {
			const friendlyName = this.pathResolver.getFriendlyName(moduleName);
			const friendlyPath = this.pathResolver.resourcePath(friendlyName, true);
			const resource = this.resourceFactory.createResource({
				path: friendlyPath,
				string: chunkInfo.code
			});
			await this.workspace.write(resource);

			if (log) {
				log.info(`✅ Duplicated chunk: ${this.pathResolver.thirdpartyNamespace}/${friendlyName}`);
			}
		}
	}
}
