import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { DigestArchive } from '../../../src/archive/index';
import { ArchiveConfig } from '../../../src/types';
import { DigestRecord } from '../../../src/repositories/digestRepo';

// Mock fs module
vi.mock('fs');

function makeMockDigestRepo() {
  return {
    create: vi.fn(),
    getById: vi.fn(),
    getAll: vi.fn().mockReturnValue([]),
    getLatest: vi.fn(),
    updateArchiveUrl: vi.fn(),
    delete: vi.fn(),
  };
}

const archiveConfig: ArchiveConfig = {
  type: 'file',
  basePath: './test-archive',
  retentionMonths: 12,
};

describe('DigestArchive', () => {
  let repo: ReturnType<typeof makeMockDigestRepo>;
  let archive: DigestArchive;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = makeMockDigestRepo();
    archive = new DigestArchive(archiveConfig, repo as any);
  });

  describe('archive()', () => {
    it('should write HTML to disk and update DB archive URL', async () => {
      const html = '<html><body>Digest content</body></html>';
      const digestId = 'digest-123';
      const publishedAt = new Date('2024-06-15');

      const url = await archive.archive(html, digestId, publishedAt);

      expect(url).toBe('./test-archive/digest-123.html');
      expect(fs.mkdirSync).toHaveBeenCalledWith('./test-archive', { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join('./test-archive', 'digest-123.html'),
        html,
        'utf-8',
      );
      expect(repo.updateArchiveUrl).toHaveBeenCalledWith(digestId, url);
    });

    it('should handle file write errors gracefully (log, not throw)', async () => {
      vi.mocked(fs.writeFileSync).mockImplementation(() => {
        throw new Error('Disk full');
      });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const url = await archive.archive('<html></html>', 'digest-fail', new Date());

      // Should still return the URL
      expect(url).toBe('./test-archive/digest-fail.html');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to archive digest digest-fail'),
        expect.any(Error),
      );
      // Should NOT have updated the DB since write failed
      expect(repo.updateArchiveUrl).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('listArchive()', () => {
    it('should return digests ordered by publication date descending', () => {
      const digests: DigestRecord[] = [
        {
          id: 'd3',
          publishedAt: new Date('2024-06-15'),
          editorialIntro: 'intro3',
          totalArticleCount: 10,
          categoryCount: 3,
          periodStart: new Date('2024-06-10'),
          periodEnd: new Date('2024-06-15'),
          htmlContent: '<html>3</html>',
          plainTextContent: 'text3',
          archiveUrl: './test-archive/d3.html',
        },
        {
          id: 'd2',
          publishedAt: new Date('2024-06-10'),
          editorialIntro: 'intro2',
          totalArticleCount: 8,
          categoryCount: 2,
          periodStart: new Date('2024-06-05'),
          periodEnd: new Date('2024-06-10'),
          htmlContent: '<html>2</html>',
          plainTextContent: 'text2',
          archiveUrl: './test-archive/d2.html',
        },
      ];
      repo.getAll.mockReturnValue(digests);

      const result = archive.listArchive();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('d3');
      expect(result[1].id).toBe('d2');
      expect(result[0].publishedAt).toEqual(new Date('2024-06-15'));
      expect(result[0].archiveUrl).toBe('./test-archive/d3.html');
    });

    it('should return empty list when no digests exist', () => {
      repo.getAll.mockReturnValue([]);
      expect(archive.listArchive()).toEqual([]);
    });
  });

  describe('getArchivedDigest()', () => {
    it('should read and return HTML content from disk', () => {
      const expectedHtml = '<html><body>Archived digest</body></html>';
      vi.mocked(fs.readFileSync).mockReturnValue(expectedHtml);

      const result = archive.getArchivedDigest('digest-123');

      expect(result).toBe(expectedHtml);
      expect(fs.readFileSync).toHaveBeenCalledWith(
        path.join('./test-archive', 'digest-123.html'),
        'utf-8',
      );
    });

    it('should return null when file does not exist', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('ENOENT: no such file');
      });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = archive.getArchivedDigest('nonexistent');

      expect(result).toBeNull();
      consoleSpy.mockRestore();
    });
  });

  describe('cleanupOldDigests()', () => {
    it('should delete digests older than retention period', () => {
      const now = new Date();
      const oldDate = new Date();
      oldDate.setMonth(oldDate.getMonth() - 13); // 13 months ago

      const recentDate = new Date();
      recentDate.setMonth(recentDate.getMonth() - 6); // 6 months ago

      const digests: DigestRecord[] = [
        {
          id: 'recent',
          publishedAt: recentDate,
          editorialIntro: 'intro',
          totalArticleCount: 5,
          categoryCount: 2,
          periodStart: recentDate,
          periodEnd: recentDate,
          htmlContent: '<html></html>',
          plainTextContent: 'text',
          archiveUrl: './test-archive/recent.html',
        },
        {
          id: 'old',
          publishedAt: oldDate,
          editorialIntro: 'intro',
          totalArticleCount: 5,
          categoryCount: 2,
          periodStart: oldDate,
          periodEnd: oldDate,
          htmlContent: '<html></html>',
          plainTextContent: 'text',
          archiveUrl: './test-archive/old.html',
        },
      ];
      repo.getAll.mockReturnValue(digests);
      vi.mocked(fs.existsSync).mockReturnValue(true);

      archive.cleanupOldDigests();

      // Should only delete the old digest
      expect(fs.unlinkSync).toHaveBeenCalledTimes(1);
      expect(fs.unlinkSync).toHaveBeenCalledWith(
        path.join('./test-archive', 'old.html'),
      );
      expect(repo.delete).toHaveBeenCalledTimes(1);
      expect(repo.delete).toHaveBeenCalledWith('old');
    });

    it('should handle missing files gracefully during cleanup', () => {
      const oldDate = new Date();
      oldDate.setMonth(oldDate.getMonth() - 13);

      repo.getAll.mockReturnValue([
        {
          id: 'old',
          publishedAt: oldDate,
          editorialIntro: 'intro',
          totalArticleCount: 5,
          categoryCount: 2,
          periodStart: oldDate,
          periodEnd: oldDate,
          htmlContent: '<html></html>',
          plainTextContent: 'text',
          archiveUrl: null,
        },
      ]);
      vi.mocked(fs.existsSync).mockReturnValue(false);

      // Should not throw
      archive.cleanupOldDigests();

      expect(fs.unlinkSync).not.toHaveBeenCalled();
      expect(repo.delete).toHaveBeenCalledWith('old');
    });
  });
});
