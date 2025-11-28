import cacache from "cacache";

export class CacheManager {
	constructor(cacheDir) {
		this._cacheDir = cacheDir;
	}

	async get(cacheKey) {
		try {
			const result = await cacache.get(this._cacheDir, cacheKey);
			return JSON.parse(result.data.toString("utf-8"));
		} catch (err) {
			if (err.code === "ENOENT" || err.code === "EINTEGRITY") {
				// Cache miss
				return null;
			}
			throw err;
		}
	}

	async put(cacheKey, data) {
		await cacache.put(this._cacheDir, cacheKey, data);
	}

	async putStream(cacheKey, stream) {
		await cacache.put.stream(this._cacheDir, cacheKey, stream);
	}
}
