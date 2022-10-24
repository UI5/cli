
import {MODULE__JQUERY_SAP_GLOBAL, MODULE__SAP_UI_CORE_CORE} from "../UI5ClientConstants.js";
import ModuleInfo from "../resources/ModuleInfo.js";
import {SectionType} from "./BundleDefinition.js";

class ResolvedBundleDefinition {
	constructor( bundleDefinition /* , vars*/) {
		this.bundleDefinition = bundleDefinition;
		this.name = bundleDefinition.name;
		// NODE-TODO (ModuleName) ModuleNamePattern.resolvePlaceholders(bundleDefinition.getName(), vars);
		this.sections = bundleDefinition.sections.map(
			(sectionDefinition) => new ResolvedSection(this, sectionDefinition)
		);
	}

	get containsCore() {
		return this.sections.some(
			(section) =>
				(section.mode === SectionType.Raw || section.mode === SectionType.Require) &&
				section.modules.some((module) => module === MODULE__SAP_UI_CORE_CORE)
		);
	}

	get containsGlobal() {
		return this.sections.some(
			(section) =>
				section.mode === SectionType.Raw &&
				section.modules.some((module) => module === MODULE__JQUERY_SAP_GLOBAL)
		);
	}

	executes(moduleName) {
		return this.sections.some(
			(section) =>
				(section.mode === SectionType.Raw || section.mode === SectionType.Require) &&
				section.modules.some((module) => module === moduleName)
		);
	}

	createModuleInfo(pool) {
		const bundleInfo = new ModuleInfo();
		bundleInfo.name = this.name;

		let promise = Promise.resolve(true);
		this.sections.forEach( (section) => {
			promise = promise.then( () => {
				if ( section.mode === SectionType.Provided ) {
					return;
				}
				if ( section.mode === SectionType.Require ) {
					section.modules.forEach( (module) => bundleInfo.addDependency(module) );
					return;
				}
				if ( section.mode == SectionType.Raw && section.modules.length ) {
					// if a bundle contains raw modules, it is a raw module itself
					bundleInfo.rawModule = true;
				}
				let modules = section.modules;
				if ( section.mode === SectionType.Preload ) {
					modules = section.modules.slice();
					modules.sort();
				}

				return Promise.all(
					modules.map( (submodule) => {
						return pool.getModuleInfo(submodule).then(
							(subinfo) => bundleInfo.addSubModule(subinfo)
						);
					})
				);
			});
		});

		return promise.then( () => bundleInfo );
	}

/*
		public JSModuleDefinition getDefinition() {
			return moduleDefinition;
		}

		public Configuration getConfiguration() {
			return moduleDefinition.getConfiguration();
		}


	}
	*/
}

class ResolvedSection {
	constructor(bundle, sectionDefinition) {
		this.bundle = bundle;
		this.sectionDefinition = sectionDefinition;
	}

	get mode() {
		return this.sectionDefinition.mode;
	}

	get name() {
		return this.sectionDefinition.name;
	}

	get declareRawModules() {
		return this.sectionDefinition.declareRawModules;
	}
}

export default ResolvedBundleDefinition;
