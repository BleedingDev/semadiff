import { Schema } from "effect";

export class ReviewGuideDecodeError extends Schema.TaggedErrorClass<ReviewGuideDecodeError>()(
	"ReviewGuideDecodeError",
	{
		schema: Schema.String,
		message: Schema.String,
	},
) {}

export class ReviewGuideRuleError extends Schema.TaggedErrorClass<ReviewGuideRuleError>()(
	"ReviewGuideRuleError",
	{
		ruleId: Schema.String,
		message: Schema.String,
	},
) {}

export class ReviewGuideConfigurationError extends Schema.TaggedErrorClass<ReviewGuideConfigurationError>()(
	"ReviewGuideConfigurationError",
	{
		field: Schema.String,
		message: Schema.String,
	},
) {}
