/*global env: true */
'use strict';

var doop = require('jsdoc/util/doop');
var fs = require('jsdoc/fs');
var helper = require('jsdoc/util/templateHelper');
var logger = require('jsdoc/util/logger');
var path = require('jsdoc/path');
var taffy = require('@jsdoc/salty').taffy;
var template = require('jsdoc/template');
var util = require('node:util');

var htmlsafe = helper.htmlsafe;
var resolveAuthorLinks = helper.resolveAuthorLinks;
// Not needed anymore
//var linkto = helper.linkto;
//var scopeToPunc = helper.scopeToPunc;
//var hasOwnProp = Object.prototype.hasOwnProperty;

var data;
var view;

// Modified to be able to link source files to GitHub
var githubSourceBaseUrl;

var outdir = path.normalize(env.opts.destination);

function find(spec) {
	return helper.find(data, spec);
}

function tutoriallink(tutorial) {
	return helper.toTutorial(tutorial, null, { tag: 'em', classname: 'disabled', prefix: '' });
}

function getAncestorLinks(doclet) {
	return helper.getAncestorLinks(data, doclet);
}

// Modified to output Markdown style links
function hashToLink(doclet, hash) {
	if ( !/^(#.+)/.test(hash) ) { return hash; }

	var url = helper.createLink(doclet);

	url = url.replace(/(#.+|$)/, hash);
	return '[' + hash + '](' + url + ')';
}

function needsSignature(doclet) {
	var needsSig = false;

	// function and class definitions always get a signature
	if (doclet.kind === 'function' || doclet.kind === 'class') {
		needsSig = true;
	}
	// typedefs that contain functions get a signature, too
	else if (doclet.kind === 'typedef' && doclet.type && doclet.type.names &&
		doclet.type.names.length) {
		for (var i = 0, l = doclet.type.names.length; i < l; i++) {
			if (doclet.type.names[i].toLowerCase() === 'function') {
				needsSig = true;
				break;
			}
		}
	}

	return needsSig;
}

function getSignatureAttributes(item) {
	var attributes = [];

	if (item.optional) {
		attributes.push('opt');
	}

	if (item.nullable === true) {
		attributes.push('nullable');
	}
	else if (item.nullable === false) {
		attributes.push('non-null');
	}

	return attributes;
}

function updateItemName(item) {
	var attributes = getSignatureAttributes(item);
	var itemName = item.name || '';

	if (item.variable) {
		itemName = '&hellip;' + itemName;
	}

	if (attributes && attributes.length) {
		itemName = util.format( '%s<span class="signature-attributes">%s</span>', itemName,
			attributes.join(', ') );
	}

	return itemName;
}

function addParamAttributes(params) {
	return params.filter(function(param) {
		return param.name && param.name.indexOf('.') === -1;
	}).map(updateItemName);
}

function buildItemTypeStrings(item) {
	var types = [];

	if (item && item.type && item.type.names) {
		item.type.names.forEach(function(name) {
			types.push( linkTo(name, htmlsafe(name)) );
		});
	}

	return types;
}

function buildAttribsString(attribs) {
	var attribsString = '';

	if (attribs && attribs.length) {
		attribsString = htmlsafe( util.format('(%s) ', attribs.join(', ')) );
	}

	return attribsString;
}

function addNonParamAttributes(items) {
	var types = [];

	items.forEach(function(item) {
		types = types.concat( buildItemTypeStrings(item) );
	});

	return types;
}

function addSignatureParams(f) {
	var params = f.params ? addParamAttributes(f.params) : [];
	f.signature = util.format( '%s(%s)', (f.signature || ''), params.join(', ') );
}

function addSignatureReturns(f) {
	var attribs = [];
	var attribsString = '';
	var returnTypes = [];
	var returnTypesString = '';

	// jam all the return-type attributes into an array. this could create odd results (for example,
	// if there are both nullable and non-nullable return types), but let's assume that most people
	// who use multiple @return tags aren't using Closure Compiler type annotations, and vice-versa.
	if (f.returns) {
		f.returns.forEach(function(item) {
			helper.getAttribs(item).forEach(function(attrib) {
				if (attribs.indexOf(attrib) === -1) {
					attribs.push(attrib);
				}
			});
		});

		attribsString = buildAttribsString(attribs);
	}

	if (f.returns) {
		returnTypes = addNonParamAttributes(f.returns);
	}
	if (returnTypes.length) {
		returnTypesString = util.format( ' &rarr; %s{%s}', attribsString, returnTypes.join('|') );
	}

	// Modified to support coloring in Vitepress
	f.signature = '<span class="signature">' + (f.signature || '') + '</span>' +
		'<span class="type-signature">' + returnTypesString + '</span></div>';
}

// Modified to support coloring in Vitepress
function addSignatureTypes(f) {
	var types = f.type ? buildItemTypeStrings(f) : [];

	f.signature = (f.signature || '') + '<span class="type-signature">' +
		(types.length ? ' :' + types.join('|') : '') + '</span></div>';
}

function addAttribs(f) {
	var attribs = helper.getAttribs(f);
	var attribsString = buildAttribsString(attribs);

	f.attribs = util.format('<span class="type-signature">%s</span>', attribsString);
}

function shortenPaths(files, commonPrefix) {
	Object.keys(files).forEach(function(file) {
		files[file].shortened = files[file].resolved.replace(commonPrefix, '')
			// always use forward slashes
			.replace(/\\/g, '/');
	});

	return files;
}

function getPathFromDoclet(doclet) {
	if (!doclet.meta) {
		return null;
	}

	return doclet.meta.path && doclet.meta.path !== 'null' ?
		path.join(doclet.meta.path, doclet.meta.filename) :
		doclet.meta.filename;
}

function generate(type, title, docs, filename, resolveLinks) {
	resolveLinks = resolveLinks === false ? false : true;

	var docData = {
		type: type,
		title: title,
		docs: docs
	};

	var outpath = path.join(outdir, filename + ".md"),
		html = view.render('container.tmpl', docData);

	if (resolveLinks) {
		html = helper.resolveLinks(html); // turn {@link foo} into <a href="foodoc.html">foo</a>
	}

	// Modified: replaceAll fixes pipe escaping
	fs.writeFileSync(outpath, html.replaceAll("\\&#124;", "&#124;"), 'utf8');
}

// Modified: Don't write source files
function generateSourceFiles(sourceFiles, encoding) {
	encoding = encoding || 'utf8';
	Object.keys(sourceFiles).forEach(function(file) {
		// links are keyed to the shortened path in each doclet's `meta.shortpath` property
		var sourceOutfile = helper.getUniqueFilename(sourceFiles[file].shortened);
		helper.registerLink(sourceFiles[file].shortened, sourceOutfile);
	});
}

/**
 * Look for classes or functions with the same name as modules (which indicates that the module
 * exports only that class or function), then attach the classes or functions to the `module`
 * property of the appropriate module doclets. The name of each class or function is also updated
 * for display purposes. This function mutates the original arrays.
 *
 * @private
 * @param {Array.<module:jsdoc/doclet.Doclet>} doclets - The array of classes and functions to
 * check.
 * @param {Array.<module:jsdoc/doclet.Doclet>} modules - The array of module doclets to search.
 */
function attachModuleSymbols(doclets, modules) {
	var symbols = {};

	// build a lookup table
	doclets.forEach(function(symbol) {
		symbols[symbol.longname] = symbols[symbol.longname] || [];
		symbols[symbol.longname].push(symbol);
	});

	return modules.map(function(module) {
		if (symbols[module.longname]) {
			module.modules = symbols[module.longname]
				// Only show symbols that have a description. Make an exception for classes, because
				// we want to show the constructor-signature heading no matter what.
				.filter(function(symbol) {
					return symbol.description || symbol.kind === 'class';
				})
				.map(function(symbol) {
					symbol = doop(symbol);

					if (symbol.kind === 'class' || symbol.kind === 'function') {
						symbol.name = symbol.name.replace('module:', '(require("') + '"))';
					}

					return symbol;
				});
		}
	});
}

/**
    @param {TAFFY} taffyData See <http://taffydb.com/>.
    @param {object} opts
    @param {Tutorial} tutorials
 */
exports.publish = function(taffyData, opts, tutorials) {
	// Modified from .html to .md to output Markdown files
	helper.fileExtension = "";

	var docdash = env && env.conf && env.conf.docdash || {};
	data = taffyData;

	var conf = env.conf.templates || {};
	conf.default = conf.default || {};

	var templatePath = path.normalize(opts.template);
	view = new template.Template( path.join(templatePath, 'tmpl') );

	// Modified
	// Store GitHub base URL for source file links
	githubSourceBaseUrl = docdash.githubSourceBaseUrl || null;

	// claim some special filenames in advance, so the All-Powerful Overseer of Filename Uniqueness
	// doesn't try to hand them out later
	var indexUrl = helper.getUniqueFilename('index');
	// don't call registerLink() on this one! 'index' is also a valid longname

	var globalUrl = helper.getUniqueFilename('global');
	helper.registerLink('global', globalUrl);

	// set up templating
	view.layout = conf.default.layoutFile ?
		path.getResourcePath(path.dirname(conf.default.layoutFile),
			path.basename(conf.default.layoutFile) ) :
		'layout.tmpl';

	// set up tutorials for helper
	helper.setTutorials(tutorials);

	data = helper.prune(data);

	docdash.sort !== false && data.sort('longname, version, since');
	helper.addEventListeners(data);

	var sourceFiles = {};
	var sourceFilePaths = [];
	data().each(function(doclet) {
		doclet.attribs = '';

		if (doclet.examples) {
			doclet.examples = doclet.examples.map(function(example) {
				var caption, code;

				if (example.match(/^\s*<caption>([\s\S]+?)<\/caption>(\s*[\n\r])([\s\S]+)$/i)) {
					caption = RegExp.$1;
					code = RegExp.$3;
				}

				return {
					caption: caption || '',
					code: code || example
				};
			});
		}
		if (doclet.see) {
			doclet.see.forEach(function(seeItem, i) {
				doclet.see[i] = hashToLink(doclet, seeItem);
			});
		}

		// build a list of source files
		var sourcePath;
		if (doclet.meta) {
			sourcePath = getPathFromDoclet(doclet);
			sourceFiles[sourcePath] = {
				resolved: sourcePath,
				shortened: null
			};
			if (sourceFilePaths.indexOf(sourcePath) === -1) {
				sourceFilePaths.push(sourcePath);
			}
		}
	});

	/// update outdir if necessary, then create outdir
	var packageInfo = ( find({kind: 'package'}) || [] ) [0];
	if (packageInfo && packageInfo.name) {
		outdir = path.join( outdir, packageInfo.name, (packageInfo.version || '') );
	}
	fs.mkPath(outdir);

	// Modified: Static files are not needed anymore

	if (sourceFilePaths.length) {
		sourceFiles = shortenPaths( sourceFiles, path.commonPrefix(sourceFilePaths) );
	}
	data().each(function(doclet) {
		var url = helper.createLink(doclet);
		helper.registerLink(doclet.longname, url);

		// add a shortened version of the full path
		var docletPath;
		if (doclet.meta) {
			docletPath = getPathFromDoclet(doclet);
			docletPath = sourceFiles[docletPath].shortened;
			if (docletPath) {
				doclet.meta.shortpath = docletPath;
			}
		}
	});

	data().each(function(doclet) {
		var url = helper.longnameToUrl[doclet.longname];

		if (url.indexOf('#') > -1) {
			doclet.id = helper.longnameToUrl[doclet.longname].split(/#/).pop();
		}
		else {
			doclet.id = doclet.name;
		}

		if ( needsSignature(doclet) ) {
			addSignatureParams(doclet);
			addSignatureReturns(doclet);
			addAttribs(doclet);
		}
	});

	// do this after the urls have all been generated
	data().each(function(doclet) {
		doclet.ancestors = getAncestorLinks(doclet);

		if (doclet.kind === 'member') {
			addSignatureTypes(doclet);
			addAttribs(doclet);
		}

		if (doclet.kind === 'constant') {
			addSignatureTypes(doclet);
			addAttribs(doclet);
			doclet.kind = 'member';
		}
	});

	var members = helper.getMembers(data);
	members.tutorials = tutorials.children;

	// output pretty-printed source files by default
	var outputSourceFiles = conf.default && conf.default.outputSourceFiles !== false
		? true
		: false;

	// add template helpers
	view.find = find;
	view.linkto = linkTo;
	view.resolveAuthorLinks = resolveAuthorLinks;
	view.tutoriallink = tutoriallink;
	view.htmlsafe = htmlsafe;
	view.outputSourceFiles = outputSourceFiles;

	// once for all
	// Modified: Not needed anymore
	//view.nav = buildNav(members);
	attachModuleSymbols( find({ longname: {left: 'module:'} }), members.modules );


	// generate the pretty-printed source files first so other pages can link to them
	if (outputSourceFiles) {
		generateSourceFiles(sourceFiles, opts.encoding);
	}

	if (members.globals.length) {
		generate('', 'Global', [{kind: 'globalobj'}], globalUrl);
	}

	// index page displays information from package.json and lists files
	var files = find({kind: 'file'});
	var packages = find({kind: 'package'});

	generate('', 'Home',
		packages.concat(
			[{kind: 'mainpage', readme: opts.readme, longname: (opts.mainpagetitle) ? opts.mainpagetitle : 'Main Page'}]
		).concat(files),
		indexUrl);

	// set up the lists that we'll use to generate pages
	var classes = taffy(members.classes);
	var modules = taffy(members.modules);
	var namespaces = taffy(members.namespaces);
	var mixins = taffy(members.mixins);
	var externals = taffy(members.externals);
	var interfaces = taffy(members.interfaces);

	Object.keys(helper.longnameToUrl).forEach(function(longname) {
		var myModules = helper.find(modules, {longname: longname});
		if (myModules.length) {
			generate('Module', myModules[0].name, myModules, helper.longnameToUrl[longname]);
		}

		var myClasses = helper.find(classes, {longname: longname});
		if (myClasses.length) {
			generate('Class', myClasses[0].name, myClasses, helper.longnameToUrl[longname]);
		}

		var myNamespaces = helper.find(namespaces, {longname: longname});
		if (myNamespaces.length) {
			generate('Namespace', myNamespaces[0].name, myNamespaces, helper.longnameToUrl[longname]);
		}

		var myMixins = helper.find(mixins, {longname: longname});
		if (myMixins.length) {
			generate('Mixin', myMixins[0].name, myMixins, helper.longnameToUrl[longname]);
		}

		var myExternals = helper.find(externals, {longname: longname});
		if (myExternals.length) {
			generate('External', myExternals[0].name, myExternals, helper.longnameToUrl[longname]);
		}

		var myInterfaces = helper.find(interfaces, {longname: longname});
		if (myInterfaces.length) {
			generate('Interface', myInterfaces[0].name, myInterfaces, helper.longnameToUrl[longname]);
		}
	});

	// TODO: move the tutorial functions to templateHelper.js
	function generateTutorial(title, tutorial, filename) {
		var tutorialData = {
			title: title,
			header: tutorial.title,
			content: tutorial.parse(),
			children: tutorial.children
		};

		var tutorialPath = path.join(outdir, filename);
		var html = view.render('tutorial.tmpl', tutorialData);

		// yes, you can use {@link} in tutorials too!
		html = helper.resolveLinks(html); // turn {@link foo} into <a href="foodoc.html">foo</a>
		fs.writeFileSync(tutorialPath, html, 'utf8');
	}

	// tutorials can have only one parent so there is no risk for loops
	function saveChildren(node) {
		node.children.forEach(function(child) {
			generateTutorial(child.title, child, helper.tutorialToUrl(child.name));
			saveChildren(child);
		});
	}

	saveChildren(tutorials);
};

// Taken from templateHelper.js in jsdoc/util

function linkTo(longname, linkText, cssClass, fragmentId) {
	const classString = cssClass ? util.format(' class="%s"', cssClass) : '';
	let fileUrl;
	let fragmentString = fragmentId ? `#${fragmentId}` : '';
	let stripped;
	let text;

	// handle cases like:
	// @see <http://example.org>
	// @see http://example.org
	stripped = longname ? longname.replace(/^<|>$/g, '') : '';
	const hasUrlPrefix = /^(http|ftp)s?:\/\//.test(stripped);

	if (hasUrlPrefix) {
		fileUrl = stripped;
		text = linkText || stripped;
		// Add target and rel attributes for external links
		return util.format('<a href="%s"%s target="_blank" rel="noopener noreferrer">%s</a>',
			encodeURI(fileUrl + fragmentString), classString, text);
	}
		// handle complex type expressions that may require multiple links
	// (but skip anything that looks like an inline tag or HTML tag)
	else if (longname && isComplexTypeExpression(longname) &&
		!/\{@.+\}/.test(longname) && !/^<[\s\S]+>/.test(longname)) {
		// Parse complex types and create links for nested types
		return linkComplexType(longname, linkText, cssClass);
	}
	else {
		fileUrl = helper.longnameToUrl[longname] || '';
		text = linkText || longname;

		// If the URL contains a fragment (hash), extract it
		if (fileUrl && fileUrl.indexOf('#') > -1) {
			const parts = fileUrl.split('#');
			fileUrl = parts[0];
			// Only use the URL's fragment if no explicit fragmentId was provided
			if (!fragmentId) {
				fragmentString = '#' + parts[1];
			}
		}

		// Convert source file links to GitHub URLs if configured
		if (fileUrl && githubSourceBaseUrl && (fileUrl.endsWith('.js.md') || longname.endsWith('.js'))) {
			fileUrl = convertSourceLinkToGitHub(fileUrl, longname);
			// GitHub links should open in new tab
			return util.format('<a href="%s"%s target="_blank" rel="noopener noreferrer">%s</a>',
				encodeURI(fileUrl + fragmentString), classString, text);
		}
			// Remove .md extension from internal links for VitePress compatibility
		// Handle both cases: with and without fragment identifiers
		else if (fileUrl) {
			fileUrl = fileUrl.replace(/\.md$/, '');
		}
	}

	text = text || longname;

	if (!fileUrl) {
		return text;
	}
	else {
		return util.format('<a href="%s"%s>%s</a>', encodeURI(fileUrl + fragmentString),
			classString, text);
	}
}

function convertSourceLinkToGitHub(fileUrl, longname) {
	if (!githubSourceBaseUrl) {
		return fileUrl;
	}

	// Look up the original source path from the reverse mapping
	let sourcePath = helper.longnameToUrl.urlToLongname || {};

	// Try to find the original path from the URL
	for (let originalPath in helper.longnameToUrl) {
		if (helper.longnameToUrl[originalPath] === fileUrl) {
			sourcePath = originalPath;
			break;
		}
	}

	// If we found a valid source path, convert it to GitHub URL
	if (typeof sourcePath === 'string' && sourcePath.endsWith('.js')) {
		// Clean up the path - remove any leading slashes or backslashes
		sourcePath = sourcePath.replace(/^[\/\\]+/, '');

		// Return the GitHub URL
		return `${githubSourceBaseUrl}/${sourcePath}`;
	}

	// Fallback: if no mapping found, return original fileUrl
	return fileUrl;
}

function isComplexTypeExpression(expr) {
	// record types, type unions, and type applications all count as "complex"
	return /^{.+}$/.test(expr) || /^.+\|.+$/.test(expr) || /^.+<.+>$/.test(expr);
}

function linkComplexType(longname, linkText, cssClass) {
	const classString = cssClass ? util.format(' class="%s"', cssClass) : '';

	// Handle type unions (e.g., "string | number")
	if (/^.+\|.+$/.test(longname) && !/<.+>/.test(longname)) {
		const types = longname.split('|').map(t => t.trim());
		return types.map(type => {
			let url = helper.longnameToUrl[type];
			if (url) {
				// Remove .md extension for VitePress compatibility
				url = url.replace(/\.md$/, '');
				return util.format('<a href="%s"%s>%s</a>', encodeURI(url), classString, htmlsafe(type));
			}
			return htmlsafe(type);
		}).join(' | ');
	}

	// Handle generic types (e.g., "Array.<string>", "Promise.<@ui5/fs/Resource>")
	if (/<.+>/.test(longname)) {
		return linkGenericType(longname, classString);
	}

	// Handle record types (e.g., "{a: string, b: number}")
	if (/^{.+}$/.test(longname)) {
		return htmlsafe(longname);
	}

	// Fallback
	return linkText || htmlsafe(longname);
}

function linkGenericType(type, classString) {
	// Match patterns like "Promise.<Type>" or "Array.<Type>" or "Promise.<Array.<Type>>"
	const match = type.match(/^([^<]+)<(.+)>$/);

	if (!match) {
		return htmlsafe(type);
	}

	const baseType = match[1];
	const innerType = match[2];

	// Link the base type if it has a URL
	let result = '';
	let baseUrl = helper.longnameToUrl[baseType];
	if (baseUrl) {
		// Remove .md extension for VitePress compatibility
		baseUrl = baseUrl.replace(/\.md$/, '');
		result = util.format('<a href="%s"%s>%s</a>', encodeURI(baseUrl), classString, htmlsafe(baseType));
	} else {
		result = htmlsafe(baseType);
	}

	result += '.&lt;';

	// Recursively handle the inner type
	if (isComplexTypeExpression(innerType)) {
		result += linkComplexType(innerType, null, classString.replace(' class="', '').replace('"', ''));
	} else {
		let innerUrl = helper.longnameToUrl[innerType];
		if (innerUrl) {
			// Remove .md extension for VitePress compatibility
			innerUrl = innerUrl.replace(/\.md$/, '');
			result += util.format('<a href="%s"%s>%s</a>', encodeURI(innerUrl), classString, htmlsafe(innerType));
		} else {
			result += htmlsafe(innerType);
		}
	}

	result += '>';

	return result;
}
