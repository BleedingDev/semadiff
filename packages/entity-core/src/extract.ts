import type { Position, Range } from "@semadiff/core";

import {
	canonicalizeEntityText,
	hashString,
	normalizeEntityText,
} from "./hash.js";
import type {
	EntityLanguage,
	SemanticEntity,
	SemanticEntityKind,
} from "./types.js";
import { ENTITY_LANGUAGES } from "./types.js";

interface SwcSpan {
	start: number;
	end: number;
}

interface ExtractionContext {
	readonly text: string;
	readonly path?: string | undefined;
	readonly exported: boolean;
	readonly parentName?: string | undefined;
	readonly lineStarts: readonly number[];
	readonly spanBase: number;
}

export interface ExtractedEntityRecord extends SemanticEntity {
	readonly declarationHash: string;
	readonly canonicalHash: string;
	readonly bodyHash: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readType(value: unknown) {
	return isRecord(value) && typeof value.type === "string"
		? value.type
		: undefined;
}

function readArray(value: unknown, key: string) {
	if (!isRecord(value)) {
		return [];
	}
	const field = value[key];
	return Array.isArray(field) ? field : [];
}

function readRecord(value: unknown, key: string) {
	if (!isRecord(value)) {
		return undefined;
	}
	const field = value[key];
	return isRecord(field) ? field : undefined;
}

function readString(value: unknown, key: string) {
	if (!isRecord(value)) {
		return undefined;
	}
	const field = value[key];
	return typeof field === "string" ? field : undefined;
}

function readSpan(value: unknown) {
	if (!isRecord(value)) {
		return undefined;
	}
	const span = value.span;
	if (!isRecord(span)) {
		return undefined;
	}
	const start = span.start;
	const end = span.end;
	if (
		typeof start !== "number" ||
		typeof end !== "number" ||
		!Number.isFinite(start) ||
		!Number.isFinite(end)
	) {
		return undefined;
	}
	return {
		start,
		end,
	} satisfies SwcSpan;
}

function identifierName(node: unknown) {
	const value = readString(node, "value");
	if (value) {
		return value;
	}
	return readString(node, "name");
}

function propertyName(node: unknown) {
	const identifier = identifierName(node);
	if (identifier) {
		return identifier;
	}
	const value = readString(node, "value");
	if (value) {
		return value;
	}
	if (!isRecord(node)) {
		return undefined;
	}
	const rawValue = node.value;
	return typeof rawValue === "number" ? String(rawValue) : undefined;
}

function declarationIdentifier(node: unknown) {
	return (
		identifierName(readRecord(node, "identifier")) ??
		identifierName(readRecord(node, "id"))
	);
}

function classBodyMembers(node: unknown) {
	const directMembers = readArray(node, "body");
	if (directMembers.length > 0) {
		return directMembers;
	}
	return readArray(readRecord(node, "body"), "body");
}

function buildLineStarts(text: string) {
	const starts = [0];
	for (let index = 0; index < text.length; index += 1) {
		if (text[index] === "\n") {
			starts.push(index + 1);
		}
	}
	return starts;
}

function relativeOffset(offset: number, spanBase: number) {
	return Math.max(1, Math.floor(offset - spanBase));
}

function positionForOffset(
	lineStarts: readonly number[],
	offset: number,
): Position {
	const zeroBased = Math.max(0, Math.floor(offset) - 1);
	let lineIndex = 0;
	for (let index = 0; index < lineStarts.length; index += 1) {
		const current = lineStarts[index] ?? 0;
		const next = lineStarts[index + 1] ?? Number.POSITIVE_INFINITY;
		if (zeroBased >= current && zeroBased < next) {
			lineIndex = index;
			break;
		}
	}
	const lineStart = lineStarts[lineIndex] ?? 0;
	return {
		line: lineIndex + 1,
		column: zeroBased - lineStart + 1,
	};
}

function rangeForSpan(
	lineStarts: readonly number[],
	span: SwcSpan,
	spanBase: number,
): Range {
	const startOffset = relativeOffset(span.start, spanBase);
	const endOffset = relativeOffset(
		span.end > span.start ? span.end - 1 : span.end,
		spanBase,
	);
	return {
		start: positionForOffset(lineStarts, startOffset),
		end: positionForOffset(lineStarts, endOffset),
	};
}

function sliceFromSpan(text: string, span: SwcSpan, spanBase: number) {
	const start = Math.max(0, relativeOffset(span.start, spanBase) - 1);
	const end = Math.max(start, relativeOffset(span.end, spanBase) - 1);
	return text.slice(start, end);
}

function bodySpanForFunction(node: unknown) {
	return readSpan(readRecord(node, "body")) ?? readSpan(node);
}

function bodySpanForClass(node: unknown) {
	const members = classBodyMembers(node)
		.map((member) => readSpan(member))
		.filter((member): member is SwcSpan => Boolean(member));
	const first = members[0];
	const last = members.at(-1);
	if (!(first && last)) {
		return readSpan(node);
	}
	return {
		start: first.start,
		end: last.end,
	} satisfies SwcSpan;
}

function bodySpanForVariable(declarator: unknown) {
	const init = readRecord(declarator, "init");
	if (!init) {
		return readSpan(declarator);
	}
	const body = readRecord(init, "body");
	return readSpan(body) ?? readSpan(init) ?? readSpan(declarator);
}

function createEntityRecord(
	context: ExtractionContext,
	params: {
		kind: SemanticEntityKind;
		name: string;
		span: SwcSpan;
		bodySpan?: SwcSpan | undefined;
	},
): ExtractedEntityRecord {
	const declarationText = sliceFromSpan(
		context.text,
		params.span,
		context.spanBase,
	);
	const bodyText = sliceFromSpan(
		context.text,
		params.bodySpan ?? params.span,
		context.spanBase,
	);
	const range = rangeForSpan(context.lineStarts, params.span, context.spanBase);
	const pathPart = context.path ?? "<memory>";
	const parentPrefix = context.parentName ? `${context.parentName}.` : "";
	return {
		id: `${pathPart}::${params.kind}::${parentPrefix}${params.name}::${range.start.line}:${range.start.column}`,
		kind: params.kind,
		name: params.name,
		range,
		...(context.path ? { path: context.path } : {}),
		...(context.parentName ? { parentName: context.parentName } : {}),
		exported: context.exported,
		declarationHash: hashString(normalizeEntityText(declarationText)),
		canonicalHash: hashString(
			canonicalizeEntityText(declarationText, params.name),
		),
		bodyHash: hashString(normalizeEntityText(bodyText)),
	};
}

function extractVariableEntities(
	declaration: unknown,
	context: ExtractionContext,
	entities: ExtractedEntityRecord[],
) {
	for (const declarator of readArray(declaration, "declarations")) {
		const id = readRecord(declarator, "id");
		const name = identifierName(id);
		const span = readSpan(declarator);
		if (!(name && span)) {
			continue;
		}
		const init = readRecord(declarator, "init");
		const initType = readType(init);
		const kind =
			initType === "ArrowFunctionExpression" ||
			initType === "FunctionExpression"
				? "function"
				: "variable";
		entities.push(
			createEntityRecord(context, {
				kind,
				name,
				span,
				bodySpan: bodySpanForVariable(declarator),
			}),
		);
	}
}

function extractClassMethods(
	declaration: unknown,
	context: ExtractionContext,
	entities: ExtractedEntityRecord[],
) {
	const className = declarationIdentifier(declaration);
	if (!className) {
		return;
	}
	for (const member of classBodyMembers(declaration)) {
		if (readType(member) !== "ClassMethod") {
			continue;
		}
		const name = propertyName(readRecord(member, "key"));
		const span = readSpan(member);
		if (!(name && span)) {
			continue;
		}
		entities.push(
			createEntityRecord(
				{
					...context,
					parentName: className,
				},
				{
					kind: "method",
					name,
					span,
					bodySpan: bodySpanForFunction(readRecord(member, "function")),
				},
			),
		);
	}
}

function extractDeclaration(
	declaration: unknown,
	context: ExtractionContext,
	entities: ExtractedEntityRecord[],
) {
	const declarationType = readType(declaration);
	switch (declarationType) {
		case "FunctionDeclaration": {
			const name = declarationIdentifier(declaration);
			const span = readSpan(declaration);
			if (!(name && span)) {
				return;
			}
			entities.push(
				createEntityRecord(context, {
					kind: "function",
					name,
					span,
					bodySpan: bodySpanForFunction(declaration),
				}),
			);
			return;
		}
		case "ClassDeclaration": {
			const name = declarationIdentifier(declaration);
			const span = readSpan(declaration);
			if (!(name && span)) {
				return;
			}
			entities.push(
				createEntityRecord(context, {
					kind: "class",
					name,
					span,
					bodySpan: bodySpanForClass(declaration),
				}),
			);
			extractClassMethods(declaration, context, entities);
			return;
		}
		case "TsInterfaceDeclaration": {
			const name = identifierName(readRecord(declaration, "id"));
			const span = readSpan(declaration);
			if (!(name && span)) {
				return;
			}
			entities.push(
				createEntityRecord(context, {
					kind: "interface",
					name,
					span,
					bodySpan: readSpan(readRecord(declaration, "body")) ?? span,
				}),
			);
			return;
		}
		case "TsTypeAliasDeclaration": {
			const name = identifierName(readRecord(declaration, "id"));
			const span = readSpan(declaration);
			if (!(name && span)) {
				return;
			}
			entities.push(
				createEntityRecord(context, {
					kind: "typeAlias",
					name,
					span,
					bodySpan: readSpan(readRecord(declaration, "typeAnnotation")) ?? span,
				}),
			);
			return;
		}
		case "VariableDeclaration": {
			extractVariableEntities(declaration, context, entities);
			return;
		}
		default: {
			return;
		}
	}
}

function extractDefaultDeclaration(
	declaration: unknown,
	context: ExtractionContext,
	entities: ExtractedEntityRecord[],
) {
	const declarationType = readType(declaration);
	switch (declarationType) {
		case "FunctionExpression": {
			const name = declarationIdentifier(declaration) ?? "default";
			const span = readSpan(declaration);
			if (!span) {
				return;
			}
			entities.push(
				createEntityRecord(context, {
					kind: "function",
					name,
					span,
					bodySpan: bodySpanForFunction(declaration),
				}),
			);
			return;
		}
		case "ClassExpression": {
			const name = declarationIdentifier(declaration) ?? "default";
			const span = readSpan(declaration);
			if (!span) {
				return;
			}
			entities.push(
				createEntityRecord(context, {
					kind: "class",
					name,
					span,
					bodySpan: bodySpanForClass(declaration),
				}),
			);
			extractClassMethods(declaration, context, entities);
			return;
		}
		default: {
			return;
		}
	}
}

function extractStatement(
	statement: unknown,
	context: ExtractionContext,
	entities: ExtractedEntityRecord[],
) {
	const statementType = readType(statement);
	switch (statementType) {
		case "ExportDeclaration": {
			extractDeclaration(
				readRecord(statement, "declaration"),
				{
					...context,
					exported: true,
				},
				entities,
			);
			return;
		}
		case "ExportDefaultDeclaration": {
			extractDefaultDeclaration(
				readRecord(statement, "decl"),
				{
					...context,
					exported: true,
				},
				entities,
			);
			return;
		}
		default: {
			extractDeclaration(statement, context, entities);
		}
	}
}

function toPublicEntity(entity: ExtractedEntityRecord): SemanticEntity {
	return {
		id: entity.id,
		kind: entity.kind,
		name: entity.name,
		range: entity.range,
		...(entity.path ? { path: entity.path } : {}),
		...(entity.parentName ? { parentName: entity.parentName } : {}),
		exported: entity.exported,
	};
}

export function supportsEntityLanguage(
	language: string | undefined,
): language is EntityLanguage {
	return (
		typeof language === "string" &&
		ENTITY_LANGUAGES.includes(language as EntityLanguage)
	);
}

export function extractEntityRecordsFromRoot(params: {
	root: unknown;
	text: string;
	language?: string | undefined;
	path?: string | undefined;
}) {
	if (!supportsEntityLanguage(params.language)) {
		return [] satisfies ExtractedEntityRecord[];
	}
	if (!isRecord(params.root)) {
		return [] satisfies ExtractedEntityRecord[];
	}
	const body = readArray(params.root, "body");
	if (body.length === 0) {
		return [] satisfies ExtractedEntityRecord[];
	}
	const context: ExtractionContext = {
		text: params.text,
		...(params.path ? { path: params.path } : {}),
		exported: false,
		lineStarts: buildLineStarts(params.text),
		spanBase: Math.max(0, (readSpan(params.root)?.start ?? 1) - 1),
	};
	const entities: ExtractedEntityRecord[] = [];
	for (const statement of body) {
		extractStatement(statement, context, entities);
	}
	return entities;
}

export function extractEntitiesFromRoot(params: {
	root: unknown;
	text: string;
	language?: string | undefined;
	path?: string | undefined;
}) {
	return extractEntityRecordsFromRoot(params).map(toPublicEntity);
}
