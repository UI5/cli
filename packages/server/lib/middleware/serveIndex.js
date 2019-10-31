const log = require("@ui5/logger").getLogger("server:middleware:serveIndex");
const escapeHtml = require("escape-html");
const fs = require("fs");
const path = require("path");
const normalize = path.normalize;
const sep = path.sep;
const extname = path.extname;
const join = path.join;
const mime = require("mime-types");

const KB = 1024;
const MB = KB * KB;
const GB = KB * KB * KB;

/**
 * Returns the mime type of the given resource
 *
 * @param {module:@ui5/fs.Resource} resource the resource
 * @returns {string} mime type
 */
function getMimeType(resource) {
	return mime.lookup(resource.getPath()) || "application/octet-stream";
}

/**
 * Converts the given bytes into a proper human readable size
 *
 * @param {number} bytes bytes
 * @returns {string} human readable size
 */
function formatSize(bytes) {
	let result;
	if (bytes < KB) {
		result = bytes + " Bytes";
	} else if (bytes < MB) {
		result = Number.parseFloat(bytes / KB).toFixed(2) + " KB";
	} else if (bytes < GB) {
		result = Number.parseFloat(bytes / MB).toFixed(2) + " MB";
	} else {
		result = Number.parseFloat(bytes / GB).toFixed(2) + " GB";
	}
	return result;
}

/**
 * Creates a resource info object which is used to create the HTML
 * content for the resource listing
 *
 * @param {module:@ui5/fs.Resource} resource the resource to convert
 * @returns {Object} resource info object
 */
function createResourceInfo(resource) {
	const stat = resource.getStatInfo();
	const isDir = stat.isDirectory();
	return {
		path: resource.getPath() + (isDir ? "/" : ""),
		name: resource._name + (isDir ? "/" : ""),
		isDir: isDir,
		mimetype: isDir ? "" : getMimeType(resource),
		lastModified: new Date(stat.mtime).toLocaleString(),
		size: formatSize(stat.size),
		sizeInBytes: stat.size,
		// TODO: project as public API of FS?
		project: resource._project ? resource._project.id : "<unknown>",
		projectPath: resource._project ? resource._project.path : "<unknown>"
	};
}

/**
 * Creates a resource info array from the given resource array
 *
 * @param {module:@ui5/fs.Resource[]} resources an array of resources
 * @returns {Object[]} sorted array of resource infos
 */
function createResourceInfos(resources) {
	return resources.map((item, i) => {
		return createResourceInfo(item);
	}).sort((a, b) => {
		if (a.isDir && !b.isDir) {
			return -1;
		} else if (!a.isDir && b.isDir) {
			return 1;
		} else {
			// numbers will be sorted by name as string like the FS does!
			return a.name.localeCompare(b.name);
		}
	});
}


const cache = {};

/**
 * Map html `files`, returning an html unordered list.
 * @private
 */

function createHtmlFileList(files, view) {
	let html = "<ul id=\"files\" class=\"view-" + escapeHtml(view) + "\">" +
		(view === "details" ? (
			"<li class=\"header\">" +
			"<span class=\"name\">Name</span>" +
			"<span class=\"size\">Size</span>" +
			"<span class=\"date\">Modified</span>" +
			"</li>") : "");

	html += files.map(function(file) {
		const classes = [];
		const isDir = file.isDir;
		const path = file.path;

		classes.push("icon");

		if (isDir) {
			classes.push("icon-directory");
		} else {
			const ext = extname(file.name);
			const icon = iconLookup(file.name);

			classes.push("icon");
			classes.push("icon-" + ext.substring(1));

			if (classes.indexOf(icon.className) === -1) {
				classes.push(icon.className);
			}
		}

		const date = file.lastModified;
		const size = file.size;

		return "<li><a href=\"" +
			escapeHtml(normalizeSlashes(normalize(path))) +
			"\" class=\"" + escapeHtml(classes.join(" ")) + "\"" +
			" title=\"" + escapeHtml(file.name) + "\">" +
			"<span class=\"name\">" + escapeHtml(file.name) + "</span>" +
			"<span class=\"size\">" + escapeHtml(size) + "</span>" +
			"<span class=\"date\">" + escapeHtml(date) + "</span>" +
			"</a></li>";
	}).join("\n");

	html += "</ul>";

	return html;
}

/**
 * Create function to render html.
 */

function createHtmlRender(template) {
	return function render(locals, callback) {
		// read template
		fs.readFile(template, "utf8", function(err, str) {
			if (err) return callback(err);
			const body = str
				.replace(/{style}/g, locals.style.concat(iconStyle(locals.fileList)))
				.replace(/{files}/g, createHtmlFileList(locals.fileList, locals.viewName))
				.replace(/{directory}/g, escapeHtml(locals.directory))
				.replace(/{linked-path}/g, htmlPath(locals.directory));

			callback(null, body);
		});
	};
}

