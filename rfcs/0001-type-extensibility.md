- Start Date: 2018-04-03
- RFC PR: [#4](https://github.com/SAP/ui5-tooling/pull/4)
- Issue: -
- Affected components
    + [x] [ui5-builder](https://github.com/SAP/ui5-builder)
    + [ ] [ui5-server](https://github.com/SAP/ui5-server)
    + [ ] [ui5-cli](https://github.com/SAP/ui5-cli)
    + [ ] [ui5-fs](https://github.com/SAP/ui5-fs)
    + [x] [ui5-project](https://github.com/SAP/ui5-project)
    + [ ] [ui5-logger](https://github.com/SAP/ui5-logger)

# RFC 0001 Type Extensibility
## Summary
Add a feature to customize how a specific UI5 project is being built.

## Motivation
Currently the UI5 build is only capable of building UI5 projects of types "application" and "library" with a fixed set of tasks it executes.

A UI5 project (for example a library) may want to add or modify build steps (for example execute custom bundling). For this, an extensibility mechanism is needed.

Multiple UI5 projects may require the same kind of "customized" build. Therefore reuse should be possible.

## Detailed design
### Extensibility of types
Leverage the existing mechanism of types (currently for application and library), allow for a custom type and do the necessary adaption via regular JavaScript language features (i.e. object-orientation, deriving and overriding).

The `AbstractBuilder` (as well as any subclass-implementation) offers a set of functions which can be overwritten. Mainly the `build` function.

A custom types `Builder`-module shall extend another types builder or the generic `AbstractBuilder` and overwrite relevant functions:
```js
class MyCustomBuilder extends AbstractBuilder {
    build() {
        super.build();
        myCustomBuildTask();
    }
}
```

### Generic handling of extension
A "Type Extension" will be only one way to extend the UI5 Build and Development Tooling. Other possible extensions include "Shims" (see RFC 0002), server middlewares, translators.

Therefore a somewhat generic concept for dealing with extensions is needed.

To separate "UI5 Projects" (i.e. things that represent UI5-artifacts for the browser) from tooling specific things like "extensions", an additional attribute "kind" is added to the ui5.yaml.


#### Example type extension
```yaml
specVersion: "0.1"
kind: extension
type: project-type
metadata:
    name: my-custom-library
```

#### Example library
```yaml
specVersion: "0.1"
kind: project
type: my-custom-library
metadata:
    name: my.application
```

The `kind` attribute defaults to `project`.

### Collecting and applying type extensions
A type extension might be a standalone module or part of a project. In the above "type extension"/"library" example, the library declares a dependency to the type extension module. `ui5-project` should resolve the dependency, identify it as an extension and run the appropriate formatter/type for the extension type. This will then add the type as "my-custom-library" to the type repository.

If the type extension is part of a project, the single `ui5.yaml` for above example looks like this:

```yaml
specVersion: "0.1"
kind: project
type: my-custom-library
metadata:
    name: my.application
----
specVersion: "0.1"
kind: extension
type: project-type
metadata:
    name: my-custom-library
```

In this case the type extension is no dependency of any kind but automatically collected and processed with the processing of the project.

## How we teach this
TBD

## Drawbacks
TBD

## Alternatives
There are ways to consume (and thereby possibly adapt) the existing tooling through its API via taskrunners such as grunt or gulp, or using a custom node.js script. But this offers only limited possibilities, especially when it comes to building transient dependencies.

## Unresolved questions
