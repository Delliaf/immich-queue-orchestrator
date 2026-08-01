# Contributing

<!-- translation-source: CONTRIBUTING.md; source-sha256: 53b6b082452a556bc96d148d48e1466e249a2d1ab1a4d517c04d83528cd3b8f0 -->

[English](CONTRIBUTING.md)

Требования: Node.js 24 LTS или новее, npm 10+.

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
