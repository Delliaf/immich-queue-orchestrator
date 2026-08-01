# Contributing

<!-- translation-source: CONTRIBUTING.md; source-sha256: 32a119effdadc36a37396d80777c794c1ac0396ef96051b574f2a2a73a167ae1 -->

[English](CONTRIBUTING.md)

Требования: Node.js 22+, npm 10+.

```bash
npm ci
npm run check
```

Изменения safety-critical поведения должны включать scenario test. Не копируйте код из GPL/AGPL queue orchestrators; реализация clean-room под Apache-2.0.

Pull request должен описывать:

- какой observed/desired invariant меняется;
- поведение при timeout и restart;
- влияние на unknown Immich versions/queues;
- тесты и документацию.

Не добавляйте Redis/PostgreSQL writes, Docker socket, force reprocessing или job deletion без отдельного threat model и явного major design decision.