/**
 * Map html `dir`, returning a linked path.
 */

function htmlPath(dir) {
	const parts = dir.split("/");
	const crumb = new Array(parts.length);

	for (let i = 0; i < parts.length; i++) {
		const part = parts[i];

		if (part) {
			parts[i] = encodeURIComponent(part);
			crumb[i] = "<a href=\"" + escapeHtml(parts.slice(0, i + 1).join("/")) + "\">" + escapeHtml(part) + "</a>";
		}
	}

	return crumb.join(" / ");
}

/**
 * Get the icon data for the file name.
 */

function iconLookup(filename) {
	const ext = extname(filename);

	// try by extension
	if (icons[ext]) {
		return {
			className: "icon-" + ext.substring(1),
			fileName: icons[ext]
		};
	}

	const mimetype = mime.lookup(ext);

	// default if no mime type
	if (mimetype === false) {
		return {
			className: "icon-default",
			fileName: icons.default
		};
	}

	// try by mime type
	if (icons[mimetype]) {
		return {
			className: "icon-" + mimetype.replace("/", "-"),
			fileName: icons[mimetype]
		};
	}

	const suffix = mimetype.split("+")[1];

	if (suffix && icons["+" + suffix]) {
		return {
			className: "icon-" + suffix,
			fileName: icons["+" + suffix]
		};
	}

	const type = mimetype.split("/")[0];

	// try by type only
	if (icons[type]) {
		return {
			className: "icon-" + type,
			fileName: icons[type]
		};
	}

	return {
		className: "icon-default",
		fileName: icons.default
	};
}

/**
 * Load icon images, return css string.
 */

function iconStyle(files) {
	let iconName;
	let i;
	const list = [];
	const rules = {};
	let selector;
	const selectors = {};
	let style = "";

	for (i = 0; i < files.length; i++) {
		const file = files[i];

		const isDir = file.isDir;
		const icon = isDir ?
			{className: "icon-directory", fileName: icons.folder} :
			iconLookup(file.name);
		iconName = icon.fileName;

		selector = "#files ." + icon.className + " .name";

		if (!rules[iconName]) {
			rules[iconName] = "background-image: url(data:image/png;base64," + load(iconName) + ");";
			selectors[iconName] = [];
			list.push(iconName);
		}

		if (selectors[iconName].indexOf(selector) === -1) {
			selectors[iconName].push(selector);
		}
	}

	for (i = 0; i < list.length; i++) {
		iconName = list[i];
		style += selectors[iconName].join(",\n") + " {\n  " + rules[iconName] + "\n}\n";
	}

	return style;
}

/**
 * Load and cache the given `icon`.
 *
 * @param {String} icon
 * @return {String}
 */

function load(icon) {
	if (cache[icon]) return cache[icon];
	return cache[icon] = fs.readFileSync(__dirname + "/indexDesign/icons/" + icon, "base64");
}

/**
 * Normalizes the path separator from system separator
 * to URL separator, aka `/`.
 *
 * @param {String} path
 * @return {String}
 */

function normalizeSlashes(path) {
	return path.split(sep).join("/");
}

/**
 * Filter "hidden" `files`, aka files
 * beginning with a `.`.
 *
 * @return {Array}
 * @param resourceInfos
 */

function removeHidden(resourceInfos) {
	return resourceInfos.filter(function(info) {
		return !(/(^|\/)\.[^/.]/g).test(info.path);
	});
}

/**
 * Icon map.
 */

