import { createContext, useContext } from 'react';
import type { Label, LabelColor } from './types';

export const MAX_TAGS = 12;
export const MAX_TAG_NAME = 24;

export const LABEL_COLORS: LabelColor[] = [
  'yellow',
  'orange',
  'red',
  'pink',
  'purple',
  'blue',
  'teal',
  'green',
];

export const DEFAULT_LABELS: Label[] = [
  { id: 'study', name: 'Study', color: 'yellow' },
  { id: 'project', name: 'Project', color: 'blue' },
  { id: 'career', name: 'Career', color: 'green' },
  { id: 'urgent', name: 'Urgent', color: 'red' },
];

export function dotColor(color: LabelColor): string {
  return `var(--dot-${color})`;
}

export const LabelsContext = createContext<Label[]>(DEFAULT_LABELS);
export const useLabels = () => useContext(LabelsContext);
