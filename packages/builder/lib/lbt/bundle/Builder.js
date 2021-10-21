/* eslint quotes: ["error", "double", { "allowTemplateLiterals": true }] */
// for consistency of write calls, we generally allow template literals
"use strict";

const path = require("path");
const terser = require("terser");
const {pd} = require("pretty-data");
const {parseJS, Syntax} = require("../utils/parseUtils");
// const MOZ_SourceMap = require("source-map");

const {isMethodCall} = require("../utils/ASTUtils");
const ModuleName = require("../utils/ModuleName");
const UI5ClientConstants = require("../UI5ClientConstants");
const escapePropertiesFile = require("../utils/escapePropertiesFile");

const BundleResolver = require("./Resolver");
const BundleSplitter = require("./AutoSplitter");
const {SectionType} = require("./BundleDefinition");
const BundleWriter = require("./BundleWriter");
const log = require("@ui5/logger").getLogger("lbt:bundle:Builder");

const copyrightCommentsPattern = /copyright|\(c\)(?:[0-9]+|\s+[0-9A-za-z])|released under|license|\u00a9|^@ui5-bundle-raw-include |^@ui5-bundle /i;
const xmlHtmlPrePattern = /<(?:\w+:)?pre\b/;

const strReplacements = {
	"\r": "\\r",
	"\t": "\\t",
	"\n": "\\n",
	"'": "\\'",
	"\\": "\\\\"
};

function makeStringLiteral(str) {
	return "'" + String(str).replace(/['\r\n\t\\]/g, function(char) {
		return strReplacements[char];
	}) + "'";
}

function isEmptyBundle(resolvedBundle) {
	return resolvedBundle.sections.every((section) => section.modules.length === 0);
}

const UI5BundleFormat = {
	beforePreloads(outW, section) {
		outW.write(`jQuery.sap.registerPreloadedModules(`);
		outW.writeln(`{`);
		if ( section.name ) {
			outW.writeln(`"name":"${section.name}",`);
		}
		outW.writeln(`"version":"2.0",`);
		outW.writeln(`"modules":{`);
	},

	afterPreloads(outW, section) {
		outW.writeln(`}});`);
	},

	beforeBundleInfo(outW) {
		outW.writeln("\"unsupported\"; /* 'bundleInfo' section mode not supported (requires ui5loader)");
	},

	afterBundleInfo(outW) {
		outW.writeln("*/");
	},

	requireSync(outW, moduleName) {
		outW.writeln(`sap.ui.requireSync("${ModuleName.toRequireJSName(moduleName)}");`);
	},

	shouldDecorate(resolvedModule) {
		return resolvedModule.executes(UI5ClientConstants.MODULE__JQUERY_SAP_GLOBAL);
	}
};

const EVOBundleFormat = {
	beforePreloads(outW, section) {
		outW.writeln(`sap.ui.require.preload({`);
	},

	afterPreloads(outW, section) {
		outW.write(`}`);
		if ( section.name ) {
			outW.write(`,"${section.name}"`);
		}
		outW.writeln(`);`);
	},

	beforeBundleInfo(outW) {
		outW.writeln("sap.ui.loader.config({bundlesUI5:{");
	},

	afterBundleInfo(outW) {
		outW.writeln("}});");
	},

	requireSync(outW, moduleName) {
		outW.writeln(`sap.ui.requireSync("${ModuleName.toRequireJSName(moduleName)}");`);
	},

	shouldDecorate(resolvedModule) {
		return resolvedModule.executes(UI5ClientConstants.MODULE__UI5LOADER) ||
			resolvedModule.executes(UI5ClientConstants.MODULE__UI5LOADER_AUTOCONFIG) ||
			resolvedModule.executes(UI5ClientConstants.MODULE__JQUERY_SAP_GLOBAL) ||
			resolvedModule.executes(UI5ClientConstants.MODULE__SAP_UI_CORE_CORE);
	}
};

class BundleBuilder {
	constructor(pool) {
		this.pool = pool;
		this.resolver = new BundleResolver(pool);
		this.splitter = new BundleSplitter(pool, this.resolver);
		this.targetBundleFormat = null;
	}

