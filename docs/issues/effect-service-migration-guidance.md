# Draft Issue: Migration Guidance for `Effect.Service` / `Context.Tag` Removal in v4

## Title

Need migration cookbook for `Effect.Service.Default` and `dependencies` patterns removed in Effect v4

## Target Repository

`Effect-TS/effect-smol` (or `Effect-TS/effect`, whichever owns migration docs)

## Summary

Current migration docs note that:

- `Context.Tag` is replaced by `ServiceMap.Service`
- `Effect.Service` is removed
- `Effect.Service` `dependencies` and `.Default` patterns are removed

For projects that rely heavily on `Effect.Service` ergonomics, a practical cookbook would reduce migration friction and mistakes.

## Concrete Patterns Needing Examples

1. Migrating a service class that currently uses `Effect.Service<...>()(...)`.
2. Replacing `dependencies: [...]` composition in old service declarations.
3. Replacing `.Default` layer exports with explicit Layer wiring patterns.
4. Recommended structure for mixed codebases that still use old and new patterns during transition.

## Why This Matters

Large codebases can migrate faster with deterministic examples for these common patterns.

Without concrete examples, teams have to infer architecture-level rewrites from API notes, which increases risk and slows adoption.

## Request

Please add an explicit migration section (or dedicated page) with before/after code for:

- `Context.Tag` -> `ServiceMap.Service`
- `Effect.Service` -> new service definition approach
- `.Default` replacement
- `dependencies` replacement

## Local cookbook draft (what worked for us)

### 1) `Context.Tag` to `ServiceMap.Service`

Before:

```ts
class Repo extends Context.Tag("Repo")<
  Repo,
  { readonly get: (id: string) => Effect.Effect<Item> }
>() {}
const RepoLive = Layer.succeed(Repo, { get: ... });
```

After:

```ts
const Repo = ServiceMap.Service<{
  readonly get: (id: string) => Effect.Effect<Item>;
}>("Repo");
const RepoLive = Layer.succeed(Repo, { get: ... });
```

### 2) `Effect.Service` with `dependencies` / `.Default`

Before:

```ts
class UserRepo extends Effect.Service<UserRepo>()("UserRepo", {
  effect: Effect.gen(function*() {
    const db = yield* Database;
    return { find: (id: string) => db.find(id) };
  }),
  dependencies: [Database.Default]
}) {}
```

After:

```ts
class UserRepo extends ServiceMap.Service<UserRepo>()("UserRepo", {
  make: Effect.gen(function*() {
    const db = yield* Database;
    return { find: (id: string) => db.find(id) };
  })
}) {}

const UserRepoLive = Layer.effect(UserRepo, UserRepo.make);
const AppLive = UserRepoLive.pipe(Layer.provideMerge(DatabaseLive));
```

### 3) Default layer usage

Before:

```ts
program.pipe(Effect.provide(UserRepo.Default));
```

After:

```ts
program.pipe(Effect.provide(UserRepoLive));
```

## Example Environment (where this blocks us)

- Effect v4 beta evaluation branch in a multi-package TypeScript monorepo
- Existing usage includes both `Context.Tag` and `Effect.Service` with `.Default` and `dependencies`
