import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { useEffect } from 'react';

interface Props {
  value: string;
  onChange: (html: string) => void;
}

function ToolbarBtn({ onClick, active, title, children }: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      title={title}
      className={`px-2 py-1 rounded text-sm font-medium transition-colors cursor-pointer border-none ${
        active
          ? 'bg-[var(--ink-blue)] text-white'
          : 'bg-transparent text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]'
      }`}
    >
      {children}
    </button>
  );
}

export function RichEditor({ value, onChange }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: value || '',
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
  });

  // Sync external value changes (e.g. when editing existing post)
  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== value) {
      editor.commands.setContent(value || '');
    }
  }, [value, editor]);

  if (!editor) return null;

  const insertTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  return (
    <div className="border border-[var(--border-color)] rounded-lg overflow-hidden bg-[var(--bg-card)]">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-[var(--border-color)] bg-[var(--bg-subtle)]">
        {/* Headings */}
        <select
          aria-label="Text style"
          className="text-xs border border-[var(--border-color)] rounded px-1.5 py-1 bg-[var(--bg-card)] text-[var(--text-primary)] cursor-pointer mr-1"
          value={
            editor.isActive('heading', { level: 1 }) ? '1' :
            editor.isActive('heading', { level: 2 }) ? '2' :
            editor.isActive('heading', { level: 3 }) ? '3' : '0'
          }
          onChange={(e) => {
            const v = parseInt(e.target.value);
            if (v === 0) editor.chain().focus().setParagraph().run();
            else editor.chain().focus().toggleHeading({ level: v as 1|2|3 }).run();
          }}
        >
          <option value="0">Paragraph</option>
          <option value="1">Heading 1</option>
          <option value="2">Heading 2</option>
          <option value="3">Heading 3</option>
        </select>

        <div className="w-px h-5 bg-[var(--border-color)] mx-1" />

        <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold (Ctrl+B)">
          <strong>B</strong>
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic (Ctrl+I)">
          <em>I</em>
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline (Ctrl+U)">
          <u>U</u>
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough">
          <s>S</s>
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} title="Inline code">
          {'<>'}
        </ToolbarBtn>

        <div className="w-px h-5 bg-[var(--border-color)] mx-1" />

        <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet list">
          • List
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered list">
          1. List
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Quote">
          " "
        </ToolbarBtn>

        <div className="w-px h-5 bg-[var(--border-color)] mx-1" />

        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Align left">
          ≡L
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Center">
          ≡C
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Align right">
          ≡R
        </ToolbarBtn>

        <div className="w-px h-5 bg-[var(--border-color)] mx-1" />

        <ToolbarBtn onClick={insertTable} title="Insert table">
          ⊞ Table
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal line">
          — HR
        </ToolbarBtn>

        <div className="w-px h-5 bg-[var(--border-color)] mx-1" />

        <ToolbarBtn onClick={() => editor.chain().focus().undo().run()} title="Undo">↩ Undo</ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().redo().run()} title="Redo">↪ Redo</ToolbarBtn>
      </div>

      {/* Editor area */}
      <EditorContent
        editor={editor}
        className="min-h-[280px] px-4 py-3 prose prose-slate dark:prose-invert max-w-none text-sm [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[260px] [&_table]:border-collapse [&_table]:w-full [&_td]:border [&_td]:border-[var(--border-color)] [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-[var(--border-color)] [&_th]:px-2 [&_th]:py-1 [&_th]:bg-[var(--bg-subtle)] [&_th]:font-semibold"
      />
    </div>
  );
}
