
import xml2js from "xml2js";
import {fromUI5LegacyName, fromRequireJSName} from "../utils/ModuleName.js";
import JSTokenizer from "../utils/JSTokenizer.js";
import {getLogger} from "@ui5/logger";
const log = getLogger("lbt:analyzer:XMLTemplateAnalyzer");

// ---------------------------------------------------------------------------------------------------------

/*
 * TODOS
 * - find better way to distinguish between aggregation tags and control tags
 *   (currently, existence in pool is used to recognize controls)
 * - support alternative namespace URLs for libraries (as used by XSD files)
 * - make set of view types configurable
 * - plugin mechanism to support other special controls
 * - move UI5 specific constants to UI5ClientConstants?
 */

// ---------------------------------------------------------------------------------------------------------

const XHTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const TEMPLATING_NAMESPACE = "http://schemas.sap.com/sapui5/extension/sap.ui.core.template/1";
const TEMPLATING_CONDITONAL_TAGS = /^(?:if|repeat)$/;

const PATTERN_LIBRARY_NAMESPACES = /^([a-zA-Z_$][a-zA-Z0-9_$]*(\.[a-zA-Z_$][a-zA-Z0-9_$]*)*)$/;

// component container
const COMPONENTCONTAINER_MODULE = "sap/ui/core/ComponentContainer.js";
const COMPONENTCONTAINER_COMPONENTNAME_ATTRIBUTE = "name";

// fragment definition
const FRAGMENTDEFINITION_MODULE = "sap/ui/core/FragmentDefinition.js";

// fragment
const FRAGMENT_MODULE = "sap/ui/core/Fragment.js";
const FRAGMENT_FRAGMENTNAME_ATTRIBUTE = "fragmentName";
const FRAGMENT_TYPE_ATTRIBUTE = "type";

// different view types
const VIEW_MODULE = "sap/ui/core/mvc/View.js";
const HTMLVIEW_MODULE = "sap/ui/core/mvc/HTMLView.js";
const JSVIEW_MODULE = "sap/ui/core/mvc/JSView.js";
const JSONVIEW_MODULE = "sap/ui/core/mvc/JSONView.js";
const XMLVIEW_MODULE = "sap/ui/core/mvc/XMLView.js";
const TEMPLATEVIEW_MODULE = "sap/ui/core/mvc/TemplateView.js";
const ANYVIEW_VIEWNAME_ATTRIBUTE = "viewName";
const XMLVIEW_CONTROLLERNAME_ATTRIBUTE = "controllerName";
const XMLVIEW_RESBUNDLENAME_ATTRIBUTE = "resourceBundleName";
const XMLVIEW_CORE_REQUIRE_ATTRIBUTE_NS = {
	uri: "sap.ui.core",
	local: "require"
};
const VIEW_TYPE_ATTRIBUTE = "type";

/*
 * Helper to simplify access to node attributes.
 */
function getAttribute(node, attr) {
	return (node.$ && node.$[attr] && node.$[attr].value) || null;
}
function getAttributeNS(node, attrNS) {
	const attr = Object.values(node.$ || []).find((n) => {
		return n.uri === attrNS.uri && n.local === attrNS.local;
	});
	return (attr && attr.value) || null;
}

/**
 * A dependency analyzer for XMLViews and XMLFragments.
 *
 * Parses the XML, collects controls and adds them as dependency to the ModuleInfo object.
 * Additionally, some special dependencies are handled:
 * <ul>
 * <li>controller of the view</li>
 * <li>resource bundle (note: locale dependent dependencies can't be modeled yet in ModuleInfo</li>
 * <li>component referenced via ComponentContainer control</li>
 * <li>embedded fragments or views</li>
 * </ul>
 *
 * In an XMLView, there usually exist 3 categories of element nodes: controls, aggregations
 * of cardinality 'multiple' and non-UI5 nodes (e.g. XHTML or SVG). The third category usually
 * can be identified by its namespace. To distinguish between the first and the second
 * category, this analyzer uses a ResourcePool (provided by the caller and usually derived from the
 * library classpath). When the qualified node name is contained in the pool, it is assumed to
 * represent a control, otherwise it is ignored.
 *
 * In certain cases this might give wrong results, but loading the metadata for each control
 * to implement the exactly same logic as used in the runtime XMLTemplateProcessor would be to
 * expensive and require too much runtime.
 *
 * @author Frank Weigel
 * @since 1.23.0
 * @private
 */
