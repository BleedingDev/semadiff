import {
  SemaDiffExplorer,
  type SemaDiffExplorerProps,
} from "@semadiff/react-ui";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import "../App.css";
import { getFileDiff, getPrSummary } from "../server/pr.server";

interface SearchParams {
  pr?: string;
}

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    pr: typeof search.pr === "string" ? search.pr : undefined,
  }),
  component: App,
});

function App() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const client = useMemo<SemaDiffExplorerProps["client"]>(
    () => ({
      getPrSummary: (payload) => getPrSummary({ data: payload }),
      getFileDiff: (payload, request) =>
        getFileDiff({ data: payload, signal: request?.signal }),
    }),
    []
  );

  const handlePrUrlSubmit = (prUrl: string) => {
    const next = prUrl.trim();
    if (!next) {
      return;
    }
    navigate({ search: { pr: next } });
  };

  return (
    <SemaDiffExplorer
      className="sd-app"
      client={client}
      contextLines={-1}
      onPrUrlSubmit={handlePrUrlSubmit}
      prUrl={search.pr}
    />
  );
}