const icons = {
	// base icons
	"default": "page_white.png",
	"folder": "folder.png",

	// generic mime type icons
	"font": "font.png",
	"image": "image.png",
	"text": "page_white_text.png",
	"video": "film.png",

	// generic mime suffix icons
	"+json": "page_white_code.png",
	"+xml": "page_white_code.png",
	"+zip": "box.png",

	// specific mime type icons
	"application/javascript": "page_white_code_red.png",
	"application/json": "page_white_code.png",
	"application/msword": "page_white_word.png",
	"application/pdf": "page_white_acrobat.png",
	"application/postscript": "page_white_vector.png",
	"application/rtf": "page_white_word.png",
	"application/vnd.ms-excel": "page_white_excel.png",
	"application/vnd.ms-powerpoint": "page_white_powerpoint.png",
	"application/vnd.oasis.opendocument.presentation": "page_white_powerpoint.png",
	"application/vnd.oasis.opendocument.spreadsheet": "page_white_excel.png",
	"application/vnd.oasis.opendocument.text": "page_white_word.png",
	"application/x-7z-compressed": "box.png",
	"application/x-sh": "application_xp_terminal.png",
	"application/x-msaccess": "page_white_database.png",
	"application/x-shockwave-flash": "page_white_flash.png",
	"application/x-sql": "page_white_database.png",
	"application/x-tar": "box.png",
	"application/x-xz": "box.png",
	"application/xml": "page_white_code.png",
	"application/zip": "box.png",
	"image/svg+xml": "page_white_vector.png",
	"text/css": "page_white_code.png",
	"text/html": "page_white_code.png",
	"text/less": "page_white_code.png",

	// other, extension-specific icons
	".accdb": "page_white_database.png",
	".apk": "box.png",
	".app": "application_xp.png",
	".as": "page_white_actionscript.png",
	".asp": "page_white_code.png",
	".aspx": "page_white_code.png",
	".bat": "application_xp_terminal.png",
	".bz2": "box.png",
	".c": "page_white_c.png",
	".cab": "box.png",
	".cfm": "page_white_coldfusion.png",
	".clj": "page_white_code.png",
	".cc": "page_white_cplusplus.png",
	".cgi": "application_xp_terminal.png",
	".cpp": "page_white_cplusplus.png",
	".cs": "page_white_csharp.png",
	".db": "page_white_database.png",
	".dbf": "page_white_database.png",
	".deb": "box.png",
	".dll": "page_white_gear.png",
	".dmg": "drive.png",
	".docx": "page_white_word.png",
	".erb": "page_white_ruby.png",
	".exe": "application_xp.png",
	".fnt": "font.png",
	".gam": "controller.png",
	".gz": "box.png",
	".h": "page_white_h.png",
	".ini": "page_white_gear.png",
	".iso": "cd.png",
	".jar": "box.png",
	".java": "page_white_cup.png",
	".jsp": "page_white_cup.png",
	".lua": "page_white_code.png",
	".lz": "box.png",
	".lzma": "box.png",
	".m": "page_white_code.png",
	".map": "map.png",
	".msi": "box.png",
	".mv4": "film.png",
	".pdb": "page_white_database.png",
	".php": "page_white_php.png",
	".pl": "page_white_code.png",
	".pkg": "box.png",
	".pptx": "page_white_powerpoint.png",
	".psd": "page_white_picture.png",
	".py": "page_white_code.png",
	".rar": "box.png",
	".rb": "page_white_ruby.png",
	".rm": "film.png",
	".rom": "controller.png",
	".rpm": "box.png",
	".sass": "page_white_code.png",
	".sav": "controller.png",
	".scss": "page_white_code.png",
	".srt": "page_white_text.png",
	".tbz2": "box.png",
	".tgz": "box.png",
	".tlz": "box.png",
	".vb": "page_white_code.png",
	".vbs": "page_white_code.png",
	".xcf": "page_white_picture.png",
	".xlsx": "page_white_excel.png",
	".yaws": "page_white_code.png"
};

/**
 * Creates and returns the middleware to serve a resource index.
 *
 * @module @ui5/server/middleware/serveIndex
 * @param {Object} resources Contains the resource reader or collection to access project related files
 * @param {module:@ui5/fs.AbstractReader} resources.all Resource collection which contains the workspace and the project dependencies
 * @param {boolean} details show detailed view.
 * @param {boolean} showHidden show hidden files.
 * @returns {Function} Returns a server middleware closure.
 */

function createMiddleware({resources, tiles, showHidden}) {
	const hidden = showHidden; // display hidden files
	const view = tiles ? "tiles" : "details";

	return function(req, res, next) {
		log.verbose("\n Listing index of " + req.path);
		const glob = req.path + (req.path.endsWith("/") ? "*" : "/*");
		resources.all.byGlob(glob, {nodir: false}).then((resources) => {
			if (!resources || resources.length === 0) { // Not found
				next();
				return;
			}

			let resourceInfos = createResourceInfos(resources);

			if (!hidden) resourceInfos = removeHidden(resourceInfos);

			const stylesheet = join(__dirname, "indexDesign", "style.css");
			const template = join(__dirname, "indexDesign", "directory.html");

			const render = createHtmlRender(template);

			// read stylesheet
			fs.readFile(stylesheet, "utf8", function(err, style) {
				if (err) {
					return next(err);
				}

				// create locals for rendering
				const locals = {
					directory: req.path,
					fileList: resourceInfos,
					path: path,
					style: style,
					viewName: view
				};

				// render html
				render(locals, function(err, body) {
					if (err) return next(err);

					res.writeHead(200, {
						"Content-Type": "text/html; charset=utf-8",
						"Content-Length": Buffer.byteLength(body, "utf8"),
						"X-Content-Type-Options": "nosniff"
					});
					res.end(body, "utf8");
				});
			});
		}).catch((err) => {
			next(err);
		});
	};
}

module.exports = createMiddleware;
