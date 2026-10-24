- Start Date: 2022-04-15
- RFC PR: [#612](https://github.com/SAP/ui5-tooling/pull/612)
- Issue: *none*
- Affected components <!-- Check affected components by writing an "X" into the brackets -->
    + [x] [ui5-builder](https://github.com/SAP/ui5-builder)
    + [ ] [ui5-server](https://github.com/SAP/ui5-server)
    + [ ] [ui5-cli](https://github.com/SAP/ui5-cli)
    + [ ] [ui5-fs](https://github.com/SAP/ui5-fs)
    + [x] [ui5-project](https://github.com/SAP/ui5-project)
    + [ ] [ui5-logger](https://github.com/SAP/ui5-logger)


# RFC 0011 Reuse Build Results

## Summary
When building a project, it should be possible to consume build results of dependencies in order to not having to build them again.

Based on the requested build, UI5 Tooling should be able to identify which dependencies are required to be built. It should also be able to determine whether a provided build result of a dependency can be used, or whether a new build is required.

**To be checked:** Would it be necessary/helpful if users/projects define a set of "build-time" dependencies which always have to be built? Or can UI5 Tooling determine this by itself from the set of provided dependencies?

Based on this concept, UI5 Tooling could implement a mechanism to cache build results automatically, transparently. This could then also be used by the ui5-server.

## Motivation

As described in [RFC 0010 UI5 Builder-Bundling Refactoring](https://github.com/SAP/ui5-tooling/blob/main/rfcs/0010-ui5-builder-bundling-refactoring.md#missing-minification-for-resources-from-dependencies):

> There is a gap in the minification process which causes a regression for some scenarios. JavaScript resources from other projects (dependencies) are not minified when not building the project with the `--all` flag. This is because the bundling task does not perform the minification but rather relies on this to be done by the minify task.
> 
> Requiring to always build a project with `--all` is not favorable due to performance reasons. Therefore, a solution is needed to still perform the needed minification steps for the mentioned resources.

To solve this, ui5-builder now detects which dependencies need to be built, before executing a project's build tasks. For this, every standard task can now define whether it requires access to dependencies or not. Custom task extensions can even specify *which* dependencies they need access to (also see [RFC 0012 UI5 Tooling Extension API v3 - 3. Tasks Requiring Dependencies](https://github.com/SAP/ui5-tooling/blob/rfc-ui5-tooling-extension-api-v3/rfcs/0012-UI5-Tooling-Extension-API-3.md#3-tasks-requiring-dependencies))

However, this implicit build of project dependencies still has a huge impact on the build time. Especially in cases where only the project itself should be built, it can now take many times longer. Therefore, we need to **optimize the cases where building dependencies is actually required**, and come up with **means to re-use previous build results**, removing the need to re-build all dependencies when making changes to only a few.

## Detailed design

### Reusable Build Results



#### Build Manifest

```json
{
	"project": {
		"specVersion": "2.3",
		"type": "library",
		"metadata": {
			"name": "library.e"
		},
		"resources": {
			"configuration": {
				"paths": {
					"src": "resources",
					"test": "test-resources"
				}
			}
		}
	},
	"buildManifest": {
		"manifestVersion": "0.1",
		"timestamp": "2022-05-06T09:54:29.051Z",
		"versions": {
			"builderVersion": "3.0.0",
			"projectVersion": "3.0.0",
			"fsVersion": "3.0.0"
		},
		"buildConfig": {
			"selfContained": false,
			"jsdoc": false,
			"includedTasks": [],
			"excludedTasks": []
		},
		"id": "library.e",
		"version": "1.0.0",
		"namespace": "library/e",
		"tags": {
			"/resources/library/e/some.js": {
				"ui5:HasDebugVariant": true
			},
			"/resources/library/e/some-dbg.js": {
				"ui5:IsDebugVariant": true
			}
		}
	}
}
```

In a first step, the creation of a build manifest shall be limited to projects of types `library` and `theme-library`, until use cases for other types arise.

### Tasks Requiring Dependencies

UI5 Tooling shall determine on a per-project level which dependencies need to be built before the project itself is built. This depends on the build-tasks that will be executed, and whether any of them require dependencies. If none of the tasks require dependencies, there is no need to build them. Unless of course the user explicitly requested a dependency to be part of the build output, e.g. by using the CLI parameters `--include-dependency` or `--include-all-dependencies`.

#### Standard Tasks

Task Name | Description | Type `application` | Type `library` | Type `theme-library`
--- | --- | :---: | :---: | :---:
generateVersionInfo | Requires manifest.json of dependencies in order to list them in the generated `sap-ui-version.json` | *Task Disabled* | - | -
generateResourcesJson | Requires (built) runtime resources of dependencies in order to list them in the generated `resources.json` | *Task Disabled* | - | -
generateJsdoc | Requires `designtime/api.json` of dependencies | - | *Task Disabled* | -
executeJsdocSdkTransformation | Requires `designtime/api.json` of dependencies | - | *Task Disabled* | -
generateApiIndex |  |  *Task Disabled* | - | - |
buildThemes | Requires theme resources of dependencies in order to build a library's theme. To be checked: Are the required resources already present in the dependency source? I.e. is it necessary to build them? | - | **Enabled by Default** | **Enabled by Default**
generateThemeDesignerResources | To read resources from sap.ui.core library. Possibly to resolve other Less imports? | - | *Task Disabled* | *Task Disabled*
*~generateLibraryManifest~* | *Dependency access removed with https://github.com/SAP/ui5-builder/pull/735* | - | *~Enabled by Default~* |
*~generateComponentPreload~* | *Dependency access removed with https://github.com/SAP/ui5-builder/pull/734* | *~Enabled by Default~* | *~Task Disabled~* | -
generateBundle | In case dependencies are bundled too | *Task Disabled* | *Task Disabled* | -
*~generateLibraryPreload~* | *Dependency access removed with https://github.com/SAP/ui5-builder/pull/734* | - | *~Enabled by Default~* | -
generateStandaloneAppBundle | Requires some dependency resources in order to create a self-contained bundle. *Note: `build --all` is already recommended for self-contained builds in order to generate required theme resources which are not part of the standalone app bundle* | *Task Disabled* | - | -

As you can see, for projects of type `application`, there is no default task that requires access to dependencies. Therefore, `application`-projects can be built without building any dependencies.

#### Custom Tasks

Custom Tasks may or may not require dependencies. [RFC 0012 UI5 Tooling Extension API v3, Chapter 3. Tasks Requiring Dependencies](https://github.com/SAP/ui5-tooling/blob/rfc-ui5-tooling-extension-api-v3/rfcs/0012-UI5-Tooling-Extension-API-3.md#3-tasks-requiring-dependencies) describes a concept, introduced in UI5 Tooling v3, which allows custom tasks to define which dependencies they require access to.



<!-- This is the bulk of the RFC. Explain the design in enough detail for somebody familiar with the UI5 Tooling to understand, and for somebody familiar with the implementation to implement. This should get into specifics and corner-cases, and include examples of how the feature is used. Any new terminology should be defined here. -->

## How we teach this

<!--
What names and terminology work best for these concepts and why? How is this idea best presented?

Would the acceptance of this proposal mean the UI5 Tooling or any of its subcomponents documentation must be re-organized or altered?

How should this feature be introduced and taught to existing UI5 Tooling users?
-->

## Drawbacks

<!--
Why should we not do this? Please consider the impact on teaching people to use the UI5 Tooling, on the integration of this feature with existing and planned features, on the impact of churn on existing users.

There are tradeoffs to choosing any path, please attempt to identify them here.
-->

## Alternatives

<!--
What other designs have been considered? What is the impact of not doing this?
-->

## Unresolved Questions and Bikeshedding

<!--
*This section should be removed (i.e. resolved) before merging*

Optional, but suggested for first drafts. What parts of the design are still TBD? Are there any second priority decisions left to be made?
-->

Currently none.
