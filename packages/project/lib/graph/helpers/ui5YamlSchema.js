import {CORE_SCHEMA, mergeTag, timestampTag} from "js-yaml";

// js-yaml v5 defaults to CORE_SCHEMA (YAML 1.2), which drops merge key ("<<:")
// and implicit timestamp support that were present in v4's DEFAULT_SCHEMA.
// Restore both by extending CORE_SCHEMA with the two tags.
// YAML11_SCHEMA is deliberately avoided: it additionally changes scalar resolution
// (yes/no/on/off → boolean, 0-prefixed numbers → octal).
export default CORE_SCHEMA.withTags([mergeTag, timestampTag]);
