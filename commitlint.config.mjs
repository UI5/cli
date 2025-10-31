export default {
	extends: [
		"@commitlint/config-conventional",
	],
	rules: {
		"type-enum": [
			2,
			"always",
			[
				"build",
				"ci",
				"deps",
				"docs",
				"feat",
				"fix",
				"perf",
				"refactor",
				"release",
				"revert",
				"style",
				"test",
			],
		],
		"body-max-line-length": [2, "always", 160],
		"footer-max-line-length": [0],
		"subject-case": [
			2, "always",
			["sentence-case", "start-case", "pascal-case"],
		],
		// Limit scope to package names and special cases
		"scope-enum": [
			2,
			"always",
			[
				// Package names
				"builder",
				"cli",
				"documentation",
				"fs",
				"logger",
				"project",
				"server",
				// Special scope for dev dependencies
				"deps-dev"
			]
		],
		"scope-case": [2, "always", "lowercase"],
	},
	ignores: [
		// Ignore release commits, as their subject doesn't start with an uppercase letter
		(message) => message.startsWith("release: v"),
	],
};
