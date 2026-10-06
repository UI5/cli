- Start Date: 2018-07-16
- RFC PR: [#41](https://github.com/SAP/ui5-tooling/pull/41)
- Issue: https://github.com/SAP/ui5-server/issues/13
- Affected components
    + [ ] [ui5-builder](https://github.com/SAP/ui5-builder)
    + [x] [ui5-server](https://github.com/SAP/ui5-server)
    + [ ] [ui5-cli](https://github.com/SAP/ui5-cli)
    + [ ] [ui5-fs](https://github.com/SAP/ui5-fs)
    + [x] [ui5-project](https://github.com/SAP/ui5-project)
    + [ ] [ui5-logger](https://github.com/SAP/ui5-logger)

# RFC 0003 Proxy capabilities of ui5-server
## Summary
Add proxy capabilities to the ui5-server module. It should allow to simulate an applications runtime on a remote system locally.

## Motivation
As an application or library developer, I want to be able to develop applications locally and test them in an environment as close to the production environment as possible. Meaning that resources that are not available locally are automatically retrieved from a given remote system.

Such resources can be an OData service endpoint but also runtime artifacts like UI5 libraries.

**Example:** I want to be able to test an application in a Fiori Launchpad environment without having anything but the application source code available locally. All other resources shall be proxied from, e.g. a NetWeaver ABAP system.

## Detailed design
### Possible use cases
#### A: Use local resources but proxy specific requests to remote system
- Everything is served from local resources expect requests matching a predefined list, those are proxied to a remote system
- Possibly multiple proxies to different systems (if required)
- Useful for
    + OData scenarios
        * Only requests for an OData service endpoint shall be proxied to a given system
- Possible implementation in [PR #38](https://github.com/SAP/ui5-server/pull/38)

#### B: Use remote system environment but serve specific requests from local resources
- Everything is proxied from a remote system expect requests matching a predefined list, those are served form local resources
- Proxy should probably work against a single remote system
- Useful for
    + all development
        * Testing changes of a limited set of resources in any remote system environment
- Could also be realized with use case C by facilitating the virtual FS of ui5-fs

#### C: Simulate remote system environment
- One or more local projects with dependencies maintained between them
- Proxy shall forward every request that can't be fulfilled by the local resources to a remote system
- Proxy should probably work against a single remote system
- Useful for
    - application and library development
        + e.g. no need to maintain/update framework dependencies locally, as they are served from the remote system
    - framework development
        + e.g. test applications deployed in a system against a different version of OpenUI5/SAPUI5 served from the local machine

### Rewriting request URL
In all three use cases it might be required to rewrite some URLs. Examples are:
- Application cache buster processed URLs (see https://help.sap.com/viewer/0ce0b8c56fa74dd897fffda8407e8272/7.5.9/en-US/d415dd8911a645759373dc1a70b93f3d.html)
- Preloads (Component-preload.js, library-preload.js, library-preload.json)
    + e.g. when serving an application from local resources, a Component-preload.js request for it should be suppressed by responding with 404 - Not found.
- Custom bundles
    + This is required whenever a deployed application or library tries to load a custom bundle which shall be served by local (non-bundled) resources
    + e.g. Fiori Launchpad has a custom bundle of the sap.ui.core library. When serving this library from local resources, a bootstrap-bundle needs to be generated on-the-fly (as there is no fallback logic)
- Language specific i18n files
    + This depends on the project setup. I.e. whether all language files are part of the projects source or if some are only available in the remote system

### Authentication
The proxy shall be able to forward the following authentication methods:
- SAML2
- Basic access authentication
- ...?

In addition, authentication for a transparent proxy (e.g. some corporate proxies) sitting between the local machine and the remote system shall be supported.

### Additional requirements
- Full TLS support (with opt-out "insecure" option)
- Possibly WebSocket support
- Possibly HTTP/2 support

### Configuration
#### Project setup
It is to be decided whether a proxy is to be configured within a single project or as a separate project.

A developer might want to use a proxy across multiple projects (i.e. one or more applications and libraries). In a scenario where the main target of the proxy is to simulate the environment of a system (use case C), it might make sense to have a standalone project representing a system which then maintains dependencies to application- and library-projects that shall be served from the local machine. This allows for easy switching between system environments.

It might make sense to have different types of proxy configurations depending on the use case (see above).

To follow the [extension configuration proposal in RFC 1](https://github.com/SAP/ui5-tooling/blob/rfc-type-ext/rfcs/0001-type-extensibility.md#generic-handling-of-extension) a proxy configuration could look like this:
```yaml
specVersion: "0.1"
kind: proxy
type: simulate-system
metadata:
    name: proxy-system-XYZ
proxy:
    remoteRoot: "https://..."
```

This configuration could still be combined with that of a single project like this:
```yaml
specVersion: "0.1"
type: application
metadata:
    name: my.application
----
specVersion: "0.1"
kind: proxy
type: simulate-system
metadata:
    name: proxy-system-XYZ
proxy:
    remoteRoot: "https://..."
```

#### General configuration options
- Remote systems root URL
- Optional: Paths to certificate authority files for trusted connections with systems serving self-signed/corporate certificates.
- Optional: Host and port of transparent proxy (could also be read from environment variables, see https://github.com/SAP/ui5-server/pull/38)
- For use case **C**:
    + Root path for UI5 resources
    + Root path of target application (e.g. CP deployment, Fiori Launchpad)

#### Defining what requests should be processed by the proxy
TBD


## How we teach this
TBD

## Drawbacks
TBD

## Alternatives
Custom proxy solutions using thirdparty software can achieve the same but may cause a setup and learning effort.

## Unresolved questions
TBD

