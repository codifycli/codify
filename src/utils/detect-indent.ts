// Port of the detection in `detect-indent` (MIT, Sindre Sorhus): the most used indentation step between lines.
// Returns the indentation string (ex: '  ' or '\t'), or '' when the text isn't indented.

type IndentType = 'space' | 'tab';

export function detectIndent(text: string): string {
  let indents = makeIndentsMap(text, true);
  if (indents.size === 0) {
    indents = makeIndentsMap(text, false);
  }

  const key = mostUsedKey(indents);
  if (key === undefined) {
    return '';
  }

  const type: IndentType = key[0] === 's' ? 'space' : 'tab';
  const amount = Number(key.slice(1));
  return (type === 'space' ? ' ' : '\t').repeat(amount);
}

// Key: indentation type + size of the step ('s2', 't1'). Value: [times used, weight]. A step is "used" when a line
// is indented more or less than the previous one, and gains weight for every following line with the same indentation.
function makeIndentsMap(text: string, ignoreSingleSpaces: boolean): Map<string, [number, number]> {
  const indents = new Map<string, [number, number]>();
  let previousSize = 0;
  let previousType: '' | IndentType = '';
  let key: string | undefined;

  for (const line of text.split(/\n/g)) {
    if (!line) {
      continue;
    }

    const matches = line.match(/^(?:( )+|\t+)/);
    if (matches === null) {
      previousSize = 0;
      previousType = '';
      continue;
    }

    const size = matches[0].length;
    const type: IndentType = matches[1] ? 'space' : 'tab';
    if (ignoreSingleSpaces && type === 'space' && size === 1) {
      continue;
    }

    if (type !== previousType) {
      previousSize = 0;
    }

    previousType = type;
    const difference = size - previousSize;
    previousSize = size;

    let use = 1;
    let weight = 0;
    if (difference === 0) {
      use = 0;
      weight = 1;
    } else {
      key = `${type === 'space' ? 's' : 't'}${Math.abs(difference)}`;
    }

    if (key === undefined) {
      continue;
    }

    const entry = indents.get(key);
    indents.set(key, entry === undefined ? [1, 0] : [entry[0] + use, entry[1] + weight]);
  }

  return indents;
}

function mostUsedKey(indents: Map<string, [number, number]>): string | undefined {
  let result: string | undefined;
  let maxUsed = 0;
  let maxWeight = 0;

  for (const [key, [used, weight]] of indents) {
    if (used > maxUsed || (used === maxUsed && weight > maxWeight)) {
      maxUsed = used;
      maxWeight = weight;
      result = key;
    }
  }

  return result;
}
