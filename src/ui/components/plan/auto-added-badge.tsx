import { Text } from 'ink';
import React from 'react';

import { AUTO_ADDED_BADGE, AUTO_ADDED_COLOR } from '../../required-by.js';

/** Pill shown next to resources that the CLI added because other resources require them */
export function AutoAddedBadge() {
  return <Text backgroundColor={AUTO_ADDED_COLOR} bold color="#FFFFFF">{` ${AUTO_ADDED_BADGE} `}</Text>;
}
