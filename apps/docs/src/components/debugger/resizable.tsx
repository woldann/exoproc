'use client';

import dynamic from 'next/dynamic';

/**
 * `react-resizable-panels` is client-only, so every debugger surface loads it
 * through the same dynamic wrappers instead of re-declaring them per file.
 */
export const ResizableGroup = dynamic(
  () => import('react-resizable-panels').then((mod) => mod.Group),
  { ssr: false },
) as unknown as typeof import('react-resizable-panels').Group;

export const ResizablePanel = dynamic(
  () => import('react-resizable-panels').then((mod) => mod.Panel),
  { ssr: false },
) as unknown as typeof import('react-resizable-panels').Panel;

export const ResizableSeparator = dynamic(
  () => import('react-resizable-panels').then((mod) => mod.Separator),
  { ssr: false },
) as unknown as typeof import('react-resizable-panels').Separator;