class XMLTemplateAnalyzer {
	constructor(pool) {
		this._pool = pool;
		this._parser = new xml2js.Parser({
			explicitRoot: false,
			explicitChildren: true,
			preserveChildrenOrder: true,
			xmlns: true
		});
		this.busy = false;
	}

	/**
	 * Add a dependency if it is new.
	 *
	 * @param {string} moduleName
	 * @param {boolean} conditional
	 */
	_addDependency(moduleName, conditional) {
		// don't add references to 'self'
		if ( this.info.name === moduleName ) {
			return;
		}

		// don't add properties with data binding syntax
		if (moduleName.includes("{") || moduleName.includes("}")) {
			return;
		}

		this.info.addDependency(moduleName, conditional);
	}

	/**
	 * Enrich the given ModuleInfo for an XMLView.
	 *
	 * @param {string} xml xml string to be analyzed
	 * @param {ModuleInfo} info ModuleInfo to enrich
	 * @returns {Promise<ModuleInfo>} the created ModuleInfo
	 */
	analyzeView(xml, info) {
		return this._analyze(xml, info, false);
	}

	/**
	 * Enrich the given ModuleInfo for a fragment (XML).
	 *
	 * @param {string} xml xml string to be analyzed
	 * @param {ModuleInfo} info ModuleInfo to enrich
	 * @returns {Promise<ModuleInfo>} the created ModuleInfo
	 */
	analyzeFragment(xml, info) {
		return this._analyze(xml, info, true);
	}

	_analyze(xml, info, isFragment) {
		if ( this.busy ) {
			// TODO delegate to fresh instances instead
			throw new Error("XMLTemplateAnalyzer is unexpectedly busy");
		}

		this.info = info;
		this.conditional = false;
		this.templateTag = false;
		this.promises = [];
		this.busy = true;

		return new Promise( (resolve, reject) => {
			this._parser.parseString(xml, (err, result) => {
				// parse error
				if ( err ) {
					this.busy = false;
					reject(new Error(`Error while parsing XML document ${info.name}: ${err.message}`));
					return;
				}

				if ( !result ) {
					// Handle empty xml views/fragments
					reject(new Error("Invalid empty XML document: " + info.name));
					return;
				}

				// console.log(result);
				// clear();
				if ( isFragment ) {
					// all fragments implicitly depend on the fragment class
					this.info.addImplicitDependency(FRAGMENT_MODULE);
					this._analyzeNode(result);
				} else {
					// views require a special handling of the root node
					this._analyzeViewRootNode(result);
				}

				Promise.all(this.promises).then( () => {
					this.busy = false;
					resolve(info);
				});
				// console.log("Collected info for %s:", info.name, info);
			});
		});
	}

	_analyzeViewRootNode(node) {
		this.info.addImplicitDependency(XMLVIEW_MODULE);

		const controllerName = getAttribute(node, XMLVIEW_CONTROLLERNAME_ATTRIBUTE);
		if ( controllerName ) {
			this._addDependency( fromUI5LegacyName(controllerName, ".controller.js"), this.conditional );
		}

		const resourceBundleName = getAttribute(node, XMLVIEW_RESBUNDLENAME_ATTRIBUTE);
		if ( resourceBundleName ) {
			const resourceBundleModuleName = fromUI5LegacyName(resourceBundleName, ".properties");
			log.verbose(`Found dependency to resource bundle ${resourceBundleModuleName}`);
			// TODO locale dependent dependencies: this._addDependency(resourceBundleModuleName);
			this._addDependency( resourceBundleModuleName, this.conditional );
		}

		this._analyzeCoreRequire(node);

		this._analyzeChildren(node);
	}