	async createBundle(module, options) {
		await this._prepare();
		if ( options.numberOfParts > 1 ) {
			const bundleInfos = [];
			const submodules = await this.splitter.run( module, options );
			for ( const submodule of submodules ) {
				bundleInfos.push( await this._createBundle(submodule, options) );
			}
			return bundleInfos;
		} else {
			return this._createBundle(module, options);
		}
	}

	_prepare() {
		return Promise.all([
			// check whether the resource pool contains debug and optimized sources
			this.pool.findResource( ModuleName.getDebugName(UI5ClientConstants.MODULE__JQUERY_SAP_GLOBAL) ).
				then( () => this.optimizedSources = true, () => this.optimizedSources = false ),
			// check whether EVO modules are available. If so, use EVO APIs, else use old UI5 APIs.
			this.pool.findResource(UI5ClientConstants.EVO_MARKER_RESOURCE).
				then( () => this.targetBundleFormat = EVOBundleFormat, () => this.targetBundleFormat = UI5BundleFormat )
		]);
	}

	async _createBundle(module, options) {
		const resolvedModule = await this.resolver.resolve(module);
		if ( options.skipIfEmpty && isEmptyBundle(resolvedModule) ) {
			log.verbose("  skipping empty bundle " + module.name);
			return undefined;
		}
		log.verbose("  create '%s'", resolvedModule.name);

		this.options = options || {};
		this.optimize = !!this.options.optimize;

		// when decorateBootstrapModule is set to false, we don't write the optimized flag
		// and don't write the try catch wrapper
		this.shouldDecorate = this.options.decorateBootstrapModule &&
			(((this.optimizedSources && !this.options.debugMode) || this.optimize) &&
				this.targetBundleFormat.shouldDecorate(resolvedModule));
		// TODO is the following condition ok or should the availability of jquery.sap.global.js be configurable?
		this.jqglobalAvailable = !resolvedModule.containsGlobal;
		this.openModule(resolvedModule.name);
		let bundleInfos = [];
		// create all sections in sequence
		for ( const section of resolvedModule.sections ) {
			log.verbose("    adding section%s of type %s",
				section.name ? " '" + section.name + "'" : "", section.mode);
			if ( section.mode === SectionType.BundleInfo ) {
				bundleInfos.push(section);
			} else {
				if ( bundleInfos.length > 0 ) {
					await this.writeBundleInfos(bundleInfos);
					bundleInfos = [];
				}
				await this.addSection(section);
			}
		}
		if ( bundleInfos.length > 0 ) {
			await this.writeBundleInfos(bundleInfos);
			bundleInfos = [];
		}

		this.closeModule(resolvedModule);

		const bundleInfo = await resolvedModule.createModuleInfo(this.pool);
		bundleInfo.size = this.outW.length;

		return {
			name: module.name,
			content: this.outW.toString(),
			bundleInfo: bundleInfo
		};
	}

	openModule(module) {
		this.outW = new BundleWriter();
		this.missingRawDeclarations = [];

		this.outW.writeln("//@ui5-bundle " + module);
		if ( this.shouldDecorate ) {
			this.outW.writeln(`window["sap-ui-optimized"] = true;`);
			if ( this.options.addTryCatchRestartWrapper ) {
				this.outW.writeln(`try {`);
			}
		}
	}

	closeModule(resolvedModule) {
		if ( resolvedModule.containsCore ) {
			this.outW.ensureNewLine(); // for clarity and to avoid issues with single line comments
			this.outW.writeln(`// as this module contains the Core, we ensure that the Core has been booted`);
			this.outW.writeln(`sap.ui.getCore().boot && sap.ui.getCore().boot();`);
		}
		if ( this.shouldDecorate && this.options.addTryCatchRestartWrapper ) {
			this.outW.ensureNewLine(); // for clarity and to avoid issues with single line comments
			this.outW.writeln(`} catch(oError) {`);
			this.outW.writeln(`if (oError.name != "Restart") { throw oError; }`);
			this.outW.writeln(`}`);
		}
		/* NODE-TODO
		if ( writeSourceMap && writeSourceMapAnnotation ) {
			outW.ensureNewLine();
			outW.write("//# sourceMappingURL=" + moduleName.getBaseName().replaceFirst("\\.js$", ".js.map"));
		}*/
	}

