
# ECMAScript Support

UI5 CLI offers general support for `ES2023` ECMAScript features. While a `ui5 build` is executed, UI5 CLI analyses a project's code. Depending on the project type, you have to consider some restrictions regarding the usage of certain ECMAScript syntax.

| UI5 CLI Version | Supported ECMAScript Version | Note |
|-------------------- |----------------------------- | ---- |
| v3.11+              | ECMAScript 2023              |      |
| v3.0+               | ECMAScript 2022              |      |
| v2.0+               | ECMAScript 2009/ES5          | Note that code up to ECMAScript 2020 can be parsed, however required code analysis might not work correctly for specific language features |

The following section describes all restrictions grouped by the kind of ECMAScript language feature. To get more insights into the code analysing executed by UI5 CLI check out [Code Analysis](./CodeAnalysis.md).

## Language Features with Restrictions

The following sections describe the restrictions grouped by the ECMAScript language feature.

### JavaScript modules

In general, UI5 CLI only analyzes **JavaScript** files of type `script`. [JavaScript Modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules) are not analyzed.

UI5 CLI and the UI5 Runtime does not support the usage of `export` and `import` of JavaScript Modules. Therefore, `sap.ui.define` has to be used.

=== "Supported"

    ```javascript
    sap.ui.define([
        "ModuleA",
        "ModuleB"
    ], function(ModuleA, ModuleB) {
        return ModuleA.extend("ModuleC", {});
    });
    ```

=== "Not Supported"

    ```javascript hl_lines="1 2 3"
    import ModuleA from "ModuleA";
    import ModuleB from "ModuleB";
    export default class ModuleC extends ModuleA {};
    ```

### Template Literal

[Template Literals](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals) without an expressions can be used in all places where string literals can be used. However, since UI5 CLI will attempt a static code analysis for certain calls to UI5 API, Template Literals with one or more expressions (e.g. `Hello ${planets[2]}`) can't be used in the scenarios described below.

#### Template Literal in `sap.ui.define` or `sap.ui.require`

Template Literals with one or more expressions inside a `sap.ui.define` or `sap.ui.require` call are not supported.

=== "Supported"

    ```javascript
    sap.ui.define([
        `ModuleA`,
        `ModuleB`
    ], function(ModuleA, ModuleB) {
    });
    ```

=== "Not Supported"

    ```javascript hl_lines="4"
    const i = `B`;
    sap.ui.define([
        `ModuleA`,
        `Module${i}`
    ], function(ModuleA, ModuleB) {
    });
    ```

The same rule applies also for the usage of deprecated or no longer recommended APIs `jQuery.sap.declare`, `jQuery.sap.declare`, `define`, `require`, `require.predefine`, `sap.ui.predefine`, `sap.ui.requireSync` and `sap.ui.require.preload`.

#### Template Literal in Smart Template Declaration

When declaring a **Smart Template** using a **Template Literal** with one or more expressions in the name of the **Smart Template** is not supported.

=== "Supported"

    ```javascript
    sap.ui.define([
        `sap/suite/ui/generic/template/lib/TemplateAssembler`
    ], function(TemplateAssembler) {
        return TemplateAssembler.getTemplateComponent(getMethods, 
            `sap.suite.ui.generic.templates.Page.Component`, {
                metadata: {
                    properties: {
                        templateName: {
                            type: `string`,
                            defaultValue: `sap.suite.ui.generic.templates.Page.view.Page`
                        }
                    },
                    manifest: `json`
                }
            }
        );
    });
    ```

=== "Not Supported"

    ```javascript hl_lines="6"
    sap.ui.define([
        `sap/suite/ui/generic/template/lib/TemplateAssembler`
    ], function(TemplateAssembler) {
        const name = `Component`;
        return TemplateAssembler.getTemplateComponent(getMethods,
            `sap.suite.ui.generic.templates.Page.${name}`, {
                metadata: {
                    properties: {
                        templateName: {
                            type: `string`,
                            defaultValue: `sap.suite.ui.generic.templates.Page.view.Page`
                        }
                    },
                    manifest: `json`
                }
            }
        );
    });
    ```

