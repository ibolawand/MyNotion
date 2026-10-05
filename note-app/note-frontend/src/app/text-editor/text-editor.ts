import { Component, OnInit, OnDestroy } from '@angular/core';
import { NoteService } from '../../services/NoteService';
import { FormsModule } from '@angular/forms';
import { AsyncPipe } from '@angular/common';
import { Subscription } from 'rxjs';
import { Note, ToolbarFormat, ToolbarHeading, ToolbarHighlight, ToolbarList } from '../../model/models';
import { ModelService } from '../model.service';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import Underline from '@tiptap/extension-underline';
import { TiptapEditorDirective } from 'ngx-tiptap';

@Component({
  selector: 'text-editor',
  standalone: true,
  imports: [
    FormsModule,
    TiptapEditorDirective
  ],
  templateUrl: './text-editor.html',
  styleUrl: './text-editor.css'
})
export class TextEditor implements OnInit, OnDestroy {
  title: string = '';
  content: string = '';
  currentNote: Note | null = null;
  private noteSub?: Subscription;

  editor = new Editor({
    extensions: [StarterKit],
  });

  textFormats: ToolbarFormat[] = [
    { command: 'toggleBold', label: 'B', title: 'Bold', checkActive: 'bold' },
    { command: 'toggleItalic', label: 'I', title: 'Italic', checkActive: 'italic' },
    { command: 'toggleUnderline', label: 'U', title: 'Underline', checkActive: 'underline' },
    { command: 'toggleStrike', label: 'S', title: 'Strikethrough', checkActive: 'strike' }
  ];

  headings: ToolbarHeading[] = [
    { level: 1, label: 'H1', title: 'Heading 1' },
    { level: 2, label: 'H2', title: 'Heading 2' },
    { level: 3, label: 'H3', title: 'Heading 3' }
  ];

  lists: ToolbarList[] = [
    { command: 'toggleBulletList', icon: '• List', title: 'Bullet List', checkActive: 'bulletList' },
    { command: 'toggleOrderedList', icon: '1. List', title: 'Numbered List', checkActive: 'orderedList' }
  ];

  highlights: ToolbarHighlight[] = [
    { color: '#ffeb3b', label: 'Yellow' },
    { color: '#4caf50', label: 'Green' },
    { color: '#f44336', label: 'Red' }
  ];

  constructor(
    protected modelService: ModelService,
    protected noteService: NoteService
  ) { }

  ngOnInit(): void {
    // Initialize TipTap editor
    this.editor = new Editor({
      extensions: [
        StarterKit,
        TextStyle,
        Color,
        Underline,
        Highlight.configure({ multicolor: true })
      ],
      content: '',
      editorProps: {
        attributes: {
          class: 'tiptap-editor-content'
        }
      },
      onUpdate: ({ editor }) => {
        if (this.currentNote) {
          this.currentNote.content = editor.getHTML();
          this.modelService.updateCurrentNote(this.currentNote);
          this.noteService.triggerAutoSave(this.currentNote);
        }
      }
    });

    // Subscribe to current selected note
    this.noteSub = this.modelService.currentNote$.subscribe((note: Note | null) => {
      if (note) {
        this.currentNote = note;
        this.title = note.title ?? '';
        this.content = note.content ?? '';

        // Load content into TipTap editor
        this.editor.commands.setContent(note.content ?? '');
      } else {
        this.currentNote = null;
        this.title = '';
        this.content = '';
        this.editor.commands.clearContent?.();
      }
    });
  }

  ngOnDestroy(): void {
    this.noteSub?.unsubscribe();
    this.editor?.destroy();
  }

  onTitleChange(value: string) {
    this.title = value;
    if (this.currentNote) {
      this.currentNote.title = value;
      this.noteService.triggerAutoSave(this.currentNote);
    }
  }

  // Generic command execution
  executeCommand(command: string, options?: any) {
    if (options) {
      (this.editor.chain().focus() as any)[command](options).run();
    } else {
      (this.editor.chain().focus() as any)[command]().run();
    }
  }

  isActive(name: string, attributes?: any): boolean {
    return this.editor?.isActive(name, attributes) ?? false;
  }

  setColor(color: string) {
    this.editor.chain().focus().setColor(color).run();
  }

  setHighlight(color: string) {
    this.editor.chain().focus().toggleHighlight({ color }).run();
  }

  getWordCount(): number {
    const text = this.editor?.getText() ?? '';
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  getCharCount(): number {
    return this.editor?.getText().length ?? 0;
  }
}
