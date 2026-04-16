/**
 * @type {import('knip').KnipConfig}
 */
const config = {
	/**
	 * We only need dependency checking at the moment,
	 * so all checks except for dependencies are turned off.
	 */
	rules: {
		files: "off",
		duplicates: "off",
		classMembers: "off",
		unlisted: "off",
		binaries: "off",
		unresolved: "off",
		catalog: "off",
		exports: "off",
		types: "off",
		enumMembers: "off",
		/**
		 * We also ignore peer dependencies because @ui5/project
		 * defines an optional peer dependency to @ui5/builder
		 * which is needed and not an issue in our point of view.
		 */
		optionalPeerDependencies: "off"
	},

	ignoreDependencies: [
		/**
		 * Used via nyc ava --node-arguments="--experimental-loader=@istanbuljs/esm-loader-hook"
		 * which is not detected by knip as a usage of this package
		 */
		"@istanbuljs/esm-loader-hook"
	],

	workspaces: {
		".": {
			ignoreDependencies: [
				/**
				 * Invoked manually via "npx husky" to install git hooks
				 */
				"husky"
			]
		},
		"packages/cli": {
			ignoreDependencies: [
				/**
				 * The package.json files of all @ui5/* packages are dynamically required for the "version" command
				 * (See packages/cli/lib/cli/commands/versions.js)
				 * Only @ui5/fs is not used anywhere else in the CLI package, so we need to ignore it here
				 */
				"@ui5/fs"
			],
			entry: [
				/**
				 * Commands are dynamically loaded via readdir (see packages/cli/lib/cli/cli.js)
				 */
				"lib/cli/commands/*.js"
			]
		},
		"packages/server": {
			/**
			 * We ignore these dependencies here because these are dynamic imports
			 * and knip is unable to detect that these are being used
			 * (See packages/server/lib/middleware/MiddlewareManager.js)
			 */
			ignoreDependencies: [
				"compression",
				"cors"
			]
		},
		"packages/*": {
		},
		"internal/documentation": {
			ignoreDependencies: [
				/**
				 * Used in internal/documentation/postcss.config.js but can't be detected
				 * as the plugin is dynamically applied based on NODE_ENV.
				 */
				"cssnano",
				/**
				 * Used as jsdoc template in package.json script, which is not detected
				 */
				"docdash"
			]
		},
		"internal/*": {
		}
	}
};

module.exports = config;
