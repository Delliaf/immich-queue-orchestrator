import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import process from 'node:process';

const pairs = [
  ['README.md', 'README.ru.md'],
  ['CONTRIBUTING.md', 'CONTRIBUTING.ru.md'],
  ['SECURITY.md', 'SECURITY.ru.md'],
  ['docs/architecture.md', 'docs/ru/architecture.md'],
  ['docs/compatibility.md', 'docs/ru/compatibility.md'],
  ['docs/configuration.md', 'docs/ru/configuration.md'],
  ['docs/recovery.md', 'docs/ru/recovery.md'],
  ['docs/project-plan.md', 'docs/ru/project-plan.md'],
];

const writeMarkers = process.argv.includes('--write');
const markerPattern = /<!-- translation-source: ([^;]+); source-sha256: ([a-f0-9]{64}) -->/u;
const failures = [];

for (const [sourcePath, translationPath] of pairs) {
  try {
    await Promise.all([stat(sourcePath), stat(translationPath)]);
  } catch {
    failures.push(`${sourcePath}: missing source or translation (${translationPath})`);
    continue;
  }

  const [source, translation] = await Promise.all([
    readFile(sourcePath, 'utf8'),
    readFile(translationPath, 'utf8'),
  ]);
  const digest = createHash('sha256').update(source).digest('hex');
  const expectedMarker = `<!-- translation-source: ${sourcePath}; source-sha256: ${digest} -->`;
  const currentMarker = translation.match(markerPattern)?.[0];

  if (writeMarkers) {
    const updated = currentMarker
      ? translation.replace(markerPattern, expectedMarker)
      : translation.replace(/^(# .+\r?\n)/u, `$1\n${expectedMarker}\n`);

    if (updated === translation && currentMarker !== expectedMarker) {
      failures.push(`${translationPath}: cannot insert a revision marker after the H1`);
      continue;
    }

    if (updated !== translation) {
      await writeFile(translationPath, updated, 'utf8');
      console.log(`updated ${translationPath}`);
    }
    continue;
  }

  if (currentMarker !== expectedMarker) {
    failures.push(`${translationPath}: stale or missing marker for ${sourcePath}; review the translation, then run npm run docs:sync`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(`${writeMarkers ? 'Updated' : 'Verified'} ${pairs.length} documentation translation pairs.`);
}
