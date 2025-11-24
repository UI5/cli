const PUBLIC_PACKAGES = [
	"builder",
	"cli",
	"documentation",
	"fs",
	"logger",
	"project",
	"server",
];

const INTERNAL_PACKAGES = [
	"documentation",
	"shrinkwrap-extractor"
];

const ALLOWED_TYPE_SCOPE_COMBINATIONS = {
	"build": ["deps-dev"],
	"ci": ["github-actions", "release-please"],
	"deps": [...PUBLIC_PACKAGES, ...INTERNAL_PACKAGES],
	"feat": PUBLIC_PACKAGES,
	"fix": PUBLIC_PACKAGES,
};

const ALL_SCOPES = Object.values(ALLOWED_TYPE_SCOPE_COMBINATIONS).flat();

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
			ALL_SCOPES,
		],
		"scope-case": [2, "always", "lowercase"],

		// Enable custom rule for type-scope combinations (see code below)
		"custom/type-scope-combination": [
			2,
			"always",
		],
	},
	ignores: [
		// Ignore release commits, as their subject doesn't start with an uppercase letter
		(message) => message.startsWith("release: v"),
	],
	plugins: [
		{
			rules: {
				"custom/type-scope-combination": ({type, scope}) => {
					// If no scope, it's valid
					if (!scope) {
						return [true];
					}
					// If type not in restrictions, allow any scope
					if (!ALLOWED_TYPE_SCOPE_COMBINATIONS[type]) {
						return [true];
					}
					// Check if the combination is allowed
					const isAllowed = ALLOWED_TYPE_SCOPE_COMBINATIONS[type].includes(scope);
					return [
						isAllowed,
						`Scope "${scope}" is not allowed with type "${type}". ` +
						`Allowed scopes: ${ALLOWED_TYPE_SCOPE_COMBINATIONS[type].join(", ")}`
					];
				}
			}
		}
	]
};
