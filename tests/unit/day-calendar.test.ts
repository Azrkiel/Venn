import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import WeeklyCalendar from '../../src/app/r/[share]/weekly-calendar';

describe('day timeline', () => {
  it('shows one day using the weekly drag grid and preserves saved selections', () => {
    const cells = ['2030-01-15', '2030-01-16'].map(date => ({ start: `${date}T12:00:00Z`, end: `${date}T12:15:00Z` }));
    const markup = renderToStaticMarkup(createElement(WeeklyCalendar, {
      cells, buckets: [], selected: new Set([cells[1].start]), onChange: () => {}, timezone: 'UTC', disabled: false,
      day: '2030-01-16', onDayChange: () => {},
    }));
    expect(markup).toContain('Daily availability calendar');
    expect(markup).toContain('January 16, 2030');
    expect(markup).toContain('data-week-date="2030-01-16"');
    expect(markup).not.toContain('data-week-date="2030-01-15"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).not.toContain('Earlier days');
    expect(markup).toContain('Next day');
  });
});
