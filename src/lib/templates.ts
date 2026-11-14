import athletic from '../../plans/athletic-performance-12-week.txt?raw';
import { EXAMPLE_PLAN } from './plan-parser';

export interface PlanTemplate {
  name: string;
  blurb: string;
  text: string;
}

/** Built-in plans offered on the New plan screen. */
export const TEMPLATES: PlanTemplate[] = [
  {
    name: 'Athletic Performance 12-Week',
    blurb: 'Strength, speed and agility for running, tennis and soccer. 4 gym days a week, deloads at 4, 8 and 12.',
    text: athletic,
  },
  {
    name: 'Push Pull Legs (example)',
    blurb: 'A short example that shows every feature of the format.',
    text: EXAMPLE_PLAN,
  },
];