	_analyzeNode(node) {
		const namespace = node.$ns.uri || "";
		const localName = node.$ns.local;

		const oldConditional = this.conditional;
		const oldTemplateTag = this.templateTag;

		if ( namespace === TEMPLATING_NAMESPACE ) {
			if ( TEMPLATING_CONDITONAL_TAGS.test(localName) ) {
				this.conditional = true;
			}
			this.templateTag = true;
		} else if ( namespace === XHTML_NAMESPACE || namespace === SVG_NAMESPACE ) {

			// ignore XHTML and SVG nodes

		} else if ( PATTERN_LIBRARY_NAMESPACES.test(namespace) ) {
			// looks like a UI5 library or package name
			const moduleName = fromUI5LegacyName( (namespace ? namespace + "." : "") + localName );

			this._analyzeCoreRequire(node);

			// ignore FragmentDefinition (also skipped by runtime XMLTemplateProcessor)
			if ( FRAGMENTDEFINITION_MODULE !== moduleName ) {
				this.promises.push(this._analyzeModuleDependency(node, moduleName, this.conditional));
			}
		}

		this._analyzeChildren(node);

		// restore conditional and templateTag state of the outer block
		this.conditional = oldConditional;
		this.templateTag = oldTemplateTag;
	}

	_analyzeChildren(node) {
		if ( Array.isArray(node.$$) ) {
			node.$$.forEach( (child) => {
				return this._analyzeNode( child);
			});
		}
	}

	_analyzeCoreRequire(node) {
		const coreRequire = getAttributeNS(node, XMLVIEW_CORE_REQUIRE_ATTRIBUTE_NS);
		let requireContext;
		if ( coreRequire ) {
			// expression binding syntax within coreRequire and a template parent node
			// These expressions cannot be parsed using parseJS and if within a template tag
			// represent an expression binding which needs to be evaluated before analysis
			// e.g. "{= '{Handler: \'' + ${myActions > handlerModule} + '\'}'}"
			if ((coreRequire.startsWith("{=") || coreRequire.startsWith("{:=")) && this.templateTag) {
				log.verbose(
					`Ignoring core:require: '${coreRequire}' on Node ${node.$ns.uri}:${node.$ns.local} contains ` +
					`an expression binding and is within a 'template' Node`
				);
				return;
			}

			try {
				requireContext = JSTokenizer.parseJS(coreRequire);
			} catch (e) {
				log.error(
					`Ignoring core:require: '${coreRequire}' can't be parsed on Node ` +
					`${node.$ns.uri}:${node.$ns.local}: ${e.message}`
				);
				log.verbose(e.stack);
			}
			if ( requireContext ) {
				Object.keys(requireContext).forEach((key) => {
					const requireJsName = requireContext[key];
					if ( requireJsName && typeof requireJsName === "string" ) {
						this._addDependency(fromRequireJSName(requireJsName), this.conditional);
					} else {
						log.error(`Ignoring core:require: '${key}' refers to invalid module name '${requireJsName}'`);
					}
				});
			}
		}
	}

