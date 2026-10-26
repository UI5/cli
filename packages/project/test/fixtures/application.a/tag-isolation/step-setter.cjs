const setter = require("./setter.cjs");

module.exports = function build(options) {
	const {task, determineRequiredDependencies} = setter(options);
	return {
		steps: [{name: "tag", run: task}],
		determineRequiredDependencies
	};
};
