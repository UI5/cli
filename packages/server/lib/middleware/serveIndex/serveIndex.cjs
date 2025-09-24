/*
 * serve-index
 *
 * Version: 1.9.1
 *
 * Author: Douglas Christopher Wilson
 * Web: https://github.com/expressjs/serve-index/tree/20e83c893b701c3a117a0f6836be0f5a818bb925
 *
 * Licensed under
 *   MIT License, see "/LICENSES/MIT.txt"
 *
 * Copyright (c) 2010 Sencha Inc.
 * Copyright (c) 2011 LearnBoost
 * Copyright (c) 2011 TJ Holowaychuk
 * Copyright (c) 2014-2015 Douglas Christopher Wilson
 *
 */

const escapeHtml = require("escape-html");
const mime = require("mime-types");
const path = require("path");
const fs = require("graceful-fs");
const normalize = path.normalize;
const sep = path.sep;
const join = path.join;
const extname = path.extname;
const cache = {};

/**
 * Map html `files`, returning an html unordered list.
 *
 * @private
 */

function createHtmlFileList(files, view) {
	let html = "<ul id=\"files\" class=\"view-" + escapeHtml(view) + "\">" +
		(view === "details" ? (
			"<li class=\"header\">" +
			"<span class=\"name\">Name</span>" +
			"<span class=\"size\">Size</span>" +
			"<span class=\"date\">Modified</span>" +
			"<span class=\"project\">Project</span>" +
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
			"<span class=\"project\">" + escapeHtml(file.project) + "</span>" +
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
 * @param {string} icon
 * @returns {string}
 */

function load(icon) {
	if (cache[icon]) return cache[icon];
	return cache[icon] = fs.readFileSync(path.join(__dirname, "icons", icon), "base64");
}

/**
 * Normalizes the path separator from system separator
 * to URL separator, aka `/`.
 *
 * @param {string} path
 * @returns {string}
 */

function normalizeSlashes(path) {
	return path.split(sep).join("/");
}

/**
 * Filter "hidden" `files`, aka files
 * beginning with a `.`.
 *
 * @param resourceInfos
 * @returns {Array}
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

function handleRequest({req, res, next, showHidden, simpleIndex, resourceInfos, pathname}) {
	const hidden = showHidden; // display hidden files
	const view = simpleIndex ? "tiles" : "details";

	if (!hidden) {
		resourceInfos = removeHidden(resourceInfos);
	}

	const stylesheet = join(__dirname, "style.css");
	const template = join(__dirname, "directory.html");

	const render = createHtmlRender(template);

	// read stylesheet
	fs.readFile(stylesheet, "utf8", function(err, style) {
		if (err) {
			return next(err);
		}

		// create locals for rendering
		const locals = {
			directory: pathname,
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
}

module.exports = handleRequest;
