import chalk from 'chalk';
import * as Diff from 'diff'

export function prettyFormatFileDiff(before: string, after: string): string {
  const diff = Diff.diffLines(before, after);

  const changeList: Array<{ added: boolean; removed: boolean; lineNumber: number }> = []
  diff
    .reduce((lineNumber, change) => {
      const changes = change.value.split(/\n/).filter(Boolean).map((l, idx) => ({
        added: change.added,
        removed: change.removed,
        lineNumber:  lineNumber + idx + 1,
      }));
      changeList.push(...changes);

      return lineNumber + ((change.added || (!change.added && !change.removed)) ? (change.count ?? 0) : 0)
    }, 0)

  const snippetGroups = createSnippetGroups(changeList);

  let diffString = '';
  diff.forEach((part) => {
    diffString += part.added ? chalk.green(part.value) :
      part.removed ? chalk.red(part.value) :
        part.value;
  });

  const diffLines = diffString.split(/\n/);
  const result = [];

  for (const group of snippetGroups) {
    const numberWidth = group.end.toString().length;

    const snippet = diffLines.slice(group.start, group.end).map((l, idx) => {
      const change = changeList[group.start + idx];
      return formatLine(l, change.lineNumber, numberWidth, change.added, change.removed)
    }).join('\n')

    result.push(`${chalk.bold(`Lines ${changeList[group.start].lineNumber} to line ${changeList[group.end].lineNumber}:`)}
${snippet}`
    );
  }

  return result.join('\n\n');
}

function createSnippetGroups(changeList: Array<{ added: boolean; removed: boolean }>) {
  const snippetGroups = [];
  let pointerStart = -1;

  for (let counter = 0; counter < changeList.length; counter++) {
    const changeAhead = changeList.slice(counter, counter + 5).some((change) => change.added || change.removed);
    const changeBehind = changeList.slice(counter - 5, counter).some((change) => change.added || change.removed);

    if (pointerStart === -1 && changeAhead) {
      pointerStart = counter;
      continue;
    }

    if (pointerStart !== -1 && !changeAhead && !changeBehind) {
      snippetGroups.push({ start: pointerStart, end: counter })
      pointerStart = -1;
      continue;
    }

    if (pointerStart !== -1 && counter === changeList.length - 1) {
      snippetGroups.push({ start: pointerStart, end: counter })
    }
  }

  return snippetGroups;
}

function formatLine(line: string, lineNumber: number, numberWidth: number, added = false, removed = false) {
  if (added && removed) {
    return `${chalk.gray((lineNumber).toString().padEnd(numberWidth, ' '))} ${chalk.yellow('~')}${line}`
  }

  if (added) {
    return `${chalk.gray((lineNumber).toString().padEnd(numberWidth, ' '))} ${chalk.green('+')}${line}`
  }

  if (removed) {
    return `${chalk.gray((lineNumber).toString().padEnd(numberWidth, ' '))} ${chalk.red('-')}${line}`
  }

  return `${chalk.gray((lineNumber).toString().padEnd(numberWidth, ' '))}  ${line}`

  // return line;
}
