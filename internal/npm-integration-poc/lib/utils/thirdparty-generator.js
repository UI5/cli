/**
 * Thirdparty Wrapper Generator
 *
 * Generates thirdparty/ wrappers with absolute namespace paths from gen/ wrappers
 */

import {generateUI5ControlThirdparty} from "../templates/ui5-control-template.js";
import {generatePackageExportThirdparty} from "../templates/package-export-template.js";

export class ThirdpartyGenerator {
	constructor(pathResolver) {
		this.pathResolver = pathResolver;
	}

	/**
	 * Generate thirdparty control wrappers from metadata
	 *
	 * @param $metadata
	 * @param log
	 */
	generateControlWrappers($metadata, log = null) {
		const wrappers = new Map();

		for (const [, controlMeta] of Object.entries($metadata.controls || {})) {
			const {componentName, ui5Metadata} = controlMeta;

			const thirdpartyCode = generateUI5ControlThirdparty({
				componentName,
				ui5Metadata
			}, {
				namespace: this.pathResolver.namespace,
				thirdpartyNamespace: this.pathResolver.thirdpartyNamespace,
				qualifiedNamespace: this.pathResolver.qualifiedNamespace
			});

			const path = `${this.pathResolver.thirdpartyNamespace}/@ui5/webcomponents/dist/${componentName}`;
			wrappers.set(path, thirdpartyCode);

			log?.info(`✅ Generated thirdparty wrapper: ${path}`);
		}

		return wrappers;
	}

	/**
	 * Generate thirdparty package exports from metadata
	 *
	 * @param $metadata
	 * @param log
	 */
	generatePackageExports($metadata, log = null) {
		const exports = new Map();

		for (const [fileName, packageMeta] of Object.entries($metadata.packages || {})) {
			const {packageName, version, chunkName} = packageMeta;

			const thirdpartyCode = generatePackageExportThirdparty({
				packageName,
				version,
				chunkName
			}, {
				namespace: this.pathResolver.namespace,
				thirdpartyNamespace: this.pathResolver.thirdpartyNamespace
			});

			const path = `${this.pathResolver.thirdpartyNamespace}/${fileName.replace(/\.js$/, "")}`;
			exports.set(path, thirdpartyCode);

			log?.info(`✅ Generated thirdparty package: ${path}`);
		}

		return exports;
	}
}
