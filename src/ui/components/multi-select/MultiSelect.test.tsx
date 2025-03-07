import { render } from 'ink';
import React from 'react';
import { describe } from 'vitest';

import { MultiSelect } from './MultiSelect.js';

render(<MultiSelect defaultSelected={['Item 1', 'Item 2', 'Item 3', 'Item 4', 'Item 5', 'Item 6']} items={[
  { label: 'Item 1', value: 'Item 1' },
  { label: 'Item 2', value: 'Item 2' },
  { label: 'Item 3', value: 'Item 3' },
  { label: 'Item 4', value: 'Item 4' },
  { label: 'Item 5', value: 'Item 5' },
  { label: 'Item 6', value: 'Item 6' },
  { label: 'Item 7', value: 'Item 7' },
  { label: 'Item 8', value: 'Item 8' },
  { label: 'Item 9', value: 'Item 9' },
  { label: 'Item 10', value: 'Item 10' },
  { label: 'Item 11', value: 'Item 11' },
  { label: 'Item 12', value: 'Item 12' },
  { label: 'Item 13', value: 'Item 13' },
]} /> )
