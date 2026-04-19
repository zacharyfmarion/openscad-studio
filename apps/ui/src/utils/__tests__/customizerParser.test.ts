import { initParser } from '../formatter/parser';
import { parseCustomizerParams } from '../customizer/parser';

describe('parseCustomizerParams', () => {
  beforeAll(async () => {
    await initParser();
  });

  it('preserves standard tabs, sliders, and dropdowns', () => {
    const code = `
/* [Dimensions] */
width = 60; // [40:1:120]
mode = "snap"; // [snap, friction, screw]
module part() {
  cube(width);
}
`;

    const tabs = parseCustomizerParams(code);

    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.name).toBe('Dimensions');
    expect(tabs[0]?.params[0]).toMatchObject({
      name: 'width',
      type: 'slider',
      min: 40,
      max: 120,
      step: 1,
      source: 'standard',
    });
    expect(tabs[0]?.params[1]).toMatchObject({
      name: 'mode',
      type: 'dropdown',
      source: 'standard',
    });
  });

  it('binds valid @studio metadata to the next assignment', () => {
    const code = `
/* [Dimensions] */
// @studio {"label":"Width","description":"Overall outer width","unit":"mm","group":"Body","prominence":"primary"}
width = 60; // [40:1:120]
`;

    const tabs = parseCustomizerParams(code);
    const width = tabs[0]?.params[0];

    expect(width).toMatchObject({
      name: 'width',
      label: 'Width',
      description: 'Overall outer width',
      unit: 'mm',
      group: 'Body',
      prominence: 'primary',
      source: 'hybrid',
    });
  });

  it('ignores malformed @studio metadata without dropping the parameter', () => {
    const code = `
// @studio {"label":"Width"
width = 60; // [40:1:120]
`;

    const tabs = parseCustomizerParams(code);
    const width = tabs[0]?.params[0];

    expect(width).toMatchObject({
      name: 'width',
      type: 'slider',
    });
    expect(width?.label).toBeUndefined();
    expect(width?.source).toBe('standard');
  });

  it('ignores metadata inside hidden tabs', () => {
    const code = `
/* [Hidden] */
// @studio {"label":"Width"}
width = 60; // [40:1:120]

/* [Visible] */
height = 20; // [10:1:40]
`;

    const tabs = parseCustomizerParams(code);

    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.name).toBe('Visible');
    expect(tabs[0]?.params).toHaveLength(1);
    expect(tabs[0]?.params[0]?.name).toBe('height');
  });

  it('downgrades invalid slider ranges and out-of-range values to number inputs', () => {
    const invalidRange = parseCustomizerParams('width = 60; // [120:1:40]');
    const invalidStep = parseCustomizerParams('width = 60; // [40:0:120]');
    const outOfRange = parseCustomizerParams('width = 5; // [40:1:120]');

    expect(invalidRange[0]?.params[0]).toMatchObject({ type: 'number' });
    expect(invalidStep[0]?.params[0]).toMatchObject({ type: 'number' });
    expect(outOfRange[0]?.params[0]).toMatchObject({ type: 'number' });
  });

  it('uses the closest @studio metadata line when multiple are present', () => {
    const code = `
// @studio {"label":"Old width"}
// @studio {"label":"Final width","group":"Body"}
width = 60; // [40:1:120]
`;

    const tabs = parseCustomizerParams(code);
    const width = tabs[0]?.params[0];

    expect(width?.label).toBe('Final width');
    expect(width?.group).toBe('Body');
  });

  it('keeps true/false option comments as boolean toggles', () => {
    const code = `
// @studio {"label":"Enable Drain Ring"}
ring_enabled = true; // [true, false]
`;

    const tabs = parseCustomizerParams(code);
    const ringEnabled = tabs[0]?.params[0];

    expect(ringEnabled).toMatchObject({
      name: 'ring_enabled',
      type: 'boolean',
      value: true,
      label: 'Enable Drain Ring',
      source: 'hybrid',
    });
  });

  it('supports textarea metadata and decodes escaped string content', () => {
    const code = `
// @studio {"label":"Engraving","input":"textarea","rows":5}
engraving = "Line 1\\nLine 2 \\"quoted\\"";
`;

    const tabs = parseCustomizerParams(code);
    const engraving = tabs[0]?.params[0];

    expect(engraving).toMatchObject({
      name: 'engraving',
      type: 'string',
      label: 'Engraving',
      input: 'textarea',
      rows: 5,
      value: 'Line 1\nLine 2 "quoted"',
      source: 'hybrid',
    });
  });
});