	addSection(section) {
		this.ensureRawDeclarations();

		switch (section.mode) {
		case SectionType.Provided:
			// do nothing
			return undefined; // nothing to wait for
		case SectionType.Raw:
			return this.writeRaw(section);
		case SectionType.Preload:
			return this.writePreloadFunction(section);
		case SectionType.BundleInfo:
			return this.writeBundleInfos([section]);
		case SectionType.Require:
			return this.writeRequires(section);
		default:
			throw new Error("unknown section mode " + section.mode);
		}
	}

	ensureRawDeclarations() {
		if ( this.missingRawDeclarations.length && this.jqglobalAvailable ) {
			this.outW.ensureNewLine(); // for clarity and to avoid issues with single line comments
			/* NODE-TODO, moduleName is not defined
				It should contain the name of the module which is currently build (1st parameter of _createBundle).
				But when the ui5loader is present, declareRawModules should be forced to false anyhow.
			this.outW.writeln("jQuery.sap.declare('", ModuleName.toUI5LegacyName(moduleName), "');");
			*/
			this.missingRawDeclarations.forEach( (module) => {
				// 2nd parameter set to 'false': do not create namespaces - they nevertheless would come too late
				this.outW.writeln(`jQuery.sap.declare('${ModuleName.toUI5LegacyName(module)}', false);`);
			});
			this.missingRawDeclarations = [];
		}
	}

	// TODO check that there are only JS modules contained
	async writeRaw(section) {
		// write all modules in sequence
		for ( const module of section.modules ) {
			const resource = await this.pool.findResourceWithInfo(module);
			if ( resource != null ) {
				this.outW.startSegment(module);
				this.outW.ensureNewLine();
				this.outW.writeln("//@ui5-bundle-raw-include " + module);
				await this.writeRawModule(module, resource);
				const compressedSize = this.outW.endSegment();
				log.verbose("    %s (%d,%d)", module, resource.info != null ? resource.info.size : -1, compressedSize);
				if ( section.declareRawModules ) {
					this.missingRawDeclarations.push(module);
				}
				if ( module === UI5ClientConstants.MODULE__JQUERY_SAP_GLOBAL ) {
					this.jqglobalAvailable = true;
				}
			} else {
				log.error("    couldn't find %s", module);
			}
		}
	}

	async writeRawModule(module, resource) {
		let fileContent = await resource.buffer();
		if ( /\.js$/.test(module) ) {
			fileContent = await this.compressJS( fileContent, resource );
		}
		this.outW.ensureNewLine();
		this.outW.write( fileContent );
	}

	async writePreloadFunction(section) {
		const outW = this.outW;

		outW.ensureNewLine();

		const sequence = section.modules.slice();

		this.beforeWriteFunctionPreloadSection(sequence);

		await this.rewriteAMDModules(sequence);
		if ( sequence.length > 0 ) {
			this.targetBundleFormat.beforePreloads(outW, section);
			let i = 0;
			for ( const module of sequence ) {
				const resource = await this.pool.findResourceWithInfo(module);
				if ( resource != null ) {
					if ( i>0 ) {
						outW.writeln(",");
					}
					this.beforeWritePreloadModule(module, resource.info, resource);
					outW.write(`\t"${module.toString()}":`);
					outW.startSegment(module);
					await this.writePreloadModule(module, resource.info, resource);
					const compressedSize = outW.endSegment();
					log.verbose("    %s (%d,%d)", module,
						resource.info != null ? resource.info.size : -1, compressedSize);
					i++;
				} else {
					log.error("    couldn't find %s", module);
				}
			}

			if ( i > 0 ) {
				outW.writeln();
			}
			this.targetBundleFormat.afterPreloads(outW, section);
		}

		// this.afterWriteFunctionPreloadSection();
	}