#### Template Literal in XMLComposite Declaration

The **XMLComposite** control is deprecated since version UI5 1.88. Nevertheless UI5 CLI will attempt to analyze the declaration of any such controls in a project.

Declaring an **XMLComposite** control using a **Template Literal** with one or more expressions in the name, is not supported.

=== "Supported"

    ```javascript
    sap.ui.define([
        `sap/ui/core/XMLComposite`
    ], function(XMLComposite) {
        return XMLComposite.extend(`composites.MyComposite`, {} 
    });
    ```

=== "Not Supported"

    ```javascript hl_lines="5"
    sap.ui.define([
        `sap/ui/core/XMLComposite`
    ], function(XMLComposite) {
        const name = `MyComposite`;
        return XMLComposite.extend(`composites.${name}`, {});
    });
    ```

#### Template Literal in sap/ui/core/Core#initLibrary Call

A library is typically initialized via an accompanying `library.js`. Within that file, the object which is supplied to the `sap/ui/core/Core#initLibrary` method, must not use a **Template Literal** with one or more expressions for the library name.

=== "Supported"

    ```javascript
    sap.ui.getCore().initLibrary({
        name: `my.lib`
    });
    ```

=== "Not Supported"

    ```javascript hl_lines="3"
    const libraryName = `lib`;
    sap.ui.getCore().initLibrary({
        name: `my.${libraryName}`
    });
    ```

#### Reserved Variable Names in a Template Literal

While UI5 CLI performs a build placeholders are replaced with a values offered by the build. For example `${version}` is replaced with the actual version defined in the package.json of the project. Therefore it is required to not use any **Template Literal** where any expression contains variable with following names:

- `version`
- `project.version`
- `buildtime`
- `copyright`

=== "Supported"

    ```javascript
    const myVersion = `1.2`;
    const transformedVersion `v${myVersion}`
    ```

=== "Not Supported"

    ```javascript hl_lines="3"
    const version = `1.2`;
    const transformedVersion `v${version}`
    ```

UI5 CLI searches for the exact match of `${version}`, so with adding whitespaces before and after the variable name `${ version }` UI5 CLI won't replace this occurence. This can be enforced by the dedicated ESLint config [template-curly-spacing](https://eslint.org/docs/latest/rules/template-curly-spacing) with option `always`.

### Spread Element

A [Spread Element](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Spread_syntax) can be used in all places, except the following.

#### Spread Element in `sap.ui.define` or `sap.ui.require`

A **Spread Element** as a parameter in a `sap.ui.define` or `sap.ui.require` call is not supported.

=== "Supported"

    ```javascript
    sap.ui.define([
        "ModuleA",
        "ModuleB"
    ], function(ModuleA, ModuleB) {
    });
    ```

=== "Not Supported"

    ```javascript hl_lines="3"
    const dependencies = ["ModuleA", "ModuleB"];
    sap.ui.define([
        ...dependencies
    ], function(ModuleA, ModuleB) {
    });
    ```

The same rule applies also for the usage of deprecated or no longer recommended APIs `jQuery.sap.declare`, `jQuery.sap.declare`, `define`, `require`, `require.predefine`, `sap.ui.predefine`, `sap.ui.requireSync` and `sap.ui.require.preload`.

#### Spread Element in Smart Template Declaration

When declaring a **Smart Template**, the usage of a **Spread Element** in the configuration is not supported.

=== "Supported"

    ```javascript
    sap.ui.define([
        "sap/suite/ui/generic/template/lib/TemplateAssembler"
    ], function(TemplateAssembler) {
        return TemplateAssembler.getTemplateComponent(getMethods, 
            "sap.suite.ui.generic.templates.Page.Component", {
                metadata: {
                    properties: {
                        templateName: {
                            type: "string",
                            defaultValue: "sap.suite.ui.generic.templates.Page.view.Page"
                        }
                    },
                    manifest: "json"
                }
            }
        );
    });
    ```

