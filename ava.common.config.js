export default {
	files: [
		"test/lib/**/*.js",
		"!test/**/__helper__/**"
	],
	watchMode: {
		ignoreChanges: [
			"test/tmp/**"
		],
	},
	nodeArguments: [
		"--loader=esmock",
		"--no-warnings"
	],
	workerThreads: false,
};
