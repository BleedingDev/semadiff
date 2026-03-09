import {
	classifyReviewFile,
	composeFileReviewGuide,
	type FileReviewGuide,
	FileReviewGuideSchema,
	type PrReviewSummary,
	PrReviewSummarySchema,
	REVIEW_GUIDE_RULE_VERSION,
	summarizePrReview,
} from "@semadiff/review-guide";
import { Effect, Layer, Option, Schema, ServiceMap } from "effect";

import {
	GitHubCache,
	GitHubCacheLive,
	GitHubClient,
	GitHubClientLive,
	type GitHubClientService,
	GitHubConfig,
	type GitHubDecodeError,
	type GitHubRateLimitError,
	type GitHubRequestError,
	InvalidPrUrl,
} from "./github.js";
import { type PrDiffError, PrDiffLive, PrDiffService } from "./pr-diff.js";
import { parsePrUrl } from "./pr-url.js";
import type {
	FileDiffDocument,
	PrFileSummary,
	ReviewContext,
} from "./types.js";

export type PrReviewError =
	| InvalidPrUrl
	| GitHubRequestError
	| GitHubRateLimitError
	| GitHubDecodeError
	| PrDiffError;

export interface PrReviewServiceApi {
	readonly getReviewSummary: (
		prUrl: string,
	) => Effect.Effect<PrReviewSummary, PrReviewError>;
	readonly getFileReviewGuide: (
		prUrl: string,
		filename: string,
		contextLines: number,
		lineLayout: "split" | "unified",
		detectMoves: boolean,
	) => Effect.Effect<FileReviewGuide, PrReviewError>;
}

const REVIEW_CACHE_TTL_MS = 60 * 60 * 1000;
const REVIEW_CACHE_VERSION = `review:${REVIEW_GUIDE_RULE_VERSION}:v1`;
const NEWLINE_SPLIT_REGEX = /\r?\n/u;
const GitHubClientLiveWithConfig = GitHubClientLive.pipe(
	Layer.provide(GitHubConfig.layer),
	Layer.provide(GitHubCacheLive),
);

const parseCachedReviewSummary = (
	value: string,
): Option.Option<PrReviewSummary> => {
	try {
		return Option.some(
			Schema.decodeUnknownSync(PrReviewSummarySchema)(JSON.parse(value)),
		);
	} catch {
		return Option.none();
	}
};

const parseCachedFileReviewGuide = (
	value: string,
): Option.Option<FileReviewGuide> => {
	try {
		return Option.some(
			Schema.decodeUnknownSync(FileReviewGuideSchema)(JSON.parse(value)),
		);
	} catch {
		return Option.none();
	}
};

const encodeCachedJson = <S extends Schema.Top>(
	_schema: S,
	value: S["Type"],
): string => JSON.stringify(value);

const normalizeReviewContext = Effect.fn("PrReview.normalizeReviewContext")(
	function* (
		prUrl: string,
		titleFallback: string,
		github: GitHubClientService,
		degradedWarnings: string[],
	) {
		const ref = parsePrUrl(prUrl);
		if (!ref) {
			return yield* new InvalidPrUrl({ input: prUrl });
		}

		const pullRequest = yield* github.getPullRequest(ref).pipe(
			Effect.catch((error) =>
				Effect.gen(function* () {
					yield* Effect.logWarning(
						"PrReview context degraded: pull request metadata unavailable",
						{
							prUrl,
							errorTag: error._tag,
						},
					);
					degradedWarnings.push(
						`Review context degraded: pull request metadata unavailable (${error._tag}).`,
					);
					return {
						title: titleFallback,
						body: undefined,
						labels: undefined,
						user: undefined,
						base: { sha: "" },
						head: { sha: "" },
						additions: 0,
						deletions: 0,
						changed_files: 0,
						html_url: prUrl,
					};
				}),
			),
		);

		const commits = yield* github.listPullRequestCommits(ref).pipe(
			Effect.catch((error) =>
				Effect.gen(function* () {
					yield* Effect.logWarning(
						"PrReview context degraded: commit headlines unavailable",
						{
							prUrl,
							errorTag: error._tag,
						},
					);
					degradedWarnings.push(
						`Review context degraded: commit headlines unavailable (${error._tag}).`,
					);
					return [];
				}),
			),
		);

		const context: ReviewContext = {
			title: pullRequest.title || titleFallback,
			...(pullRequest.body ? { body: pullRequest.body } : {}),
			labels: (pullRequest.labels ?? []).map((label) => label.name),
			...(pullRequest.user?.login ? { author: pullRequest.user.login } : {}),
			...("ref" in pullRequest.base && pullRequest.base.ref
				? { baseRef: pullRequest.base.ref }
				: {}),
			...("ref" in pullRequest.head && pullRequest.head.ref
				? { headRef: pullRequest.head.ref }
				: {}),
			commitHeadlines: commits.map(
				(commit) =>
					commit.commit.message.split(NEWLINE_SPLIT_REGEX)[0] ?? commit.sha,
			),
		};

		return context;
	},
);

const toReviewFileInput = (file: PrFileSummary) => ({
	filename: file.filename,
	status: file.status,
	sha: file.sha,
	additions: file.additions,
	deletions: file.deletions,
	changes: file.changes,
	...(file.previousFilename ? { previousFilename: file.previousFilename } : {}),
	...(file.reductionPercent !== undefined
		? { reductionPercent: file.reductionPercent }
		: {}),
	...(file.operations !== undefined ? { operations: file.operations } : {}),
	...(file.moveCount !== undefined ? { moveCount: file.moveCount } : {}),
	...(file.renameCount !== undefined ? { renameCount: file.renameCount } : {}),
	...(file.language ? { language: file.language } : {}),
	...(file.warnings ? { warnings: [...file.warnings] } : {}),
	...(file.binary !== undefined ? { binary: file.binary } : {}),
	...(file.oversized !== undefined ? { oversized: file.oversized } : {}),
});

