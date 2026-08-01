# Contributing

[Русская версия](CONTRIBUTING.ru.md)

Requirements: Node.js 24 LTS or newer and npm 10+.

```bash
npm ci
npm run check
```

Safety-critical behavior changes must include a scenario test. Do not copy code from GPL/AGPL queue orchestrators; this project is a clean-room Apache-2.0 implementation.

A pull request must describe:

- which observed/desired invariant changes;
- behavior after a timeout or restart;
- impact on unknown Immich versions and queues;
- tests and documentation changes.

Do not add Redis/PostgreSQL writes, Docker socket access, forced reprocessing, or job deletion without a separate threat model and an explicit major design decision.
