/**
 * Two-way MDX Abstract Syntax Tree (AST) Parser & Serializer for Exoproc Cockpit.
 * Allows visual manipulation (drag-and-drop, reordering, adding, removing) and
 * serializes clean, indented .mdx layouts to sync back to the Exoproc Engine.
 */

export interface MdxNode {
  id: string;
  type: string;
  props: Record<string, any>;
  children?: MdxNode[];
  content?: string;
}

let nodeCounter = 0;

export function genNodeId(
  type: string,
  props: Record<string, any> = {},
): string {
  if (type === 'Module' && props.id) return `mod_${props.id}`;
  if (type === 'Tab' && props.label) {
    return `tab_${String(props.label)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')}`;
  }
  return `${type.toLowerCase()}_${++nodeCounter}_${Math.random().toString(36).substring(2, 6)}`;
}

export function parseProps(propStr: string): Record<string, any> {
  const props: Record<string, any> = {};
  const regex = /([a-zA-Z0-9_-]+)(?:=(?:"([^"]*)"|'([^']*)'|{([^}]*)}))?/g;
  let match;
  while ((match = regex.exec(propStr)) !== null) {
    const key = match[1];
    if (!key) continue;

    if (match[2] !== undefined) props[key] = match[2];
    else if (match[3] !== undefined) props[key] = match[3];
    else if (match[4] !== undefined) {
      const val = match[4].trim();
      if (val === 'true') props[key] = true;
      else if (val === 'false') props[key] = false;
      else if (!isNaN(Number(val))) props[key] = Number(val);
      else props[key] = val;
    } else {
      props[key] = true;
    }
  }
  return props;
}

/**
 * Parses raw MDX string into an AST tree of MdxNode objects.
 */
export function parseMdxToAst(mdx: string): MdxNode[] {
  if (!mdx || typeof mdx !== 'string') return [];

  const nodes: MdxNode[] = [];
  let remaining = mdx.trim();

  while (remaining.length > 0) {
    const tagMatch = remaining.match(/<([A-Z][a-zA-Z0-9]*)\s*([^>]*?)(\/?)>/);
    if (!tagMatch || tagMatch.index === undefined) {
      const trimmed = remaining.trim();
      if (trimmed) {
        nodes.push({
          id: genNodeId('Text'),
          type: 'Text',
          props: {},
          content: trimmed,
        });
      }
      break;
    }

    const beforeTag = remaining.substring(0, tagMatch.index).trim();
    if (beforeTag) {
      nodes.push({
        id: genNodeId('Text'),
        type: 'Text',
        props: {},
        content: beforeTag,
      });
    }

    const tagName = tagMatch[1] || 'Unknown';
    const rawProps = tagMatch[2] || '';
    const isSelfClosing = tagMatch[3] === '/' || rawProps.endsWith('/');
    const props = parseProps(rawProps.replace(/\/$/, ''));

    if (isSelfClosing) {
      nodes.push({
        id: genNodeId(tagName, props),
        type: tagName,
        props,
      });
      remaining = remaining
        .substring(tagMatch.index + tagMatch[0].length)
        .trim();
    } else {
      const openTag = `<${tagName}`;
      const closeTag = `</${tagName}>`;
      let depth = 1;
      let searchIdx = tagMatch.index + tagMatch[0].length;
      let closeIdx = -1;

      while (depth > 0 && searchIdx < remaining.length) {
        const nextOpen = remaining.indexOf(openTag, searchIdx);
        const nextClose = remaining.indexOf(closeTag, searchIdx);

        if (nextClose === -1) break;

        if (nextOpen !== -1 && nextOpen < nextClose) {
          depth++;
          searchIdx = nextOpen + openTag.length;
        } else {
          depth--;
          if (depth === 0) {
            closeIdx = nextClose;
          } else {
            searchIdx = nextClose + closeTag.length;
          }
        }
      }

      if (closeIdx !== -1) {
        const innerContent = remaining.substring(
          tagMatch.index + tagMatch[0].length,
          closeIdx,
        );
        const children = parseMdxToAst(innerContent);
        nodes.push({
          id: genNodeId(tagName, props),
          type: tagName,
          props,
          children,
        });
        remaining = remaining.substring(closeIdx + closeTag.length).trim();
      } else {
        nodes.push({
          id: genNodeId(tagName, props),
          type: tagName,
          props,
        });
        remaining = remaining
          .substring(tagMatch.index + tagMatch[0].length)
          .trim();
      }
    }
  }

  return nodes;
}

/**
 * Serializes an AST tree back into human-readable, clean indented .mdx.
 */
export function serializeAstToMdx(nodes: MdxNode[], depth = 0): string {
  const indent = '  '.repeat(depth);
  const chunks: string[] = [];

  for (const node of nodes) {
    if (!node) continue;
    if (node.type === 'Text') {
      if (node.content) {
        const textLines = node.content
          .split('\n')
          .map((l) => indent + l)
          .join('\n');
        chunks.push(textLines);
      }
      continue;
    }

    const propParts: string[] = [];
    for (const [k, v] of Object.entries(node.props || {})) {
      if (v === true) {
        propParts.push(k);
      } else if (typeof v === 'number' || typeof v === 'boolean') {
        propParts.push(`${k}={${v}}`);
      } else if (typeof v === 'string') {
        propParts.push(`${k}="${v}"`);
      }
    }
    const propStr = propParts.length > 0 ? ' ' + propParts.join(' ') : '';

    const hasChildren =
      Array.isArray(node.children) && node.children.length > 0;
    if (!hasChildren) {
      chunks.push(`${indent}<${node.type}${propStr} />`);
    } else {
      chunks.push(`${indent}<${node.type}${propStr}>`);
      const childMdx = serializeAstToMdx(node.children!, depth + 1);
      if (childMdx) {
        chunks.push(childMdx);
      }
      chunks.push(`${indent}</${node.type}>`);
    }
  }

  return chunks.join('\n');
}