const summaryCacheKey = (prUrl: string, baseSha: string, headSha: string) =>
	`${REVIEW_CACHE_VERSION}:summary:${prUrl}:${baseSha}:${headSha}`;

const fileGuideCacheKey = (
	prUrl: string,
	baseSha: string,
	headSha: string,
	filename: string,
	detectMoves: boolean,
) =>
	`${REVIEW_CACHE_VERSION}:file:${prUrl}:${baseSha}:${headSha}:${filename}:moves=${detectMoves ? "on" : "off"}`;

export class PrReviewService extends ServiceMap.Service<
	PrReviewService,
	PrReviewServiceApi
>()("@semadiff/PrReviewService") {}

export const PrReviewLive = Layer.effect(
	PrReviewService,
	Effect.gen(function* () {
		const prDiff = yield* PrDiffService;
		const github = yield* GitHubClient;
		const cache = yield* GitHubCache;

		const getReviewSummary = Effect.fn("PrReview.getReviewSummary")(function* (
			prUrl: string,
		) {
			const summary = yield* prDiff.getSummary(prUrl);
			const cacheKey = summaryCacheKey(
				prUrl,
				summary.pr.baseSha,
				summary.pr.headSha,
			);
			const cached = yield* cache.get(cacheKey);
			if (Option.isSome(cached)) {
				const parsed = parseCachedReviewSummary(cached.value);
				if (Option.isSome(parsed)) {
					yield* Effect.logDebug("PrReview.getReviewSummary cache hit", {
						prUrl,
						baseSha: summary.pr.baseSha,
						headSha: summary.pr.headSha,
						ruleVersion: REVIEW_GUIDE_RULE_VERSION,
					});
					return parsed.value;
				}
			}

			const degradedWarnings: string[] = [];
			const context = yield* normalizeReviewContext(
				prUrl,
				summary.pr.title,
				github,
				degradedWarnings,
			);
			const reviewSummary = summarizePrReview({
				context,
				files: summary.files.map(toReviewFileInput),
			});
			const payload: PrReviewSummary =
				degradedWarnings.length > 0
					? {
							...reviewSummary,
							warnings: [...reviewSummary.warnings, ...degradedWarnings],
						}
					: reviewSummary;

			yield* cache.set(
				cacheKey,
				encodeCachedJson(PrReviewSummarySchema, payload),
				REVIEW_CACHE_TTL_MS,
			);
			yield* Effect.logDebug("PrReview.getReviewSummary computed", {
				prUrl,
				baseSha: summary.pr.baseSha,
				headSha: summary.pr.headSha,
				degraded: degradedWarnings.length > 0,
				queueCount: payload.queue.length,
				ruleVersion: REVIEW_GUIDE_RULE_VERSION,
			});
			return payload;
		});

		const getFileReviewGuide = Effect.fn("PrReview.getFileReviewGuide")(
			function* (
				prUrl: string,
				filename: string,
				contextLines: number,
				lineLayout: "split" | "unified",
				detectMoves: boolean,
			) {
				const summary = yield* prDiff.getSummary(prUrl);
				const cacheKey = fileGuideCacheKey(
					prUrl,
					summary.pr.baseSha,
					summary.pr.headSha,
					filename,
					detectMoves,
				);
				const cached = yield* cache.get(cacheKey);
				if (Option.isSome(cached)) {
					const parsed = parseCachedFileReviewGuide(cached.value);
					if (Option.isSome(parsed)) {
						yield* Effect.logDebug("PrReview.getFileReviewGuide cache hit", {
							prUrl,
							filename,
							baseSha: summary.pr.baseSha,
							headSha: summary.pr.headSha,
							ruleVersion: REVIEW_GUIDE_RULE_VERSION,
						});
						return parsed.value;
					}
				}

				const degradedWarnings: string[] = [];
				const context = yield* normalizeReviewContext(
					prUrl,
					summary.pr.title,
					github,
					degradedWarnings,
				);
				const document: FileDiffDocument = yield* prDiff.getFileDiffDocument(
					prUrl,
					filename,
					contextLines,
					lineLayout,
					detectMoves,
				);
				const classification = classifyReviewFile(
					toReviewFileInput(document.file),
				);
				const guide = composeFileReviewGuide({
					context,
					file: toReviewFileInput(document.file),
					classification,
					diff: document.diff,
				});
				const payload: FileReviewGuide =
					degradedWarnings.length > 0
						? {
								...guide,
								warnings: [...guide.warnings, ...degradedWarnings],
							}
						: guide;

				yield* cache.set(
					cacheKey,
					encodeCachedJson(FileReviewGuideSchema, payload),
					REVIEW_CACHE_TTL_MS,
				);
				yield* Effect.logDebug("PrReview.getFileReviewGuide computed", {
					prUrl,
					filename,
					baseSha: summary.pr.baseSha,
					headSha: summary.pr.headSha,
					degraded: degradedWarnings.length > 0,
					reasonCount: payload.reasons.length,
					questionCount: payload.questions.length,
					ruleVersion: REVIEW_GUIDE_RULE_VERSION,
				});
				return payload;
			},
		);

		return PrReviewService.of({
			getReviewSummary,
			getFileReviewGuide,
		});
	}),
).pipe(
	Layer.provide(GitHubConfig.layer),
	Layer.provide(GitHubCacheLive),
	Layer.provide(GitHubClientLiveWithConfig),
	Layer.provide(PrDiffLive),
);
