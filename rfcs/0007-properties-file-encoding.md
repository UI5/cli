# RFC 0007 Properties File Encoding

- Start Date: 2019-07-15
- RFC PR: [#168](https://github.com/UI5/cli/pull/168)
- Issue: [#161](https://github.com/UI5/cli/issues/161)
- Affected components <!-- Check affected components by writing an "X" into the brackets -->
    + [x] [ui5-builder](./packages/builder)
    + [x] [ui5-server](./packages/server)
    + [ ] [ui5-cli](./packages/cli)
    + [ ] [ui5-fs](./packages/fs)
    + [ ] [ui5-project](./packages/project)
    + [ ] [ui5-logger](./packages/logger)

## Summary

Add possibility to use UTF-8 encoding for properties files (`*.properties`), in addition to the existing ISO-8859-1 encoding (default).
When building projects or serving files, the output file content should be independent of encodings (plain ASCII) to prevent issues with different encoding expectations/limitations of other tools or servers.

## Motivation

The i18n source files in UI5 are expected to be encoded in ISO-8859-1, based on the [Java 8 properties files](https://docs.oracle.com/javase/8/docs/api/java/util/Properties.html).
This is also part of the [UI5 Development Conventions and Guidelines](https://ui5.sap.com/#/topic/753b32617807462d9af483a437874b36).

Properties files encoded with UTF-8 are causing issues with non-ASCII characters, as a different encoding is expected.

But as UTF-8 is the default encoding for most of the programs and tools nowadays, this is quite cumbersome. Some editors don't even easily support reading from or writing to other encodings and expect UTF-8 by default.
Also with Java 9 the default encoding for properties files has been changed to UTF-8 ([JEP 226: UTF-8 Property Resource Bundles](http://openjdk.java.net/jeps/226)).

A workaround to this problem is to use unicode escape sequences (`\uXXXX`) which makes the content independent from the encoding but very cumbersome to maintain without additional tools to convert the file.
This escaping solution is already used for most of the UI5 libraries, especially for locales which require unicode characters not supported in ISO-8859-1.

To improve the overall developer experience and to prevent encoding issues, the UI5 CLI should be enhanced to also support properties files encoded in UTF-8.
But as there are existing tools and server middleware which explicitly expect those files to be encoded in ISO-8859-1, the output of the UI5 CLI needs to be independent of the encoding (plain ASCII). This should be achieved by converting non-ASCII characters to unicode escape sequences (`\uXXXX`), as already mentioned above.

## Detailed design

### Configuration

A configuration for the `ui5-builder` tasks and the `ui5-server` should be provided such that the source encoding of `*.properties` files can be specified.

This configuration is set on project level, so that multiple projects with different encodings function idependently.
Resources created as part of the project contain a reference to the project, which allows to read the expected source encoding for a single resource.

Altought there are lots of different encodings, the configuration of projects only foresees two relevant encodings.

Supported values are: `UTF-8` and `ISO-8859-1`

The default is `ISO-8859-1` for compatibility reasons.

This should be configured within the `ui5.yaml` file.

Example:

```yaml
specVersion: "1.0"
type: application
metadata:
  name: my.application
resources:
  configuration:
    propertiesFileSourceEncoding: "UTF-8"
```

The resources section within the configuration can be consumed by `ui5-builder` and `ui5-server`.

### Processor 

A processor called `nonAsciiEscaper` should be added.
It escapes non ASCII characters (characters which are not within the 128 character ASCII range) within a given string with unicode escape sequence `\uXXXX`.

Umlaut Example:

| Umlaut   | UTF-8              |
|----------|--------------------|
| `Ä`, `ä` | `\u00c4`, `\u00e4` |
| `Ö`, `ö` | `\u00d6`, `\u00f6` |
| `Ü`, `ü` | `\u00dc`, `\u00fc` |
| `ß`      | `\u00df`           |

The processor should offer an encoding parameter which defaults to "utf8" and passes it to the [Node.js Buffer#toString method](https://nodejs.org/api/buffer.html#buffer_buf_tostring_encoding_start_end).
Supported encodings are based on the Node.js implementation: https://nodejs.org/api/buffer.html#buffer_buffers_and_character_encodings

A static function (`nonAsciiEscaper.getEncodingFromAlias`) should be added to map valid encodings based on the supported configuration values (`UTF-8`, `ISO-8859-1`) to the Node.js encoding names (`utf8`, `latin1`).

### Task

A task `escapeNonAsciiCharacters` should be added which receives the source encoding and a pattern to glob files within the workspace.
It uses the `nonAsciiEscaper.getEncodingFromAlias` function to map the source encoding (based on the project configuration values) to a valid encoding for the processor.

### Types

Both `application` and `library` types should be enhanced.

The formatters should take the [configuration](#Configuration) into account and apply the default.

The builders should execute the `escapeNonAsciiCharacters` task as the very first task and pass the propertiesFileSourceEncoding from the project configuration. The pattern should include all properties files (`/**/*.properties`).

### Server

The `ui5-server` should not use special handling of response headers to ensure ISO-8859-1 encoding anymore.
Content-type / charset should be determined for all files by using the "mime-types" module.

The `serveResources` middleware should call the `nonAsciiEscaper` processor for all `*.properties` files and use the configured encoding of the project where the resource belongs to. This ensures that e.g. files from dependencies are handled properly, as it might have a different encoding than the root project running the server.
In case there is no project or no encoding configuration available, it should default to "ISO-8859-1".

## How we teach this

- Documentation about how to specify the properties files encoding option
- Explanation of the Escaping with examples

## Drawbacks

## Alternatives

- Check the file contents and guess its encoding
  - Use response content-type header attribute
  - Only escape if the file encoding and the transport encoding do not match, e.g. file is encoded as `ISO-8859-1` but will be served as `UTF-8`

## Unresolved Questions and Bikeshedding
