# Agent Instructions

<!-- effect-solutions:start -->
## Effect Best Practices

**IMPORTANT:** Always consult effect-solutions before writing Effect code.

1. Run `effect-solutions list` to see available guides
2. Run `effect-solutions show <topic>...` for relevant patterns (supports multiple topics)
3. Search `.reference/effect/` for real implementations (run `effect-solutions setup` first)

Topics: quick-start, project-setup, tsconfig, basics, services-and-layers, data-modeling, error-handling, config, testing, cli.

Never guess at Effect patterns - check the guide first.
<!-- effect-solutions:end -->

## Local Effect Source

The Effect repository is cloned to `.reference/effect` for reference.

## Subagents
- ALWAYS wait for all subagents to complete before yielding.
- Spawn subagents automatically when:
- Parallelizable work (e.g., install + verify, npm test + typecheck, multiple tasks from plan)
- Long-running or blocking tasks where a worker can run independently.
Isolation for risky changes or checks

## Dev Server (pr-viewer) - IPv4/IPv6 Safe Start
- Always run with Bun and bind explicitly to IPv4 to avoid localhost IPv6 issues:
  `TANSTACK_DEVTOOLS_DISABLED=true bun --bun run dev -- --host 127.0.0.1 --port 3000 --strictPort`
- If devtools are needed, set `TANSTACK_DEVTOOLS_PORT` to a known-free port (default 42070 can conflict).
- Validate the server before reporting success:
  `curl -I http://127.0.0.1:3000/`
- If connection fails, check the dev log and port conflicts before retrying.