	async compressJS(fileContent, resource) {
		if ( this.optimize ) {
			const result = await terser.minify({
				[resource.name]: String(fileContent)
			}, {
				compress: false, // TODO configure?
				output: {
					comments: copyrightCommentsPattern,
					wrap_func_args: false
				}
				// , outFileName: resource.name
				// , outSourceMap: true
			});
			// console.log(result.map);
			// const map = new MOZ_SourceMap.SourceMapConsumer(result.map);
			// map.eachMapping(function (m) { console.log(m); }); // console.log(map);
			fileContent = result.code;
			// throw new Error();
		}
		return fileContent;
	}

	beforeWriteFunctionPreloadSection(sequence) {
		// simple version: just sort alphabetically
		sequence.sort();
	}

	async rewriteAMDModules(sequence) {
		if ( this.options.usePredefineCalls ) {
			const outW = this.outW;

			const remaining = [];
			for ( const module of sequence ) {
				if ( /\.js$/.test(module) ) {
					// console.log("Processing " + module);
					const resource = await this.pool.findResourceWithInfo(module);
					let code = await resource.buffer();
					code = rewriteDefine(this.targetBundleFormat, code, module);
					if ( code ) {
						outW.startSegment(module);
						outW.ensureNewLine();
						const fileContent = await this.compressJS(code, resource);
						outW.write( fileContent );
						outW.ensureNewLine();
						const compressedSize = outW.endSegment();
						log.verbose("    %s (%d,%d)", module,
							resource.info != null ? resource.info.size : -1, compressedSize);
					} else {
						// keep unprocessed modules
						remaining.push(module);
					}
				} else {
					// keep unprocessed modules
					remaining.push(module);
				}
			}

			Array.prototype.splice.apply(sequence, [0, sequence.length].concat(remaining));
		}
	}

	afterWriteFunctionPreloadSection() {
	}

	beforeWritePreloadModule(module, info, resource) {
	}

	/**
	 *
	 * @param {string} module module name
	 * @param {ModuleInfo} info
	 * @param {module:@ui5/fs.Resource} resource
	 * @returns {Promise<boolean>}
	 */
	async writePreloadModule(module, info, resource) {
		const outW = this.outW;

		if ( /\.js$/.test(module) && (info == null || !info.requiresTopLevelScope) ) {
			const compressedContent = await this.compressJS( await resource.buffer(), resource );
			outW.write(`function(){`);
			outW.write( compressedContent );
			this.exportGlobalNames(info);
			outW.ensureNewLine();
			outW.write(`}`);
		} else if ( /\.js$/.test(module) /* implicitly: && info != null && info.requiresTopLevelScope */ ) {
			log.warn("**** warning: module %s requires top level scope" +
					" and can only be embedded as a string (requires 'eval')", module);
			const compressedContent = await this.compressJS( await resource.buffer(), resource );
			outW.write( makeStringLiteral( compressedContent ) );
		} else if ( /\.html$/.test(module) ) {
			const fileContent = await resource.buffer();
			outW.write( makeStringLiteral( fileContent ) );
		} else if ( /\.json$/.test(module) ) {
			let fileContent = await resource.buffer();
			if ( this.optimize ) {
				try {
					fileContent = JSON.stringify( JSON.parse( fileContent) );
				} catch (e) {
					log.verbose("Failed to parse JSON file %s. Ignoring error, skipping compression.", module);
					log.verbose(e);
				}
			}
			outW.write(makeStringLiteral(fileContent));
		} else if ( /\.xml$/.test(module) ) {
			let fileContent = await resource.buffer();
			if ( this.optimize ) {
				// For XML we use the pretty data
				// Do not minify if XML(View) contains an <*:pre> tag,
				// because whitespace of HTML <pre> should be preserved (should only happen rarely)
				if (!xmlHtmlPrePattern.test(fileContent.toString())) {
					fileContent = pd.xmlmin(fileContent.toString(), false);
				}
			}
			outW.write( makeStringLiteral( fileContent ) );
		} else if ( /\.properties$/.test(module) ) {
			// Since the Builder is also used when building non-project resources (e.g. dependencies)
			// *.properties files should be escaped if encoding option is specified
			const fileContent = await escapePropertiesFile(resource);

			outW.write( makeStringLiteral( fileContent ) );
		} else {
			log.error("don't know how to embed module " + module); // TODO throw?
		}

		return true;
	}

