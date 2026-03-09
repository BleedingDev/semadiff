export { extractEntitiesFromRoot, supportsEntityLanguage } from "./extract.js";
export type { EntitySourceInput } from "./match.js";
export {
	buildEntityDocument,
	buildEntityDocumentFromSources,
	buildHybridDiffDocument,
} from "./match.js";
export type {
	EntityChange,
	EntityChangeKind,
	EntityDocument,
	EntityLanguage,
	HybridDiffDocument,
	SemanticEntity,
	SemanticEntityKind,
} from "./types.js";
export {
	ENTITY_CHANGE_KINDS,
	ENTITY_LANGUAGES,
	SEMANTIC_ENTITY_KINDS,
} from "./types.js";
