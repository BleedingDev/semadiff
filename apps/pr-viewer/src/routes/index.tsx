import {
	SemaDiffExplorer,
	type SemaDiffExplorerProps,
} from "@semadiff/react-ui";

import "@semadiff/react-ui/styles.css";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { logger } from "../logger";
import {
	getFileDiff,
	getFileReviewGuide,
	getPrReviewSummary,
	getPrSummary,
} from "../server/pr.server";

interface SearchParams {
	pr?: string;
	file?: string;
}

const explorerClient: SemaDiffExplorerProps["client"] = {
	getPrSummary: (payload) => {
		logger.debug("viewer:getPrSummary", payload);
		return getPrSummary({ data: payload });
	},
	getPrReviewSummary: (payload) => {
		logger.debug("viewer:getPrReviewSummary", payload);
		return getPrReviewSummary({ data: payload });
	},
	getFileDiff: (payload, request) => {
		logger.debug("viewer:getFileDiff", payload);
		return getFileDiff({ data: payload, signal: request?.signal });
	},
	getFileReviewGuide: (payload, request) => {
		logger.debug("viewer:getFileReviewGuide", payload);
		return getFileReviewGuide({ data: payload, signal: request?.signal });
	},
};

const hookDebugLogger = (event: string, details: Record<string, unknown>) => {
	logger.debug("viewer:hook", event, details);
};

export const Route = createFileRoute("/")({
	validateSearch: (search: Record<string, unknown>): SearchParams => ({
		pr: typeof search.pr === "string" ? search.pr : undefined,
		file: typeof search.file === "string" ? search.file : undefined,
	}),
	component: App,
});

function App() {
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });

	const handlePrUrlSubmit = (prUrl: string) => {
		const next = prUrl.trim();
		if (!next) {
			return;
		}
		navigate({
			search: (previous) => ({ ...previous, pr: next, file: undefined }),
		});
	};

	const handleSelectedFileChange = (filename: string | null) => {
		const nextFile = filename ?? undefined;
		navigate({
			search: (previous) =>
				previous.file === nextFile ? previous : { ...previous, file: nextFile },
		});
	};

	return (
		<SemaDiffExplorer
			className="sd-app"
			client={explorerClient}
			contextLines={-1}
			debugLogger={hookDebugLogger}
			onPrUrlSubmit={handlePrUrlSubmit}
			onSelectedFileChange={handleSelectedFileChange}
			prUrl={search.pr}
			selectedFile={search.file}
		/>
	);
}
