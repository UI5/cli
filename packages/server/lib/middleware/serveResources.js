import {getLogger} from "@ui5/logger";
const log = getLogger("server:middleware:serveResources");
import replaceStream from "replacestream";
import etag from "etag";
import fresh from "fresh";

const rProperties = /\.properties$/i;
const rReplaceVersion = /\.(library|js|json)$/i;
const rManifest = /\/manifest.json$/i;
const rResourcesPrefix = /^\/resources\//i;

function isFresh(req, res) {
	return fresh(req.headers, {
		"etag": res.getHeader("ETag")
	});
}


/**
 * Creates and returns the middleware to serve application resources.
 *
 * @module @ui5/server/middleware/serveResources
 * @param {object} parameters Parameters
 * @param {@ui5/server/internal/MiddlewareManager.middlewareResources} parameters.resources Parameters
 * @param {object} parameters.middlewareUtil [MiddlewareUtil]{@link @ui5/server/middleware/MiddlewareUtil} instance
 * @returns {Function} Returns a server middleware closure.
 */
function createMiddleware({resources, middlewareUtil}) {
	return async function serveResources(req, res, next) {
		try {
			const pathname = middlewareUtil.getPathname(req);
			let resource = await resources.all.byPath(pathname);
			if (!resource) { // Not found
				if (!rManifest.test(pathname) || !rResourcesPrefix.test(pathname)) {
					next();
					return;
				}
				log.verbose(`Could not find manifest.json for ${pathname}. ` +
					`Checking for .library file to generate manifest.json from.`);
				const {default: generateLibraryManifest} = await import("./helper/generateLibraryManifest.js");
				// Attempt to find a .library file, which is required for generating a manifest.json
				const dotLibraryPath = pathname.replace(rManifest, "/.library");
				const dotLibraryResource = await resources.all.byPath(dotLibraryPath);
				if (dotLibraryResource && dotLibraryResource.getProject()?.getType() === "library") {
					resource = await generateLibraryManifest(middlewareUtil, dotLibraryResource);
				}
				if (!resource) {
					// Not a library project, missing .library file or other reason for failed manifest.json generation
					next();
					return;
				}
			}

			const resourcePath = resource.getPath();
			if (rProperties.test(resourcePath)) {
				// Special handling for *.properties files escape non ascii characters.
				const {default: nonAsciiEscaper} = await import("@ui5/builder/processors/nonAsciiEscaper");
				const project = resource.getProject();
				let propertiesFileSourceEncoding = project?.getPropertiesFileSourceEncoding?.();

				if (!propertiesFileSourceEncoding) {
					if (project && project.getSpecVersion().lte("1.1")) {
						// default encoding to "ISO-8859-1" for old specVersions
						propertiesFileSourceEncoding = "ISO-8859-1";
					} else {
						// default encoding to "UTF-8" for all projects starting with specVersion 2.0
						propertiesFileSourceEncoding = "UTF-8";
					}
				}
				const encoding = nonAsciiEscaper.getEncodingFromAlias(propertiesFileSourceEncoding);
				await nonAsciiEscaper({
					resources: [resource], options: {
						encoding
					}
				});
			}

			const {contentType, charset} = middlewareUtil.getMimeInfo(resourcePath);
			if (!res.getHeader("Content-Type")) {
				res.setHeader("Content-Type", contentType);
			}

			// Enable ETag caching
			const statInfo = resource.getStatInfo();
			if (statInfo?.size !== undefined) {
				res.setHeader("ETag", etag(statInfo));
			} else {
				// Fallback to buffer if stats are not available or insufficient
				res.setHeader("ETag", etag(await resource.getBuffer()));
			}

			if (isFresh(req, res)) {
				// client has a fresh copy of the resource
				res.statusCode = 304;
				res.end();
				return;
			}

			let stream = resource.getStream();

			// Only execute version replacement for UTF-8 encoded resources because replaceStream will always output
			//	UTF-8 anyways.
			// Also, only process .library, *.js and *.json files. Just like it's done in Application-
			//	and LibraryBuilder
			if ((!charset || charset === "UTF-8") && rReplaceVersion.test(resourcePath)) {
				if (resource.getProject()) {
					stream.setEncoding("utf8");
					stream = stream.pipe(replaceStream("${version}", resource.getProject().getVersion()));
				} else {
					log.verbose(`Project missing from resource ${pathname}"`);
				}
			}

			stream.pipe(res);
		} catch (err) {
			next(err);
		}
	};
}

export default createMiddleware;
