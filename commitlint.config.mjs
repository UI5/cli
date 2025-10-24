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
	},
	ignores: [
		// Ignore release commits, as their subject doesn't start with an uppercase letter
		(message) => message.startsWith("release: v"),
	],
};