/**
 * Deep clones an AST tree.
 */
export function cloneAst(nodes: MdxNode[]): MdxNode[] {
  return JSON.parse(JSON.stringify(nodes));
}

/**
 * Finds a node by ID and its parent in the AST.
 */
export function findNodeById(
  nodes: MdxNode[],
  id: string,
  parent: MdxNode | null = null,
): { node: MdxNode; parent: MdxNode | null; index: number } | null {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (!n) continue;
    if (n.id === id) {
      return { node: n, parent, index: i };
    }
    if (n.children && n.children.length > 0) {
      const found = findNodeById(n.children, id, n);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Removes a node by ID from the AST.
 */
export function removeNodeFromAst(
  nodes: MdxNode[],
  id: string,
): { ast: MdxNode[]; removed: MdxNode | null } {
  const ast = cloneAst(nodes);
  let removed: MdxNode | null = null;

  function walk(list: MdxNode[]): boolean {
    const idx = list.findIndex((n) => n.id === id);
    if (idx !== -1) {
      removed = list.splice(idx, 1)[0] ?? null;
      return true;
    }
    for (const item of list) {
      if (item.children && walk(item.children)) return true;
    }
    return false;
  }

  walk(ast);
  return { ast, removed };
}

/**
 * Moves a node to a target container at an optional index.
 */
export function moveNodeInAst(
  nodes: MdxNode[],
  sourceId: string,
  targetContainerId: string,
  targetIndex?: number,
): MdxNode[] {
  const { ast, removed } = removeNodeFromAst(nodes, sourceId);
  if (!removed) return nodes;

  function insertInto(list: MdxNode[]): boolean {
    for (const item of list) {
      if (item.id === targetContainerId) {
        if (!item.children) item.children = [];
        if (
          targetIndex !== undefined &&
          targetIndex >= 0 &&
          targetIndex <= item.children.length
        ) {
          item.children.splice(targetIndex, 0, removed!);
        } else {
          item.children.push(removed!);
        }
        return true;
      }
      if (item.children && insertInto(item.children)) return true;
    }
    return false;
  }

  insertInto(ast);
  return ast;
}

/**
 * Adds a new node into a target container at an optional index.
 */
export function addNodeToAst(
  nodes: MdxNode[],
  targetContainerId: string,
  newNode: MdxNode,
  targetIndex?: number,
): MdxNode[] {
  const ast = cloneAst(nodes);

  function insert(list: MdxNode[]): boolean {
    for (const item of list) {
      if (item.id === targetContainerId) {
        if (!item.children) item.children = [];
        if (
          targetIndex !== undefined &&
          targetIndex >= 0 &&
          targetIndex <= item.children.length
        ) {
          item.children.splice(targetIndex, 0, newNode);
        } else {
          item.children.push(newNode);
        }
        return true;
      }
      if (item.children && insert(item.children)) return true;
    }
    return false;
  }

  insert(ast);
  return ast;
}

/**
 * Reorders a node within its sibling list (e.g. Move Left/Right or Up/Down).
 */
export function reorderSiblingNode(
  nodes: MdxNode[],
  nodeId: string,
  direction: 'up' | 'down',
): MdxNode[] {
  const ast = cloneAst(nodes);
  const found = findNodeById(ast, nodeId);
  if (!found) return nodes;

  const list = found.parent ? found.parent.children! : ast;
  const currIdx = found.index;
  const targetIdx = direction === 'up' ? currIdx - 1 : currIdx + 1;

  if (targetIdx < 0 || targetIdx >= list.length) return nodes;

  const currItem = list[currIdx];
  const targetItem = list[targetIdx];
  if (!currItem || !targetItem) return nodes;

  list[currIdx] = targetItem;
  list[targetIdx] = currItem;

  return ast;
}

/**
 * Updates props of a specific node in the AST.
 */
export function updateNodePropsInAst(
  nodes: MdxNode[],
  nodeId: string,
  propsPatch: Record<string, any>,
): MdxNode[] {
  const ast = cloneAst(nodes);
  const found = findNodeById(ast, nodeId);
  if (found) {
    found.node.props = { ...found.node.props, ...propsPatch };
  }
  return ast;
}

/**
 * Updates the children array of a specific node (e.g. reordered items in a Grid).
 */
export function updateNodeChildrenInAst(
  nodes: MdxNode[],
  nodeId: string,
  newChildren: MdxNode[],
): MdxNode[] {
  const ast = cloneAst(nodes);
  const found = findNodeById(ast, nodeId);
  if (found) {
    found.node.children = cloneAst(newChildren);
  }
  return ast;
}
