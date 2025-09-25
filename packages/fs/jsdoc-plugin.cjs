/*
 * This plugin fixes unexpected JSDoc behavior that prevents us from using types that start with an at-sign (@).
 * JSDoc doesn't see "{@" as a valid type expression, probably as there's also {@link ...}.
 */
exports.handlers = {
	jsdocCommentFound: function(e) {
		e.comment = e.comment.replace(/{@ui5\//g, "{ @ui5/");
	}
};
