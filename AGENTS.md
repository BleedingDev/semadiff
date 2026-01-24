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
