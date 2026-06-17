import { describe, expect, it } from 'vitest';

import { parseChartInfo, renderChart } from '../src/chart';

describe('parseChartInfo', () => {
  it('parses a bare type with no options', () => {
    const i = parseChartInfo('chart line');
    expect(i.type).toBe('line');
    expect(i.caption).toBeNull();
    expect(i.options).toEqual({ yRefs: [], yScale: 'linear' });
  });

  it('keeps the quoted caption separate from the type', () => {
    const i = parseChartInfo('chart bar "Sales 2025"');
    expect(i.type).toBe('bar');
    expect(i.caption).toBe('Sales 2025');
  });

  it('parses y/x bounds', () => {
    const { options } = parseChartInfo('chart line y-min=0 y-max=1 x-min=2 x-max=9');
    expect(options.yMin).toBe(0);
    expect(options.yMax).toBe(1);
    expect(options.xMin).toBe(2);
    expect(options.xMax).toBe(9);
  });

  it('treats y-min=auto as the free-scale sentinel', () => {
    expect(parseChartInfo('chart bar y-min=auto').options.yMin).toBe('auto');
  });

  it('parses a single y-ref without a label', () => {
    expect(parseChartInfo('chart line y-ref=0.25').options.yRefs).toEqual([
      { value: 0.25 },
    ]);
  });

  it('parses a y-ref label that contains spaces, alongside a caption', () => {
    const i = parseChartInfo('chart line "PE" y-min=0 y-ref=0.25:"plancher 1/U"');
    expect(i.caption).toBe('PE');
    expect(i.options.yMin).toBe(0);
    expect(i.options.yRefs).toEqual([{ value: 0.25, label: 'plancher 1/U' }]);
  });

  it('does not mistake a lone y-ref label for the caption', () => {
    const i = parseChartInfo('chart line y-ref=0.5:"target"');
    expect(i.caption).toBeNull();
    expect(i.options.yRefs).toEqual([{ value: 0.5, label: 'target' }]);
  });

  it('parses multiple comma-separated y-refs', () => {
    expect(
      parseChartInfo('chart line y-ref=0.25:"floor",1.0:"ideal"').options.yRefs,
    ).toEqual([
      { value: 0.25, label: 'floor' },
      { value: 1, label: 'ideal' },
    ]);
  });

  it('parses log scale via y-scale=log and the log-y alias', () => {
    expect(parseChartInfo('chart line y-scale=log').options.yScale).toBe('log');
    expect(parseChartInfo('chart line log-y').options.yScale).toBe('log');
  });

  it('accepts an ISO date as an x bound', () => {
    expect(parseChartInfo('chart line x-min=2020-01-01').options.xMin).toBe(
      Date.parse('2020-01-01'),
    );
  });

  it('also extracts a \\label', () => {
    const i = parseChartInfo('chart bar "Sales" \\label{fig:sales} y-max=10');
    expect(i.caption).toBe('Sales');
    expect(i.label).toBe('fig:sales');
    expect(i.options.yMax).toBe(10);
  });
});

describe('renderChart options', () => {
  const body = 'x, y\n1, 0.2\n2, 0.4\n3, 0.8';

  it('draws a reference line when y-ref is given', () => {
    const svg = renderChart(body, 'line', {
      yRefs: [{ value: 0.5, label: 'mid' }],
      yScale: 'linear',
    });
    expect(svg).toContain('chart-ref');
    expect(svg).toContain('mid');
  });

  it('omits an off-plot reference line', () => {
    const svg = renderChart(body, 'line', {
      yMin: 0,
      yMax: 1,
      yRefs: [{ value: 5 }],
      yScale: 'linear',
    });
    expect(svg).not.toContain('chart-ref"');
  });

  it('renders without throwing on a log scale', () => {
    const svg = renderChart('x, y\n1, 1\n2, 100\n3, 10000', 'line', {
      yRefs: [],
      yScale: 'log',
    });
    expect(svg).toContain('chart-svg');
  });
});
