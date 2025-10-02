# Custom UI5 Server Middleware

The UI5 Server Extensibility enables you to enhance the functionality of the UI5 Server. You may want to handle requests differently. For example add various headers to a response or parse data of a POST request in a specific way. For this you can plug custom middleware implementations into the internal [express](https://expressjs.com/) server of the UI5 Server module.

The UI5 community already created many custom middleware packages which you can integrate into your project. They are often prefixed by `ui5-middleware-` to make them easily searchable in the [npm registry](https://www.npmjs.com/search?q=ui5-middleware-).

Please note that custom middleware packages from third parties can not only modify how your project is served but also execute arbitrary code on your system. In fact, this is the case for all npm packages you install. Always act with the according care and follow best practices.

## Configuration

In a projects `ui5.yaml` file, you can define additional server middleware modules that will be executed when the request is received by the server. This configuration exclusively affects the server started in this project. Custom middleware configurations defined in any dependencies are ignored.

A middleware may be executed before or after any other middleware. This can either be a [standard middleware](../Server.md#standard-middleware) or another custom middleware.

### Example: Basic configuration

```yaml
specVersion: "4.0"
type: application
metadata:
  name: my.application
server:
  customMiddleware:
    - name: myCustomMiddleware
      mountPath: /myapp
      afterMiddleware: compression
      configuration:
        debug: true
```

In the above example the middleware `compression` is already included as a standard middleware by the UI5 Server. When serving the application `my.application`, the server will call the custom middleware `myCustomMiddleware` after `compression`.

There can be optional configuration parameters which are passed directly to the custom middleware implementation (see below).

An optional mountPath for which the middleware function is invoked can be provided. It will be passed to the `app.use` call (see [express API reference](https://expressjs.com/en/4x/api.html#app.use)).

### Execution order

Note that middleware configurations are applied in the order they are defined. When referencing another custom middleware, it has to be defined *before* that reference.

## Custom Middleware Extension

A custom middleware extension consists of a `ui5.yaml` and a [custom middleware implementation](#custom-middleware-implementation). It can be a standalone module or part of an existing UI5 project.

### Example: ui5.yaml

```yaml
specVersion: "4.0"
kind: extension
type: server-middleware
metadata:
  name: markdownHandler
middleware:
  path: lib/middleware/markdownHandler.js
```

Custom middleware extensions can be **standalone modules** which are handled as dependencies.

Alternatively you can implement a custom middleware extension as **part of your UI5 project**.
In that case, the configuration of the extension is part of your project configuration inside the `ui5.yaml` as shown below.

The UI5 Server will detect the custom middleware configuration of the project and use the middleware on startup.

### Example: Custom Middleware Extension defined in UI5 project

```yaml
# Project configuration for the above example
specVersion: "4.0"
kind: project
type: application
metadata:
  name: my.application
server:
  customMiddleware:
    - name: markdownHandler
      beforeMiddleware: serveResources
---
# Custom middleware extension as part of your project
specVersion: "4.0"
kind: extension
type: server-middleware
metadata:
  name: markdownHandler
middleware:
  path: lib/middleware/markdownHandler.js
```

## Custom Middleware Implementation

A custom middleware implementation needs to return a function with the following signature:

=== "ESM"

    ```js linenums="1"
    /**
     * Custom UI5 Server middleware API
     * 
     * @param {object} parameters Parameters
     * @param {@ui5/logger/Logger} parameters.log
     *      Logger instance for use in the custom middleware.
     *      This parameter is only provided to custom middleware
     *      extensions defining Specification Version 3.0 and later.
     * @param {@ui5/server.middleware.MiddlewareUtil} parameters.middlewareUtil
     *      Specification version-dependent interface to a
     *      MiddlewareUtil instance. See the corresponding API reference for details:
     *      https://ui5.github.io/cli/v4/api/@ui5_server_middleware_MiddlewareUtil.html
     * @param {object} parameters.options Options
     * @param {string} parameters.options.configuration
     *      Custom middleware configuration, as defined in the project's ui5.yaml
     * @param {string} parameters.options.middlewareName
     *      Name of the custom middleware.
     *      This parameter is only provided to custom middleware extensions
     *      defining Specification Version 3.0 and later
     * @param {object} parameters.resources Readers for accessing resources
     * @param {module:@ui5/fs.AbstractReader} parameters.resources.all
     *      Reader to access resources of the root project and its dependencies
     * @param {module:@ui5/fs.AbstractReader} parameters.resources.rootProject
     *      Reader to access resources of the root project
     * @param {module:@ui5/fs.AbstractReader} parameters.resources.dependencies
     *      Reader to access resources of the project's dependencies.
     * @returns {function} Middleware function to use
     */
    export default function({log, middlewareUtil, options, resources}) {
        return async function (req, res, next) {
            // [...]
        }
    };
    ```

=== "CommonJS"

    ```js linenums="1"
    /**
     * Custom UI5 Server middleware API
     * 
     * @param {object} parameters Parameters
     * @param {@ui5/logger/Logger} parameters.log
     *      Logger instance for use in the custom middleware.
     *      This parameter is only provided to custom middleware
     *      extensions defining Specification Version 3.0 and later.
     * @param {@ui5/server.middleware.MiddlewareUtil} parameters.middlewareUtil
     *      Specification version-dependent interface to a
     *      MiddlewareUtil instance. See the corresponding API reference for details:
     *      https://ui5.github.io/cli/v4/api/@ui5_server_middleware_MiddlewareUtil.html
     * @param {object} parameters.options Options
     * @param {string} parameters.options.configuration
     *      Custom middleware configuration, as defined in the project's ui5.yaml
     * @param {string} parameters.options.middlewareName
     *      Name of the custom middleware.
     *      This parameter is only provided to custom middleware extensions
     *      defining Specification Version 3.0 and later
     * @param {object} parameters.resources Readers for accessing resources
     * @param {module:@ui5/fs.AbstractReader} parameters.resources.all
     *      Reader to access resources of the root project and its dependencies
     * @param {module:@ui5/fs.AbstractReader} parameters.resources.rootProject
     *      Reader to access resources of the root project
     * @param {module:@ui5/fs.AbstractReader} parameters.resources.dependencies
     *      Reader to access resources of the project's dependencies.
     * @returns {function} Middleware function to use
     */
    module.exports = function({log, middlewareUtil, options, resources}) {
        return async function (req, res, next) {
            // [...]
        }
    };
    ```

### Example: lib/middleware/markdownHandler.(m)js

=== "ESM"

    ```js linenums="1"
    import MarkdownIt from "markdown-it";

    export default async function({log, middlewareUtil, options, resources}) {
        const md = new MarkdownIt();
        return function (req, res, next) {
            if (!req.path || !req.path.endsWith(".html")) {
                // Do not handle non-HTML requests
                next();
                return;
            }
            // Try to read a corresponding markdown file
            resources.rootProject.byPath(req.path.replace(".html", ".md")).then(async (resource) => {
                if (!resource) {
                    // No file found, hand over to next middleware
                    next();
                    return;
                }
                log.info(`Rendering markdown for ${resource.getPath()}`);
                const markdown = await resource.getBuffer();
                // Generate HTML from markdown string
                const html = md.render(markdown.toString());
                res.type('.html');
                res.end(html);
            }).catch((err) => {
                next(err);
            });
        }
    };
    ```
    Live demo of the above example: [openui5-sample-app with custom middleware](https://github.com/SAP/openui5-sample-app/tree/demo-server-middleware-extensibility-v3-esm)

=== "CommonJS"

    ```js linenums="1"
    module.exports = async function({log, middlewareUtil, options, resources}) {
        const MarkdownIt = require("markdown-it");
        const md = new MarkdownIt();
        return function (req, res, next) {
            if (!req.path || !req.path.endsWith(".html")) {
                // Do not handle non-HTML requests
                next();
                return;
            }
            // Try to read a corresponding markdown file
            resources.rootProject.byPath(req.path.replace(".html", ".md")).then(async (resource) => {
                if (!resource) {
                    // No file found, hand over to next middleware
                    next();
                    return;
                }
                log.info(`Rendering markdown for ${resource.getPath()}`);
                const markdown = await resource.getBuffer();
                // Generate HTML from markdown string
                const html = md.render(markdown.toString());
                res.type('.html');
                res.end(html);
            }).catch((err) => {
                next(err);
            });
        }
    };
    ```
    Live demo of the above example: [openui5-sample-app with custom middleware](https://github.com/SAP/openui5-sample-app/tree/demo-server-middleware-extensibility-v3)

## Helper Class `MiddlewareUtil`

Custom middleware defining [Specification Version](../Configuration.md#specification-versions) 2.0 or higher have access to an interface of a [MiddlewareUtil](https://ui5.github.io/cli/v4/api/@ui5_server_middleware_MiddlewareUtil.html) instance.

In this case, a `middlewareUtil` object is provided as a part of the custom middleware's [parameters](#custom-middleware-implementation). Depending on the specification version of the custom middleware, a set of helper functions is available to the implementation. The lowest required specification version for every function is listed in the [MiddlewareUtil API reference](https://ui5.github.io/cli/v4/api/@ui5_server_middleware_MiddlewareUtil.html).

## Integration with `karma-ui5`

!!! Warning
    The Karma project has been [deprecated](https://github.com/karma-runner/karma#karma-is-deprecated-and-is-not-accepting-new-features-or-general-bug-fixes) as of 2023

[`karma-ui5`](https://github.com/SAP/karma-ui5) is a plugin for the popular [Karma test runner](https://karma-runner.github.io/). Based on your [configuration](https://github.com/SAP/karma-ui5#url), it can fetch resources from a dedicated server or start an internal server using parts of UI5 CLI.

In the latter case, any custom middleware configured in the default `ui5.yaml` of the project will be used automatically.

However, since Karma uses the [`connect`](https://github.com/senchalabs/connect) framework, as opposed to UI5 CLI's [`express`](https://github.com/expressjs/express), custom middleware might not always work as expected. Compared to `connect`, the `express` framework provides a more versatile API to middleware.

Therefore, if you plan to use custom middleware in an integrated scenario with `karma-ui5`, you must **restrict the middleware to using the [`connect`](https://github.com/senchalabs/connect) API only** to ensure compatibility.

Alternatively, you can start a server with the usual `ui5 serve` command and [configure the corresponding URL](https://github.com/SAP/karma-ui5#url) for use by `karma-ui5`.