	/**
	 * Create exports for globals
	 *
	 * @param {ModuleInfo} info
	 */
	exportGlobalNames(info) {
		if ( !info || !info.exposedGlobals || !info.exposedGlobals.length ) {
			return;
		}
		this.outW.ensureNewLine();
		info.exposedGlobals.forEach( (globalName) => {
			// Note: globalName can be assumed to be a valid identifier as it is used as variable name anyhow
			this.outW.writeln(`this.${globalName}=${globalName};`);
		});
	}

	writeBundleInfos(sections) {
		this.outW.ensureNewLine();

		if ( sections.length > 0 ) {
			this.targetBundleFormat.beforeBundleInfo(this.outW);
			sections.forEach((section, idx) => {
				if ( idx > 0 ) {
					this.outW.writeln(",");
				}

				if (!section.name) {
					throw new Error(`A 'bundleInfo' section is missing the mandatory 'name' property.` );
				}
				if (!path.extname(section.name)) {
					log.warn(`bundleInfo section name '${section.name}' is missing a file extension. ` +
						`The info might not work as expected. ` +
						`The name must match the bundle filename (incl. extension such as '.js')`);
				}
				this.outW.write(`"${section.name}":[${section.modules.map(makeStringLiteral).join(",")}]`);
			});
			this.outW.writeln();
			this.targetBundleFormat.afterBundleInfo(this.outW);
		}
	}

	writeRequires(section) {
		this.outW.ensureNewLine();
		section.modules.forEach( (module) => {
			this.targetBundleFormat.requireSync(this.outW, module);
		});
	}
}

const CALL_SAP_UI_DEFINE = ["sap", "ui", "define"];

function rewriteDefine(targetBundleFormat, code, moduleName) {
	let ast;
	const codeStr = code.toString();
	try {
		ast = parseJS(codeStr, {range: true});
	} catch (e) {
		log.error("error while parsing %s: %s", moduleName, e.message);
		return;
	}

	if ( ast.type === Syntax.Program &&
			ast.body.length === 1 && ast.body[0].type === Syntax.ExpressionStatement &&
			isMethodCall(ast.body[0].expression, CALL_SAP_UI_DEFINE) ) {
		const changes = [];
		const defineCall = ast.body[0].expression;


		// Inject module name if missing
		if ( defineCall.arguments.length == 0 ||
			defineCall.arguments[0].type !== Syntax.Literal ) {
			let value = `"${ModuleName.toRequireJSName(moduleName)}"`;
			let index;

			if (defineCall.arguments.length == 0) {
				// asterisk marks the index: sap.ui.define(*)
				index = defineCall.range[1] - 1;
			} else {
				// asterisk marks the index: sap.ui.define(*argument1)
				index = defineCall.arguments[0].range[0];
				value += ", ";
			}

			changes.push({
				index,
				count: 0,
				value
			});
		}

		// rewrite sap.ui.define to sap.ui.predefine
		if ( defineCall.callee.type === Syntax.MemberExpression &&
				defineCall.callee.property.type === Syntax.Identifier &&
				defineCall.callee.property.name === "define" ) {
			changes.push({
				// asterisk marks the index: sap.ui.*define()
				index: defineCall.callee.property.range[0],
				count: 0,
				value: "pre"
			});
		}

		return applyChanges(codeStr, changes);
	}

	return false;
}

function applyChanges(string, changes) {
	// No sorting needed as changes are added in correct order

	const array = Array.from(string);
	changes.forEach((change) => {
		array.splice(
			change.index,
			change.count,
			change.value
		);
	});
	return array.join("");
}

module.exports = BundleBuilder;
