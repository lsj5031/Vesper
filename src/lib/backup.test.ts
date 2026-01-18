import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from './db';
import { exportBackup, importBackup } from './backup';

describe('backup - export/import (requires IndexedDB)', () => {
	beforeEach(async () => {
		await db.feeds.clear();
		await db.folders.clear();
		await db.articles.clear();
		await db.settings.clear();
	});

	describe('exportBackup', () => {
		it('should export all data as JSON', async () => {
			await db.feeds.bulkAdd([
				{ url: 'https://example.com/feed', title: 'Test Feed', website: 'https://example.com' },
			]);

			const downloadSpy = vi.spyOn(document, 'createElement');
			const linkMock = { href: '', download: '', click: vi.fn() } as unknown as HTMLAnchorElement;
			downloadSpy.mockReturnValue(linkMock);

			URL.createObjectURL = vi.fn(() => 'blob:mock-url');

			await exportBackup();

			expect(downloadSpy).toHaveBeenCalledWith('a');
			expect(linkMock.download).toMatch(/^vesper-backup-\d{4}-\d{2}-\d{2}\.json$/);
			expect(linkMock.click).toHaveBeenCalled();
		});

		it('should include all tables in backup', async () => {
			await db.feeds.add({ url: 'https://example.com/feed', title: 'Test', website: 'https://example.com' });
			await db.folders.add({ name: 'Test Folder' });
			await db.settings.add({ key: 'test', value: 'value' });

			let capturedContent: BlobPart[] = [];
			const OriginalBlob = global.Blob;
			global.Blob = class MockBlob extends OriginalBlob {
				constructor(content: BlobPart[] = [], options: BlobPropertyBag = {}) {
					super(content, options);
					capturedContent = content;
				}
			} as typeof Blob;

			const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue({
				href: '',
				download: '',
				click: vi.fn()
			} as unknown as HTMLAnchorElement);

			URL.createObjectURL = vi.fn(() => 'blob:mock-url');

			await exportBackup();

			expect(capturedContent.length).toBeGreaterThan(0);
			const jsonContent = capturedContent[0] as string;
			const parsed = JSON.parse(jsonContent);
			expect(parsed).toHaveProperty('feeds');
			expect(parsed).toHaveProperty('folders');
			expect(parsed).toHaveProperty('settings');

			global.Blob = OriginalBlob;
			createElementSpy.mockRestore();
		});
	});

	describe('importBackup', () => {
		it('should import feeds from valid backup', async () => {
			const backupData = {
				version: 1,
				timestamp: Date.now(),
				feeds: [
					{ id: 1, url: 'https://example.com/feed', title: 'Test Feed', website: 'https://example.com' },
				],
				folders: [],
				articles: [],
				settings: [],
			};

			const file = new File([JSON.stringify(backupData)], 'backup.json', { type: 'application/json' });

			await importBackup(file);

			const feeds = await db.feeds.toArray();
			expect(feeds).toHaveLength(1);
			expect(feeds[0].title).toBe('Test Feed');
		});

		it('should clear existing data before importing', async () => {
			await db.feeds.add({ url: 'https://old.com/feed', title: 'Old Feed', website: 'https://old.com' });

			const backupData = {
				version: 1,
				timestamp: Date.now(),
				feeds: [
					{ id: 1, url: 'https://new.com/feed', title: 'New Feed', website: 'https://new.com' },
				],
				folders: [],
				articles: [],
				settings: [],
			};

			const file = new File([JSON.stringify(backupData)], 'backup.json', { type: 'application/json' });

			await importBackup(file);

			const feeds = await db.feeds.toArray();
			expect(feeds).toHaveLength(1);
			expect(feeds[0].title).toBe('New Feed');
		});

		it('should throw error for invalid backup', async () => {
			const invalidData = { invalid: 'data' };
			const file = new File([JSON.stringify(invalidData)], 'backup.json', { type: 'application/json' });

			await expect(importBackup(file)).rejects.toThrow('Invalid backup file');
		});

		it('should import articles with correct data', async () => {
			const backupData = {
				version: 1,
				timestamp: Date.now(),
				feeds: [],
				folders: [],
				articles: [
					{
						feedId: 1,
						guid: 'test-guid',
						title: 'Test Article',
						link: 'https://example.com/article',
						content: '<p>Test content</p>',
						isoDate: new Date().toISOString(),
						receivedDate: Date.now(),
						read: 0,
						starred: 0,
					},
				],
				settings: [],
			};

			const file = new File([JSON.stringify(backupData)], 'backup.json', { type: 'application/json' });

			await importBackup(file);

			const articles = await db.articles.toArray();
			expect(articles).toHaveLength(1);
			expect(articles[0].title).toBe('Test Article');
		});
	});
});
