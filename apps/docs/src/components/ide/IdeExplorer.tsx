'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  Files,
  FileText,
  FolderOpen,
  Play,
  RefreshCw,
  Save,
  UploadCloud,
} from 'lucide-react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { CodeEditor } from '@/components/editor/CodeEditor';
import { useService } from '@/platform/instantiation/browser/instantiationService';
import {
  IExplorerService,
  type ExplorerItem,
} from '@/workbench/services/explorer/IExplorerService';
import { IEditorService } from '@/workbench/services/editor/IEditorService';
import { IFileService } from '@/workbench/services/files/IFileService';
import { IOutputService } from '@/workbench/services/output/IOutputService';
import type { DebugSessionValue } from '@/components/debugger/DebugSessionScope';
import { DisassemblyView } from '@/components/debugger/DisassemblyView';
import { DebugToolbar } from '@/components/debugger/Toolbar';
import { IdeBottomPanel } from './IdeBottomPanel';
import { type IdeTerminalHandle } from './IdeTerminalPanel';
import { FileTree, SimulateFolderPicker } from './explorer';

export interface ExplorerView {
  readonly sidebar: ReactNode;
  readonly main: ReactNode;
}

const SEPARATOR_Y_CLASS =
  'relative h-1 shrink-0 bg-[#2b2b2b] outline-none transition-colors hover:bg-[#007acc] focus-visible:bg-[#007acc]';

/**
 * Explorer's sidebar (file tree) and main (editor + terminal) content, as a
 * hook rather than a standalone page component -- `IdeWorkbench` mounts one
 * shared `<Panel id="ide-sidebar">`/`<Panel id="ide-main">` pair for the
 * whole `/ide` route and swaps in whichever view's content is active, so
 * the panels themselves (and their resize state) never remount across a
 * tab switch. See `IdeWorkbench.tsx` for why.
 */
