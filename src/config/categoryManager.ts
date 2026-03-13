import * as fs from 'fs';
import type { CoverageCategory } from '../types';

/**
 * Manages coverage categories at runtime with optional file persistence.
 * When categories are added or removed, changes are reflected in-memory immediately
 * and optionally persisted to a JSON config file.
 */
export class CategoryManager {
  private categories: CoverageCategory[];
  private configPath?: string;

  constructor(categories: CoverageCategory[], configPath?: string) {
    this.categories = [...categories];
    this.configPath = configPath;
  }

  /**
   * Add a coverage category. Persists to config file if a path was provided.
   */
  addCategory(category: CoverageCategory): void {
    const existing = this.categories.find((c) => c.id === category.id);
    if (existing) {
      return;
    }
    this.categories.push(category);
    if (this.configPath) {
      this.persistToFile(this.configPath);
    }
  }

  /**
   * Remove a coverage category by ID. Persists to config file if a path was provided.
   */
  removeCategory(categoryId: string): void {
    const index = this.categories.findIndex((c) => c.id === categoryId);
    if (index === -1) {
      return;
    }
    this.categories.splice(index, 1);
    if (this.configPath) {
      this.persistToFile(this.configPath);
    }
  }

  /**
   * Return all categories (enabled and disabled).
   */
  getCategories(): CoverageCategory[] {
    return [...this.categories];
  }

  /**
   * Return only enabled categories.
   */
  getEnabledCategories(): CoverageCategory[] {
    return this.categories.filter((c) => c.enabled);
  }

  /**
   * Write the current categories to a JSON config file.
   */
  persistToFile(configPath: string): void {
    const data = JSON.stringify(this.categories, null, 2);
    fs.writeFileSync(configPath, data, 'utf-8');
  }

  /**
   * Load categories from a JSON config file, replacing the in-memory list.
   */
  loadFromFile(configPath: string): void {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const loaded = JSON.parse(raw) as CoverageCategory[];
    this.categories = loaded;
    this.configPath = configPath;
  }
}
