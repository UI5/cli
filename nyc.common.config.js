export default {
	"reporter": [
		"lcov",
		"text",
		"text-summary"
	],
	"exclude": [
		"coverage/**",
		"test/**",
		"*.config.js"
	],
	"check-coverage": true,
	"watermarks": {
		"statements": [
			70,
			90
		],
		"branches": [
			70,
			90
		],
		"functions": [
			70,
			90
		],
		"lines": [
			70,
			90
		]
	},
	"cache": true,
	"all": true
};
