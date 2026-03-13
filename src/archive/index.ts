import * as fs from 'fs';
import * as path from 'path';
import { ArchiveConfig } from '../types';
import { DigestRepo, DigestRecord } from '../repositories/digestRepo';

export interface ArchivedDigestSummary {
  id: string;
  publishedAt: Date;
  archiveUrl: string | null;
}

export class DigestArchive {
  constructor(
    private config: ArchiveConfig,
    private digestRepo: DigestRepo,
  ) {}

  /**
   * Write HTML content to disk at {basePath}/{digestId}.html,
   * update the digest's archiveUrl in DB, and return the URL.
   * Handles file write errors gracefully (logs, doesn't throw).
   */
  async archive(htmlContent: string, digestId: string, publishedAt: Date): Promise<string> {
    const url = `${this.config.basePath}/${digestId}.html`;

    try {
      // Ensure the base directory exists
      fs.mkdirSync(this.config.basePath, { recursive: true });

      const filePath = path.join(this.config.basePath, `${digestId}.html`);
      fs.writeFileSync(filePath, htmlContent, 'utf-8');

      // Update archive URL in the database
      this.digestRepo.updateArchiveUrl(digestId, url);
    } catch (error) {
      console.error(`[DigestArchive] Failed to archive digest ${digestId}:`, error);
      // Don't throw — archive failure must not block email delivery
    }

    return url;
  }

  /**
   * Return list of archived digests ordered by publication date descending.
   */
  listArchive(): ArchivedDigestSummary[] {
    const digests = this.digestRepo.getAll();
    return digests.map((d: DigestRecord) => ({
      id: d.id,
      publishedAt: d.publishedAt,
      archiveUrl: d.archiveUrl,
    }));
  }

  /**
   * Retrieve a specific archived digest's HTML content from disk.
   * Returns null if the file doesn't exist.
   */
  getArchivedDigest(digestId: string): string | null {
    try {
      const filePath = path.join(this.config.basePath, `${digestId}.html`);
      return fs.readFileSync(filePath, 'utf-8');
    } catch (error) {
      console.error(`[DigestArchive] Failed to read archived digest ${digestId}:`, error);
      return null;
    }
  }

  /**
   * Delete archived files older than retentionMonths.
   * Also removes the digest records from the database.
   */
  cleanupOldDigests(): void {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - this.config.retentionMonths);

    const allDigests = this.digestRepo.getAll();

    for (const digest of allDigests) {
      if (digest.publishedAt < cutoff) {
        // Remove the HTML file from disk
        try {
          const filePath = path.join(this.config.basePath, `${digest.id}.html`);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (error) {
          console.error(`[DigestArchive] Failed to delete archived file for digest ${digest.id}:`, error);
        }

        // Remove from database
        try {
          this.digestRepo.delete(digest.id);
        } catch (error) {
          console.error(`[DigestArchive] Failed to delete digest record ${digest.id}:`, error);
        }
      }
    }
  }
}