=== "Not Supported"

    ```javascript hl_lines="6"
    sap.ui.define([
        "sap/suite/ui/generic/template/lib/TemplateAssembler"
    ], function(TemplateAssembler) {
        const myTemplate = {
            templateName: {
                type: "string",
                defaultValue: "sap.suite.ui.generic.templates.Page.view.Page"
            }
        };
        return TemplateAssembler.getTemplateComponent(getMethods,
            "sap.suite.ui.generic.templates.Page.Component", {
                metadata: {
                    properties: {
                        ...myTemplate
                    }
                    manifest: "json"
                }
            }
        );
    });
    ```

#### Spread Element in XMLComposite Declaration

The **XMLComposite** control is deprecated since version UI5 1.88. Nevertheless UI5 CLI will attempt to analyze the declaration of any such controls in a project.

When declaring an **XMLComposite**, the usage of a **Spread Element** in the configuration is not supported.

=== "Supported"

    ```javascript
    sap.ui.define([
        "sap/ui/core/XMLComposite"
    ], function(XMLComposite) {
        return XMLComposite.extend("composites.MyComposite", {
            fragment: "composites.custom.MyComposite"
        } 
    });
    ```

=== "Not Supported"

    ```javascript hl_lines="5"
    sap.ui.define([
        "sap/ui/core/XMLComposite"
    ], function(XMLComposite) {
        const myXMLComposite = {
              fragment: "composites.custom.MyComposite"
        };
        return XMLComposite.extend(`composites.MyComposite`, {
            ...myXMLComposite
        });
    });
    ```

#### Spread Element in sap/ui/core/Core#initLibrary Call

A library is typically initialized via an accompanying `library.js`. Within that file, the object which is supplied to the `sap/ui/core/Core#initLibrary` method, must not use a **Spread Element**.

=== "Supported"

    ```javascript
    sap.ui.getCore().initLibrary({
        name: "my.lib"
    });
    ```

=== "Not Supported"

    ```javascript hl_lines="5"
    const mylib = {
        name: "my.lib"
    };
    sap.ui.getCore().initLibrary({
        ...mylib
    });
    ```

### Object Expression

An **Object Expression** can be used in all places except in following places.

#### Object Expression in `sap.ui.define` or `sap.ui.require`

An **Object Expression** as a parameter in a `sap.ui.define` or `sap.ui.require` call is not supported.

=== "Supported"

    ```javascript
    sap.ui.define([
        "Bar"
    ], function(Bar){
    });

    ```

=== "Not Supported"

    ```javascript hl_lines="3"
    const dependency = "Bar";
    sap.ui.define([
        dependency
    ], function(Bar){
    });
    ```

The same rule applies also for the usage of deprecated or no longer recommended APIs `jQuery.sap.declare`, `jQuery.sap.declare`, `define`, `require`, `require.predefine`, `sap.ui.predefine`, `sap.ui.requireSync` and `sap.ui.require.preload`.

#### Object Expression in Smart Template Declaration

When declaring a **Smart Template**, the usage of an **Object Expression** in the configuration is not supported.

=== "Supported"

    ```javascript
    sap.ui.define([
        "sap/suite/ui/generic/template/lib/TemplateAssembler"
    ], function(TemplateAssembler) {
        return TemplateAssembler.getTemplateComponent(getMethods, 
            "sap.suite.ui.generic.templates.Page.Component", {
                metadata: {
                    properties: {
                        templateName: {
                            type: "string",
                            defaultValue: "sap.suite.ui.generic.templates.Page.view.Page"
                        }
                    },
                    manifest: "json"
                }
            }
        );
    });
    ```

=== "Not Supported"

    ```javascript hl_lines="9"
    sap.ui.define([
        "sap/suite/ui/generic/template/lib/TemplateAssembler"
    ], function(TemplateAssembler) {
        const key = "templateName"
        return TemplateAssembler.getTemplateComponent(getMethods,
            `sap.suite.ui.generic.templates.Page.${name}`, {
                metadata: {
                    properties: {
                        [key]: {
                            type: "string",
                            defaultValue: "sap.suite.ui.generic.templates.Page.view.Page"
                        }
                    }
                    manifest: "json"
                }
            }
        );
    });
    ```