	async _analyzeModuleDependency(node, moduleName, conditional) {
		try {
			await this._pool.findResource(moduleName);

			this._addDependency(moduleName, conditional);

			// handle special controls that reference other entities via name
			// - (HTML|JS|JSON|XML)View reference another view by 'viewName'
			// - ComponentContainer reference another component by 'componentName'
			// - Fragment references a fragment by 'fragmentName' . 'type'

			if ( moduleName === COMPONENTCONTAINER_MODULE ) {
				const componentName = getAttribute(node, COMPONENTCONTAINER_COMPONENTNAME_ATTRIBUTE);
				if ( componentName ) {
					const componentModuleName =
						fromUI5LegacyName( componentName, "/Component.js" );
					this._addDependency(componentModuleName, conditional);
				}
				// TODO what about component.json? handle it transitively via Component.js?
			} else if ( moduleName === FRAGMENT_MODULE ) {
				const fragmentName = getAttribute(node, FRAGMENT_FRAGMENTNAME_ATTRIBUTE);
				const type = getAttribute(node, FRAGMENT_TYPE_ATTRIBUTE);
				if ( fragmentName && type ) {
					const fragmentModuleName =
						fromUI5LegacyName( fragmentName, this._getFragmentExtension(type) );
					// console.log("child fragment detected %s", fragmentModuleName);
					this._addDependency(fragmentModuleName, conditional);
				}
			} else if ( moduleName === HTMLVIEW_MODULE ) {
				const viewName = getAttribute(node, ANYVIEW_VIEWNAME_ATTRIBUTE);
				if ( viewName ) {
					const childViewModuleName = fromUI5LegacyName( viewName, ".view.html" );
					// console.log("child view detected %s", childViewModuleName);
					this._addDependency(childViewModuleName, conditional);
				}
			} else if ( moduleName === JSVIEW_MODULE ) {
				const viewName = getAttribute(node, ANYVIEW_VIEWNAME_ATTRIBUTE);
				if ( viewName ) {
					const childViewModuleName = fromUI5LegacyName( viewName, ".view.js" );
					// console.log("child view detected %s", childViewModuleName);
					this._addDependency(childViewModuleName, conditional);
				}
			} else if ( moduleName === JSONVIEW_MODULE ) {
				const viewName = getAttribute(node, ANYVIEW_VIEWNAME_ATTRIBUTE);
				if ( viewName ) {
					const childViewModuleName = fromUI5LegacyName( viewName, ".view.json" );
					// console.log("child view detected %s", childViewModuleName);
					this._addDependency(childViewModuleName, conditional);
				}
			} else if ( moduleName === XMLVIEW_MODULE ) {
				const viewName = getAttribute(node, ANYVIEW_VIEWNAME_ATTRIBUTE);
				if ( viewName ) {
					const childViewModuleName = fromUI5LegacyName( viewName, ".view.xml" );
					// console.log("child view detected %s", childViewModuleName);
					this._addDependency(childViewModuleName, conditional);
				}
			} else if ( moduleName === TEMPLATEVIEW_MODULE ) {
				const viewName = getAttribute(node, ANYVIEW_VIEWNAME_ATTRIBUTE);
				if ( viewName ) {
					const childViewModuleName = fromUI5LegacyName( viewName, ".view.tmpl" );
					// console.log("child view detected %s", childViewModuleName);
					this._addDependency(childViewModuleName, conditional);
				}
			} else if ( moduleName === VIEW_MODULE ) {
				const viewName = getAttribute(node, ANYVIEW_VIEWNAME_ATTRIBUTE);
				if ( viewName ) {
					let childViewModuleName;

					if (viewName.startsWith("module:")) {
						childViewModuleName = viewName.slice("module:".length) + ".js";
					} else {
						const viewType = getAttribute(node, VIEW_TYPE_ATTRIBUTE);

						let viewTypeExtension;

						switch (viewType) {
						case "JS":
							viewTypeExtension = ".view.js";
							break;
						case "JSON":
							viewTypeExtension = ".view.json";
							break;
						case "Template":
							viewTypeExtension = ".view.tmpl";
							break;
						case "XML":
							viewTypeExtension = ".view.xml";
							break;
						case "HTML":
							viewTypeExtension = ".view.html";
							break;
						default:
							log.warn(`Unable to analyze sap.ui5/rootView: Unknown type '${viewType}'`);
						}

						if (viewTypeExtension) {
							childViewModuleName = fromUI5LegacyName(viewName, viewTypeExtension);
						}
					}
					if (childViewModuleName) {
						// console.log("child view detected %s", childViewModuleName);
						this._addDependency(childViewModuleName, conditional);
					}
				}
			}
		} catch (err) {
			// ignore missing resources
			// console.warn( "node not found %s", moduleName);
		}
	}

	_getFragmentExtension(type) {
		return ".fragment." + type.toLowerCase();
	}
}


export default XMLTemplateAnalyzer;
