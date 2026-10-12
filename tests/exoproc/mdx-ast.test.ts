import { expect, test, describe } from 'bun:test';
import {
  parseMdxToAst,
  serializeAstToMdx,
  moveNodeInAst,
  removeNodeFromAst,
  addNodeToAst,
  reorderSiblingNode,
  updateNodePropsInAst,
  updateNodeChildrenInAst,
} from '../../packages/exoproc/src/layout/mdx-ast.js';

describe('exoproc > MDX AST Parser, Serializer & Visual Layout Operations', () => {
  const SAMPLE_MDX = `
<Tabs>
  <Tab label="Combat">
    <Grid cols={2} gap={4}>
      <TargetHUD />
      <CombatTelemetry />
    </Grid>
    <Grid cols={2}>
      <Module id="velocity" />
      <Module id="autoclicker" />
    </Grid>
  </Tab>
  <Tab label="Movement">
    <Grid cols={2}>
      <Module id="sprint" />
    </Grid>
  </Tab>
</Tabs>
  `.trim();

  test('correctly parses nested MDX tags into structured AST', () => {
    const ast = parseMdxToAst(SAMPLE_MDX);

    expect(ast.length).toBe(1);
    expect(ast[0]!.type).toBe('Tabs');
    expect(ast[0]!.children?.length).toBe(2);

    const combatTab = ast[0]!.children![0]!;
    expect(combatTab.type).toBe('Tab');
    expect(combatTab.props.label).toBe('Combat');
    expect(combatTab.children?.length).toBe(2);

    const hudGrid = combatTab.children![0]!;
    expect(hudGrid.type).toBe('Grid');
    expect(hudGrid.props.cols).toBe(2);
    expect(hudGrid.children?.length).toBe(2);
    expect(hudGrid.children![0]!.type).toBe('TargetHUD');
    expect(hudGrid.children![1]!.type).toBe('CombatTelemetry');

    const modGrid = combatTab.children![1]!;
    expect(modGrid.children![0]!.props.id).toBe('velocity');
    expect(modGrid.children![1]!.props.id).toBe('autoclicker');
  });

  test('serializes AST back to valid MDX preserving structure and attributes', () => {
    const ast = parseMdxToAst(SAMPLE_MDX);
    const serialized = serializeAstToMdx(ast);

    expect(serialized).toContain('<Tabs>');
    expect(serialized).toContain('<Tab label="Combat">');
    expect(serialized).toContain('<Grid cols={2} gap={4}>');
    expect(serialized).toContain('<TargetHUD />');
    expect(serialized).toContain('<CombatTelemetry />');
    expect(serialized).toContain('<Module id="velocity" />');
    expect(serialized).toContain('</Tabs>');

    // Second parse must yield identical structure (roundtrip consistency)
    const reParsed = parseMdxToAst(serialized);
    expect(reParsed[0]!.type).toBe('Tabs');
    expect(reParsed[0]!.children?.length).toBe(2);
  });

  test('reorders sibling cards (up/down or left/right)', () => {
    const ast = parseMdxToAst(SAMPLE_MDX);
    // Find velocity module
    const veloId = 'mod_velocity';

    // Move down (swap with autoclicker)
    const reordered = reorderSiblingNode(ast, veloId, 'down');
    const combatTab = reordered[0]!.children![0]!;
    const modGrid = combatTab.children![1]!;

    expect(modGrid.children![0]!.props.id).toBe('autoclicker');
    expect(modGrid.children![1]!.props.id).toBe('velocity');
  });

  test('removes a card from AST', () => {
    const ast = parseMdxToAst(SAMPLE_MDX);
    const { ast: updated, removed } = removeNodeFromAst(ast, 'mod_velocity');

    expect(removed).not.toBeNull();
    expect(removed?.props.id).toBe('velocity');

    const serialized = serializeAstToMdx(updated);
    expect(serialized).not.toContain('id="velocity"');
    expect(serialized).toContain('id="autoclicker"');
  });

  test('moves a card across different Grids or Tabs (drag and drop simulation)', () => {
    const ast = parseMdxToAst(SAMPLE_MDX);

    // Move sprint from Movement Tab grid into Combat Tab module grid
    const combatTab = ast[0]!.children![0]!;
    const combatModGrid = combatTab.children![1]!;

    const updated = moveNodeInAst(ast, 'mod_sprint', combatModGrid.id);
    const serialized = serializeAstToMdx(updated);

    // Combat tab should now contain sprint
    const reParsed = parseMdxToAst(serialized);
    const newCombatModGrid = reParsed[0]!.children![0]!.children![1]!;
    const moduleIds = newCombatModGrid.children!.map((c) => c.props.id);

    expect(moduleIds).toContain('velocity');
    expect(moduleIds).toContain('autoclicker');
    expect(moduleIds).toContain('sprint');
  });

  test('adds a new widget from palette into grid', () => {
    const ast = parseMdxToAst(SAMPLE_MDX);
    const combatTab = ast[0]!.children![0]!;
    const combatModGrid = combatTab.children![1]!;

    const newMod = {
      id: 'mod_fastbreak',
      type: 'Module',
      props: { id: 'fastbreak' },
    };

    const updated = addNodeToAst(ast, combatModGrid.id, newMod);
    const serialized = serializeAstToMdx(updated);
    expect(serialized).toContain('<Module id="fastbreak" />');
  });

  test('updates grid props (e.g. changing column count)', () => {
    const ast = parseMdxToAst(SAMPLE_MDX);
    const combatTab = ast[0]!.children![0]!;
    const combatModGrid = combatTab.children![1]!;

    const updated = updateNodePropsInAst(ast, combatModGrid.id, {
      cols: 3,
      gap: 6,
    });
    const serialized = serializeAstToMdx(updated);
    expect(serialized).toContain('<Grid cols={3} gap={6}>');
  });

  test('updates grid children directly (drag-and-drop live reorder)', () => {
    const ast = parseMdxToAst(SAMPLE_MDX);
    const combatTab = ast[0]!.children![0]!;
    const hudGrid = combatTab.children![0]!;
    expect(hudGrid.children).toHaveLength(2);

    // Swap children
    const swapped = [hudGrid.children![1]!, hudGrid.children![0]!];
    const updated = updateNodeChildrenInAst(ast, hudGrid.id, swapped);

    const serialized = serializeAstToMdx(updated);
    const hudIdx = serialized.indexOf('<TargetHUD />');
    const combatIdx = serialized.indexOf('<CombatTelemetry />');
    expect(combatIdx).toBeLessThan(hudIdx);
  });
});
