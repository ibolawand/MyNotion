import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { NoteService } from './NoteService';
import { Folder } from '../model/models';

describe('Folders: rename and recolour', () => {
  let service: NoteService;
  let sent: any[];
  let before: unknown;
  const math: Folder = { id: 3, name: 'Math', colour: '#4ade80', parentID: null, userID: 1 };

  beforeEach(() => {
    sent = [];
    before = (window as any).electronAPI;
    (window as any).electronAPI = { folder: { updateFolder: async (f: any) => { sent.push(f); return { ok: true }; } } };
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    service = TestBed.inject(NoteService);
  });
  afterEach(() => { (window as any).electronAPI = before; });

  it('saves the new name and colour and tells everyone', async () => {
    let told = 0;
    service.folderChanged$.subscribe(() => told++);
    const saved = await service.updateFolder({ ...math, name: ' Maths ', colour: '#ef4444' });
    expect(sent).toEqual([{ id: 3, name: 'Maths', colour: '#ef4444' }]);
    expect(saved.name).toBe('Maths');
    expect(told).toBe(1);
  });

  it('an empty name changes nothing', async () => {
    const saved = await service.updateFolder({ ...math, name: '   ' });
    expect(sent).toEqual([]);
    expect(saved.name).toBe('   ');
  });
});
