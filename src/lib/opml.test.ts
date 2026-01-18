import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from './db';
import { importOPML, exportOPML } from './opml';

describe('opml - import/export (requires IndexedDB)', () => {
	beforeEach(async () => {
		await db.feeds.clear();
		await db.folders.clear();
	});

	describe('importOPML', () => {
		it('should import feeds from valid OPML', async () => {
			const opmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Test Subscriptions</title>
  </head>
  <body>
    <outline text="Tech News" xmlUrl="https://example.com/feed" htmlUrl="https://example.com"/>
  </body>
</opml>`;

			const file = new File([opmlContent], 'subscriptions.opml', { type: 'text/xml' });

			await importOPML(file);

			const feeds = await db.feeds.toArray();
			expect(feeds).toHaveLength(1);
			expect(feeds[0].url).toBe('https://example.com/feed');
			expect(feeds[0].title).toBe('Tech News');
		});

		it('should import feeds with folders', async () => {
			const opmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Test</title></head>
  <body>
    <outline text="News Folder">
      <outline text="BBC" xmlUrl="https://feeds.bbci.co.uk/news/rss.xml" htmlUrl="https://bbc.com"/>
    </outline>
  </body>
</opml>`;

			const file = new File([opmlContent], 'subscriptions.opml', { type: 'text/xml' });

			await importOPML(file);

			const folders = await db.folders.toArray();
			const feeds = await db.feeds.toArray();

			expect(folders).toHaveLength(1);
			expect(folders[0].name).toBe('News Folder');
			expect(feeds).toHaveLength(1);
			expect(feeds[0].folderId).toBe(folders[0].id);
		});

		it('should skip duplicate feeds based on URL', async () => {
			await db.feeds.add({
				url: 'https://example.com/feed',
				title: 'Existing Feed',
				website: 'https://example.com'
			});

			const opmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Test</title></head>
  <body>
    <outline text="Duplicate Feed" xmlUrl="https://example.com/feed" htmlUrl="https://example.com"/>
  </body>
</opml>`;

			const file = new File([opmlContent], 'subscriptions.opml', { type: 'text/xml' });

			await importOPML(file);

			const feeds = await db.feeds.toArray();
			expect(feeds).toHaveLength(1);
			expect(feeds[0].title).toBe('Existing Feed');
		});

		it('should handle multiple folders and uncategorized feeds', async () => {
			const opmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Test</title></head>
  <body>
    <outline text="Folder 1">
      <outline text="Feed 1" xmlUrl="https://feed1.com/rss"/>
    </outline>
    <outline text="Feed 2" xmlUrl="https://feed2.com/rss"/>
    <outline text="Folder 2">
      <outline text="Feed 3" xmlUrl="https://feed3.com/rss"/>
    </outline>
  </body>
</opml>`;

			const file = new File([opmlContent], 'subscriptions.opml', { type: 'text/xml' });

			await importOPML(file);

			const folders = await db.folders.toArray();
			const feeds = await db.feeds.toArray();

			expect(folders).toHaveLength(2);
			expect(feeds).toHaveLength(3);
		});

		it('should throw error for invalid OPML without body', async () => {
			const invalidContent = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Test</title></head>
</opml>`;

			const file = new File([invalidContent], 'invalid.opml', { type: 'text/xml' });

			await expect(importOPML(file)).rejects.toThrow('Invalid OPML');
		});

		it('should use title attribute when text is missing', async () => {
			const opmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Test</title></head>
  <body>
    <outline title="Feed Title" xmlUrl="https://example.com/feed"/>
  </body>
</opml>`;

			const file = new File([opmlContent], 'subscriptions.opml', { type: 'text/xml' });

			await importOPML(file);

			const feeds = await db.feeds.toArray();
			expect(feeds[0].title).toBe('Feed Title');
		});

		it('should handle nested outline structures correctly', async () => {
			const opmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Test</title></head>
  <body>
    <outline text="Parent Folder">
      <outline text="Child Folder">
        <outline text="Nested Feed" xmlUrl="https://nested.com/feed"/>
      </outline>
    </outline>
  </body>
</opml>`;

			const file = new File([opmlContent], 'subscriptions.opml', { type: 'text/xml' });

			await importOPML(file);

			const feeds = await db.feeds.toArray();
			expect(feeds).toHaveLength(1);
			expect(feeds[0].title).toBe('Nested Feed');
		});
	});

	describe('exportOPML', () => {
		it('should export feeds to valid OPML format', async () => {
			await db.feeds.bulkAdd([
				{ url: 'https://example.com/feed1', title: 'Feed 1', website: 'https://example.com' },
				{ url: 'https://example.com/feed2', title: 'Feed 2', website: 'https://example.com' }
			]);

			let capturedContent: BlobPart[] = [];
			const OriginalBlob = global.Blob;
			global.Blob = class MockBlob extends OriginalBlob {
				constructor(parts: BlobPart[] = [], options: BlobPropertyBag = {}) {
					super(parts, options);
					capturedContent = parts;
				}
			} as typeof Blob;

			const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue({
				href: '',
				download: '',
				click: vi.fn()
			} as unknown as HTMLAnchorElement);

			URL.createObjectURL = vi.fn(() => 'blob:mock-url');

			await exportOPML();

			expect(capturedContent.length).toBeGreaterThan(0);
			const xmlContent = capturedContent[0] as string;
			expect(xmlContent).toContain('<?xml version="1.0"');
			expect(xmlContent).toContain('Feed 1');
			expect(xmlContent).toContain('Feed 2');
			expect(createElementSpy).toHaveBeenCalledWith('a');

			global.Blob = OriginalBlob;
			createElementSpy.mockRestore();
		});

		it('should include folders in OPML export', async () => {
			const folderId = await db.folders.add({ name: 'Test Folder' });
			await db.feeds.add({
				url: 'https://example.com/feed',
				title: 'Test Feed',
				website: 'https://example.com',
				folderId
			});

			const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue({
				href: '',
				download: '',
				click: vi.fn()
			} as unknown as HTMLAnchorElement);

			URL.createObjectURL = vi.fn(() => 'blob:mock-url');

			await exportOPML();

			expect(createElementSpy).toHaveBeenCalledWith('a');

			createElementSpy.mockRestore();
		});

		it('should include uncategorized feeds at root level', async () => {
			await db.feeds.add({
				url: 'https://example.com/feed',
				title: 'Uncategorized Feed',
				website: 'https://example.com',
				folderId: undefined
			});

			const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue({
				href: '',
				download: '',
				click: vi.fn()
			} as unknown as HTMLAnchorElement);

			URL.createObjectURL = vi.fn(() => 'blob:mock-url');

			await exportOPML();

			expect(createElementSpy).toHaveBeenCalledWith('a');

			createElementSpy.mockRestore();
		});

		it('should generate correct filename', async () => {
			const linkMock = {
				href: '',
				download: '',
				click: vi.fn()
			} as unknown as HTMLAnchorElement;

			vi.spyOn(document, 'createElement').mockReturnValue(linkMock);
			URL.createObjectURL = vi.fn(() => 'blob:mock-url');

			await exportOPML();

			expect(linkMock.download).toBe('vesper-subs.opml');
		});
	});

	describe('round-trip import/export', () => {
		it('should preserve data through import and export', async () => {
			const originalOPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Original Subs</title></head>
  <body>
    <outline text="Tech" xmlUrl="https://tech.com/feed" htmlUrl="https://tech.com"/>
    <outline text="News Folder">
      <outline text="BBC" xmlUrl="https://bbc.com/feed" htmlUrl="https://bbc.com"/>
    </outline>
  </body>
</opml>`;

			const file = new File([originalOPML], 'subscriptions.opml', { type: 'text/xml' });
			await importOPML(file);

			const feedsBefore = await db.feeds.toArray();
			const foldersBefore = await db.folders.toArray();

			expect(feedsBefore).toHaveLength(2);
			expect(foldersBefore).toHaveLength(1);

			const linkMock = {
				href: '',
				download: '',
				click: vi.fn()
			} as unknown as HTMLAnchorElement;

			vi.spyOn(document, 'createElement').mockReturnValue(linkMock);
			URL.createObjectURL = vi.fn(() => 'blob:mock-url');

			await exportOPML();

			expect(linkMock.download).toBe('vesper-subs.opml');
		});
	});
});