#### Object Expression in XMLComposite Declaration

The **XMLComposite** control is deprecated since version UI5 1.88. Nevertheless UI5 CLI will attempt to analyze the declaration of any such controls in a project.

When declaring an **XMLComposite**, the usage of an **Object Expression** in the configuration is not supported.

=== "Supported"

    ```javascript
    sap.ui.define([
        "sap/ui/core/XMLComposite"
    ], function(XMLComposite) {
        return XMLComposite.extend("composites.MyComposite", {
            fragment: "composites.custom.MyComposite"
        } 
    });
    ```

=== "Not Supported"

    ```javascript hl_lines="6"
    sap.ui.define([
        "sap/ui/core/XMLComposite"
    ], function(XMLComposite) {
        const key = "fragment";
        return XMLComposite.extend("composites.MyComposite", {
            [key]: "composites.custom.MyComposite"
        });
    });
    ```

#### Object Expression in sap/ui/core/Core#initLibrary Call

A library is typically initialized via an accompanying `library.js`. Within that file, the object which is supplied to the `sap/ui/core/Core#initLibrary` method, must not use an **Object Expression**.

=== "Supported"

    ```javascript
    sap.ui.getCore().initLibrary({
        name: "my.lib"
    });
    ```

=== "Not Supported"

    ```javascript hl_lines="3"
    const key = "name";
    sap.ui.getCore().initLibrary({
        [key]: "my.lib"
    });
    ```

### Computed Property

A **Computed Property** can be used in all places except in following places.

#### Computed Property when using `extend`

One or more **Computed Property** as a parameter in an UI5 Module `extend` call is not supported.

=== "Supported"

    ```javascript
    sap.ui.define([
        "Bar"
    ], function(Bar){
        return Bar.extend("my.Bar" {});
    });

    ```

=== "Not Supported"

    ```javascript hl_lines="3"
    const name = "my";
    sap.ui.define([
        "Bar"
    ], function(Bar){
        return Bar.extend(name + ".Bar", {});
    });
    ```

#### Computed Properties in sap/ui/core/Core#initLibrary Call

A library is typically initialized via an accompanying `library.js`. Within that file, the object which is supplied to the `sap/ui/core/Core#initLibrary` method, must not use an **Computed Property**.

=== "Supported"

    ```javascript
    sap.ui.getCore().initLibrary({
        name: "my.lib"
    });
    ```

=== "Not Supported"

    ```javascript hl_lines="3"
    const name = "my";
    sap.ui.getCore().initLibrary({
        name: name + ".lib"
    });
    ```

### Class Declaration

If you want to generate a JSDoc build of your project and using a **Class Declaration** the class declaration should not be returned directly. Declare the class and return the class in a separate statement. If not JSDoc treats the the class declaration as a return statement and does not recognize any JSDoc if such is provided right above the class declaration.

=== "Supported"

    ```javascript
    sap.ui.define([
        "Bar"
    ], function(Bar){
        /**
         * JSDoc block here
         */
        class Foo extends Bar {
            make () {}
        }

        return Foo;
    });
    ```

=== "Not Supported"

    ```javascript hl_lines="7"
    sap.ui.define([
        "Bar"
    ], function(Bar){
        /**
         * JSDoc block here
         */
        return class Foo extends Bar {
            make () {}
        }
    });
    ```

### Arrow Function Expression

If you want to generate a JSDoc build of your project and use an **Arrow Function Expression** the JSDoc has to be written above the arrow function and not above the `sap.ui.define/sap.ui.require` command.

=== "Supported"

    ```javascript
    sap.ui.define([
        "Bar"
    ], 
    /**
     * JSDoc block here
     */
    (Bar) => Bar.extends("Foo", {

    }));
    ```

=== "Not Supported"

    ```javascript hl_lines="1 2 3"
    /**
     * JSDoc block here
     */
    sap.ui.define([
        "Bar"
    ], (Bar) => Bar.extends("Foo", {

    }));
    ```