export function useExplorerView(
  debugSession?: DebugSessionValue,
): ExplorerView {
  const service = useService(IExplorerService);
  const editorService = useService(IEditorService);
  const fileService = useService(IFileService);
  const outputService = useService(IOutputService);
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [openingId, setOpeningId] = useState<string>();
  const [zipImporting, setZipImporting] = useState(false);
  const openRequest = useRef(0);
  const terminalRef = useRef<IdeTerminalHandle>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  // No bind-on-mount here anymore (F9): the workspace root is already set
  // by the main process itself during its own boot sequence
  // (`initializeWorkspace()`, kicked off from `exoproc-ide.exe`'s own
  // callback), before the renderer ever gets a chance to ask. The
  // `workspaceReady` gate below already handles "not bound yet" by
  // waiting for `onDidChangeRoot` -- nothing renderer-side needs to
  // proactively bind anything for the default case.

  // Gates the tree so it never resolves children against the placeholder
  // root `IExplorerService` starts with before any workspace is bound --
  // that resolve is guaranteed to fail (nothing to serve yet), a wasted
  // round trip that also briefly showed a stale "Klasör okunamadı" once
  // the real root replaced the placeholder.
  const workspaceReady = useSyncExternalStore(
    (onStoreChange) => fileService.onDidChangeWorkspace(onStoreChange).dispose,
    () => fileService.getWorkspaceInfo() !== undefined,
    () => false,
  );

  const document = useSyncExternalStore(
    (onStoreChange) =>
      editorService.onDidActiveEditorChange(onStoreChange).dispose,
    () => editorService.activeEditor,
    // No document is ever open at SSR time (the service is freshly
    // constructed per request in `ide/layout.tsx`) -- required so React
    // doesn't fall back to client-only rendering for this component.
    () => undefined,
  );
  // Locally edited buffer for the active document. Reset (render-time, same
  // idiom as `SimulateFolderPicker`'s open/close reset -- required by the
  // React Compiler's `set-state-in-effect` rule) only when the *identity*
  // of the open file changes, never when its content does -- so neither a
  // successful save nor an unrelated filesystem refresh (both of which
  // replace `document` with a new object of equal content) clobbers
  // in-progress edits.
  const [draftContent, setDraftContent] = useState<string>();
  const [draftForId, setDraftForId] = useState<string>();
  if (document?.item.id !== draftForId) {
    setDraftForId(document?.item.id);
    setDraftContent(document?.content);
  }
  const isDirty =
    draftContent !== undefined && draftContent !== document?.content;

  // Forces a re-render whenever the explorer tree changes (workspace
  // rebound, filesystem refreshed) -- IExplorerService has no queryable
  // "current value" of its own (just a change event), so this is a plain
  // revision counter rather than useSyncExternalStore. FileTree
  // subscribes to the same event independently for its own subtree.
  const [, setServiceRevision] = useState(0);
  useEffect(() => {
    const subscription = service.onDidChange(() =>
      setServiceRevision((value) => value + 1),
    );
    return () => subscription.dispose();
  }, [service]);

  const openFile = useCallback(
    async (item: ExplorerItem) => {
      if (item.id === document?.item.id) return;
      if (isDirty) {
        const proceed = window.confirm(
          `"${document?.item.name}" için kaydedilmemiş değişiklikler var. Yine de başka bir dosya açılsın mı?`,
        );
        if (!proceed) return;
      }

      const request = ++openRequest.current;
      setOpeningId(item.id);
      setError(undefined);

      try {
        await editorService.openFile(item);
      } catch (cause) {
        if (request !== openRequest.current) return;
        setError(
          cause instanceof Error
            ? cause.message
            : 'Dosya açılırken bilinmeyen bir hata oluştu.',
        );
      } finally {
        if (request === openRequest.current) setOpeningId(undefined);
      }
    },
    [editorService, document, isDirty],
  );

  const saveDocument = useCallback(async () => {
    if (
      !document ||
      draftContent === undefined ||
      draftContent === document.content
    ) {
      return;
    }
    setError(undefined);
    try {
      await editorService.saveActiveEditor(draftContent);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Dosya kaydedilemedi.');
    }
  }, [document, draftContent, editorService]);

  // Standard Ctrl/Cmd+S, wired at the window level (not just while the
  // editor itself has focus) since this is the only editable surface in
  // the workbench right now.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveDocument();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveDocument]);

  const importZipFile = useCallback(
    async (file: File) => {
      setZipImporting(true);
      setError(undefined);
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        await fileService.bindWorkspace({
          type: 'zip',
          name: file.name,
          bytes,
        });
        outputService.append(
          'output',
          `Zip içe aktarıldı: ${file.name}`,
          'success',
        );
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : 'Zip içe aktarılamadı.';
        setError(message);
        outputService.append(
          'output',
          `Zip içe aktarılamadı: ${file.name} — ${message}`,
          'error',
        );
      } finally {
        setZipImporting(false);
      }
    },
    [fileService, outputService],
  );

  const runDocument = useCallback(() => {
    if (!document || !isRunnableJavaScript(document.item.name)) return;
    terminalRef.current?.runCommand(`node "${document.item.path}"`);
  }, [document]);

  // Keeps the open editor's content in sync with the underlying filesystem
  // (e.g. re-running the same script rewrites the file the explorer shows).
  useEffect(() => {
    const subscription = service.onDidChange(() => {
      void editorService.reloadActiveEditor();
    });
    return () => subscription.dispose();
  }, [service, editorService]);

  const sidebar = (
    <>
      <div className="flex h-9 shrink-0 items-center px-5 text-[11px] uppercase tracking-wide text-[#bbbbbb]">
        Gezgin
      </div>
      <div className="flex h-7 shrink-0 items-center border-y border-[#242424] px-2">
        <span
          className="min-w-0 truncate text-[11px] font-semibold uppercase text-[#cccccc]"
          title={service.root.path}
        >
          {service.root.name}
        </span>
        <div className="ml-auto flex shrink-0 items-center">
          <ExplorerAction
            label="Klasör Aç"
            onClick={() => setFolderPickerOpen(true)}
          >
            <FolderOpen aria-hidden="true" className="size-3.5" />
          </ExplorerAction>

          <ExplorerAction
            label={zipImporting ? 'Zip içe aktarılıyor…' : 'Zip İçe Aktar'}
            onClick={() => zipInputRef.current?.click()}
            disabled={zipImporting}
          >
            <UploadCloud aria-hidden="true" className="size-3.5" />
          </ExplorerAction>

          <ExplorerAction label="Yenile" onClick={() => service.refresh()}>
            <RefreshCw aria-hidden="true" className="size-3.5" />
          </ExplorerAction>

          <input
            ref={zipInputRef}
            type="file"
            accept=".zip"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void importZipFile(file);
            }}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {workspaceReady ? (
          <FileTree
            service={service}
            selectedId={document?.item.id}
            onOpenFile={(item) => void openFile(item)}
          />
        ) : (
          <p className="px-5 py-3 text-xs leading-relaxed text-[#8b8b8b]">
            Workspace açılıyor…
          </p>
        )}
      </div>
      <SimulateFolderPicker
        open={folderPickerOpen}
        onCancel={() => setFolderPickerOpen(false)}
      />
    </>
  );

  const main = (
    <Group orientation="vertical" className="flex min-h-0 flex-1 flex-col">
      <Panel id="ide-editor" defaultSize="70" minSize="15">
        <div className="flex h-full min-h-0 flex-col">
          {debugSession ? (
            <>
              <DebugToolbar
                session={debugSession.session}
                tid={debugSession.tid}
                selectedAddress={debugSession.selectedAddress}
              />
              <div className="min-h-0 flex-1">
                <DisassemblyView
                  session={debugSession.session}
                  selectedAddress={debugSession.selectedAddress}
                  onSelectAddress={debugSession.onSelectAddress}
                />
              </div>
            </>
          ) : document ? (
            <>
              <div className="flex h-9 shrink-0 border-b border-[#252525] bg-[#181818]">
                <div className="flex min-w-0 max-w-60 items-center gap-2 border-r border-[#252525] border-t border-t-[#007acc] bg-[#1e1e1e] px-3 text-xs text-white">
                  <FileText
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-[#75beff]"
                  />
                  <span className="truncate" title={document.item.path}>
                    {document.item.name}
                  </span>
                  {isDirty ? (
                    <span
                      aria-label="Kaydedilmemiş değişiklikler"
                      title="Kaydedilmemiş değişiklikler"
                      className="size-2 shrink-0 rounded-full bg-[#cccccc]"
                    />
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => void saveDocument()}
                  disabled={!isDirty}
                  className="ml-auto flex items-center gap-1.5 px-3 text-xs text-[#b8b8b8] hover:bg-[#2a2d2e] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                  title="Kaydet (Ctrl+S)"
                >
                  <Save aria-hidden="true" className="size-3.5" />
                  Kaydet
                </button>
                {isRunnableJavaScript(document.item.name) ? (
                  <button
                    type="button"
                    onClick={runDocument}
                    className="flex items-center gap-1.5 px-3 text-xs text-[#b8b8b8] hover:bg-[#2a2d2e] hover:text-white"
                    title="JavaScript dosyasını terminalde çalıştır"
                  >
                    <Play
                      aria-hidden="true"
                      className="size-3.5 fill-current text-[#89d185]"
                    />
                    Çalıştır
                  </button>
                ) : null}
              </div>
              <div className="flex h-7 shrink-0 items-center border-b border-[#252525] px-4 text-[11px] text-[#8c8c8c]">
                <span className="truncate" title={document.item.path}>
                  {service.root.name.toLocaleUpperCase('tr')} ›{' '}
                  {rootRelativePath(document.item, service.root)}
                </span>
                {openingId ? (
                  <span className="ml-auto pl-3">Açılıyor…</span>
                ) : null}
              </div>
              {error ? (
                <div
                  role="alert"
                  className="border-b border-[#5a1d1d] bg-[#3d1f1f] px-4 py-2 text-xs text-[#f4b8b8]"
                >
                  {error}
                </div>
              ) : null}
              <div className="min-h-0 flex-1 [&>div]:m-0! [&>div]:h-full [&>div]:rounded-none! [&>div]:border-0!">
                <CodeEditor
                  height="100%"
                  path={document.item.path}
                  language={languageForFile(document.item.name)}
                  value={draftContent ?? document.content}
                  onChange={(value) => setDraftContent(value ?? '')}
                  options={{
                    automaticLayout: true,
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                  }}
                />
              </div>
            </>
          ) : (
            <div className="relative flex flex-1 items-center justify-center px-8">
              {error ? (
                <div
                  role="alert"
                  className="absolute inset-x-6 top-6 border border-[#5a1d1d] bg-[#3d1f1f] px-4 py-2 text-xs text-[#f4b8b8]"
                >
                  {error}
                </div>
              ) : null}
              <div className="max-w-sm text-center text-[#8c8c8c]">
                <Files
                  aria-hidden="true"
                  className="mx-auto mb-4 size-14 stroke-1 text-[#555555]"
                />
                <h1 className="mb-2 text-lg font-medium text-[#cccccc]">
                  Exoproc IDE
                </h1>
                <p className="text-sm leading-6">
                  Düzenleyicide görüntülemek için Gezgin&apos;den bir dosya
                  seçin.
                </p>
              </div>
            </div>
          )}
        </div>
      </Panel>

      <Separator className={SEPARATOR_Y_CLASS} />

      <Panel id="ide-terminal" defaultSize="30" minSize="10">
        <IdeBottomPanel terminalRef={terminalRef} />
      </Panel>
    </Group>
  );

  return { sidebar, main };
}

function ExplorerAction({
  label,
  onClick,
  disabled,
  children,
}: {
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="rounded p-1 text-[#a7a7a7] hover:bg-[#2a2d2e] hover:text-white focus-visible:outline-1 focus-visible:outline-[#75beff] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function rootRelativePath(item: ExplorerItem, root: ExplorerItem): string {
  const rootPath = root.path.replace(/\/$/, '');
  const relative = item.path.startsWith(`${rootPath}/`)
    ? item.path.slice(rootPath.length + 1)
    : item.path;
  return relative.split('/').filter(Boolean).join(' › ') || item.name;
}

function isRunnableJavaScript(name: string): boolean {
  return /\.(?:cjs|js|mjs)$/i.test(name);
}

function languageForFile(name: string): string {
  const extension = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  const languages: Record<string, string> = {
    c: 'c',
    cpp: 'cpp',
    css: 'css',
    h: 'c',
    hpp: 'cpp',
    html: 'html',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    md: 'markdown',
    mdx: 'markdown',
    ps1: 'powershell',
    py: 'python',
    rs: 'rust',
    sh: 'shell',
    ts: 'typescript',
    tsx: 'typescript',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
  };
  return languages[extension] ?? 'plaintext';
}
