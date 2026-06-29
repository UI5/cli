import chalk from "chalk";

// Shared content for the "accepting remote connections" warning, rendered
// both by the live banner (see render.js) and by the plain stderr fallback
// in the serve command. `style` selects one of the chalk presets in
// `WARNING_STYLES` — adding a new one means adding a branch there too.
export const REMOTE_CONNECTIONS_WARNING_LINES = Object.freeze([
	{text: "△ This server is accepting connections from all hosts on your network", style: "heading"},
	{text: "Please Note:", style: "note"},
	{text: "• This server is intended for development purposes only. Do not use it in production.",
		style: "bulletStrong"},
	{text: "• Vulnerable (custom-)middleware can pose a threat to your system when exposed to the network.",
		style: "bullet"},
	{text: "• The use of proxy-middleware with preconfigured credentials might enable unauthorized access",
		style: "bullet"},
	{text: "  to a target system for third parties on your network.",
		style: "bullet"},
]);

export const WARNING_STYLES = {
	heading: (s) => chalk.bold.yellow(s),
	note: (s) => chalk.dim.underline(s),
	bulletStrong: (s) => chalk.bold.dim(s),
	bullet: (s) => chalk.dim(s),
};
