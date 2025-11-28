# @ui5/project/config/Configuration

## @ui5/project/config/Configuration

Provides basic configuration for @ui5/project. Reads/writes configuration from/to \~/.ui5rc

## Constructor

#### new @ui5/project/config/Configuration(configuration)

* Source:

  * [internal/documentation/node\_modules/@ui5/project-npm/lib/config/Configuration.js](internal_documentation_node_modules_@ui5_project-npm_lib_config_Configuration.js.html), [line 12](internal_documentation_node_modules_@ui5_project-npm_lib_config_Configuration.js.html#line12)

##### Parameters:

| Name            | Type   | Description                                                                                                                               |
| --------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `configuration` | object | ###### PropertiesName	Type	Attributes	DescriptionmavenSnapshotEndpointUrl	string	\<optional>&#xA;&#xA;ui5DataDir	string	\<optional>&#xA;	 |

### Members

#### OPTIONS

* Description:

  * A list of all configuration options.

* Source:

  * [internal/documentation/node\_modules/@ui5/project-npm/lib/config/Configuration.js](internal_documentation_node_modules_@ui5_project-npm_lib_config_Configuration.js.html), [line 19](internal_documentation_node_modules_@ui5_project-npm_lib_config_Configuration.js.html#line19)

A list of all configuration options.

### Methods

#### getMavenSnapshotEndpointUrl() → {string}

* Description:

  * Maven Repository Snapshot URL. Used to download artifacts and packages from Maven's build-snapshots URL.

* Source:

  * [internal/documentation/node\_modules/@ui5/project-npm/lib/config/Configuration.js](internal_documentation_node_modules_@ui5_project-npm_lib_config_Configuration.js.html), [line 51](internal_documentation_node_modules_@ui5_project-npm_lib_config_Configuration.js.html#line51)

##### Returns:

* Type

  string

#### getUi5DataDir() → {string}

* Description:

  * Configurable directory where the framework artefacts are stored.

* Source:

  * [internal/documentation/node\_modules/@ui5/project-npm/lib/config/Configuration.js](internal_documentation_node_modules_@ui5_project-npm_lib_config_Configuration.js.html), [line 61](internal_documentation_node_modules_@ui5_project-npm_lib_config_Configuration.js.html#line61)

##### Returns:

* Type

  string

#### toJson() → {object}

* Source:

  * [internal/documentation/node\_modules/@ui5/project-npm/lib/config/Configuration.js](internal_documentation_node_modules_@ui5_project-npm_lib_config_Configuration.js.html), [line 69](internal_documentation_node_modules_@ui5_project-npm_lib_config_Configuration.js.html#line69)

##### Returns:

The configuration in a JSON format

* Type

  object

#### (async, static) fromFile(filePathopt) → {Promise.<[@ui5/project/config/Configuration](@ui5_project_config_Configuration.html)>}

* Description:

  * Creates Configuration from a JSON file

* Source:

  * [internal/documentation/node\_modules/@ui5/project-npm/lib/config/Configuration.js](internal_documentation_node_modules_@ui5_project-npm_lib_config_Configuration.js.html), [line 81](internal_documentation_node_modules_@ui5_project-npm_lib_config_Configuration.js.html#line81)

##### Parameters:

| Name       | Type   | Attributes   | Default      | Description                     |
| ---------- | ------ | ------------ | ------------ | ------------------------------- |
| `filePath` | string | \<optional>  | `"~/.ui5rc"` | Path to configuration JSON file |

##### Returns:

Configuration instance

* Type

  Promise.<[@ui5/project/config/Configuration](@ui5_project_config_Configuration.html)>

#### (async, static) toFile(config, filePathopt) → {Promise.\<void>}

* Description:

  * Saves Configuration to a JSON file

* Source:

  * [internal/documentation/node\_modules/@ui5/project-npm/lib/config/Configuration.js](internal_documentation_node_modules_@ui5_project-npm_lib_config_Configuration.js.html), [line 119](internal_documentation_node_modules_@ui5_project-npm_lib_config_Configuration.js.html#line119)

##### Parameters:

| Name       | Type                                                                        | Attributes   | Default      | Description                     |
| ---------- | --------------------------------------------------------------------------- | ------------ | ------------ | ------------------------------- |
| `config`   | [@ui5/project/config/Configuration](@ui5_project_config_Configuration.html) |              |              | Configuration to save           |
| `filePath` | string                                                                      | \<optional>  | `"~/.ui5rc"` | Path to configuration JSON file |

##### Returns:

* Type

  Promise.\<void>
