import { parsePrUrl as parsePrUrlCore } from "@semadiff/pr-backend";

export const parsePrUrl = (input: string) => parsePrUrlCore(input);
