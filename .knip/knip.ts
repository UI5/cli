import type { KnipConfig } from 'knip';

const config: KnipConfig = {
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
	},

	ignoreDependencies: [
		"@ui5/*",
		"docdash",
		"husky",
		"local-web-server",
		"@istanbuljs/esm-loader-hook",
		"cssnano",
		"data-with-position",
		"js-yaml",
		"open",
		"pretty-hrtime",
		"compression",
		"cors"
	]
};

export default config;
