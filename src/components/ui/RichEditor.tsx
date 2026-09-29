import { useEditor, useEditorState, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { useEffect, type ReactNode } from 'react';
import {
  Bold,
  Code,
  Italic,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Table as TableIcon,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignStart,
  Underline,
  Undo2,
} from 'lucide-react';

interface Props {
  value: string;
  onChange: (html: string) => void;
}

function ToolbarBtn({ onClick, active, disabled, title, children }: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      // mousedown keeps the editor's selection; a click would move focus first.
      onMouseDown={(e) => { e.preventDefault(); if (!disabled) onClick(); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!disabled) onClick(); } }}
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      className={`inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-md border-none px-2 text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:size-4 ${
        active
          ? 'bg-[var(--ink-blue-solid)] text-white'
          : 'bg-transparent text-[var(--text-primary)] hover:bg-[var(--bg-card)]'
      }`}
    >
      {children}
    </button>
  );
}

const Divider = () => <div aria-hidden="true" className="mx-1 h-5 w-px bg-[var(--border-color)]" />;

// What the toolbar shows. Read through useEditorState: in Tiptap 3 the editor no
// longer re-renders the component on every change, so reading isActive() in
// render would leave the buttons stuck on the state they had at first paint.
function readToolbarState(editor: Editor) {
  return {
    block: editor.isActive('heading', { level: 1 }) ? '1'
      : editor.isActive('heading', { level: 2 }) ? '2'
      : editor.isActive('heading', { level: 3 }) ? '3'
      : '0',
    bold: editor.isActive('bold'),
    italic: editor.isActive('italic'),
    underline: editor.isActive('underline'),
    strike: editor.isActive('strike'),
    code: editor.isActive('code'),
    bulletList: editor.isActive('bulletList'),
    orderedList: editor.isActive('orderedList'),
    blockquote: editor.isActive('blockquote'),
    alignLeft: editor.isActive({ textAlign: 'left' }),
    alignCenter: editor.isActive({ textAlign: 'center' }),
    alignRight: editor.isActive({ textAlign: 'right' }),
    inTable: editor.isActive('table'),
    canUndo: editor.can().undo(),
    canRedo: editor.can().redo(),
  };
}

export function RichEditor({ value, onChange }: Props) {
  const editor = useEditor({
    extensions: [
      // StarterKit 3 already includes Underline and Link.
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: value || '',
    editorProps: {
      // The same .article rules as the published post, so what is typed here is what readers see.
      attributes: { class: 'article min-h-[260px] px-4 py-3 outline-none', 'aria-label': 'Article text' },
    },
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
  });

  const state = useEditorState({ editor, selector: ({ editor: e }) => (e ? readToolbarState(e) : null) });

  // Sync external value changes (e.g. when editing existing post)
  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== value) {
      editor.commands.setContent(value || '');
    }
  }, [value, editor]);

  if (!editor || !state) return null;

  const run = () => editor.chain().focus();

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)]">
      {/* Toolbar */}
      <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 border-b border-[var(--border-color)] bg-[var(--bg-subtle)] px-2 py-1.5">
        <select
          name="text-style"
          autoComplete="off"
          aria-label="Text style"
          className="mr-1 h-8 cursor-pointer rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-2 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          value={state.block}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v === 0) run().setParagraph().run();
            else run().setHeading({ level: v as 1 | 2 | 3 }).run();
          }}
        >
          <option value="0">Paragraph</option>
          <option value="1">Heading 1</option>
          <option value="2">Heading 2</option>
          <option value="3">Heading 3</option>
        </select>

        <Divider />

        <ToolbarBtn onClick={() => run().toggleBold().run()} active={state.bold} title="Bold (Ctrl+B)"><Bold aria-hidden /></ToolbarBtn>
        <ToolbarBtn onClick={() => run().toggleItalic().run()} active={state.italic} title="Italic (Ctrl+I)"><Italic aria-hidden /></ToolbarBtn>
        <ToolbarBtn onClick={() => run().toggleUnderline().run()} active={state.underline} title="Underline (Ctrl+U)"><Underline aria-hidden /></ToolbarBtn>
        <ToolbarBtn onClick={() => run().toggleStrike().run()} active={state.strike} title="Strikethrough"><Strikethrough aria-hidden /></ToolbarBtn>
        <ToolbarBtn onClick={() => run().toggleCode().run()} active={state.code} title="Inline code"><Code aria-hidden /></ToolbarBtn>

        <Divider />

        <ToolbarBtn onClick={() => run().toggleBulletList().run()} active={state.bulletList} title="Bullet list"><List aria-hidden /></ToolbarBtn>
        <ToolbarBtn onClick={() => run().toggleOrderedList().run()} active={state.orderedList} title="Numbered list"><ListOrdered aria-hidden /></ToolbarBtn>
        <ToolbarBtn onClick={() => run().toggleBlockquote().run()} active={state.blockquote} title="Quote"><Quote aria-hidden /></ToolbarBtn>

        <Divider />

        <ToolbarBtn onClick={() => run().setTextAlign('left').run()} active={state.alignLeft} title="Align left"><TextAlignStart aria-hidden /></ToolbarBtn>
        <ToolbarBtn onClick={() => run().setTextAlign('center').run()} active={state.alignCenter} title="Center"><TextAlignCenter aria-hidden /></ToolbarBtn>
        <ToolbarBtn onClick={() => run().setTextAlign('right').run()} active={state.alignRight} title="Align right"><TextAlignEnd aria-hidden /></ToolbarBtn>

        <Divider />

        <ToolbarBtn
          onClick={() => run().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          disabled={state.inTable}
          title="Insert table"
        >
          <TableIcon aria-hidden /> Table
        </ToolbarBtn>
        <ToolbarBtn onClick={() => run().setHorizontalRule().run()} title="Horizontal line"><Minus aria-hidden /> Line</ToolbarBtn>

        <Divider />

        <ToolbarBtn onClick={() => run().undo().run()} disabled={!state.canUndo} title="Undo (Ctrl+Z)"><Undo2 aria-hidden /></ToolbarBtn>
        <ToolbarBtn onClick={() => run().redo().run()} disabled={!state.canRedo} title="Redo (Ctrl+Shift+Z)"><Redo2 aria-hidden /></ToolbarBtn>
      </div>

      {/* Table tools, shown only while the cursor is inside a table. */}
      {state.inTable && (
        <div role="toolbar" aria-label="Table" className="flex flex-wrap items-center gap-0.5 border-b border-[var(--border-color)] bg-[var(--bg-subtle)] px-2 py-1">
          <span className="mr-1 px-1 text-xs font-semibold text-[var(--text-secondary)]">Table</span>
          <ToolbarBtn onClick={() => run().addRowAfter().run()} title="Add row below">+ Row</ToolbarBtn>
          <ToolbarBtn onClick={() => run().addColumnAfter().run()} title="Add column to the right">+ Column</ToolbarBtn>
          <ToolbarBtn onClick={() => run().deleteRow().run()} title="Delete this row">− Row</ToolbarBtn>
          <ToolbarBtn onClick={() => run().deleteColumn().run()} title="Delete this column">− Column</ToolbarBtn>
          <ToolbarBtn onClick={() => run().toggleHeaderRow().run()} title="Turn the header row on or off">Header row</ToolbarBtn>
          <Divider />
          <ToolbarBtn onClick={() => run().deleteTable().run()} title="Delete table">
            <span className="text-red-600 dark:text-red-400">Delete table</span>
          </ToolbarBtn>
        </div>
      )}

      <EditorContent editor={editor} />
    </div>
  );
}
