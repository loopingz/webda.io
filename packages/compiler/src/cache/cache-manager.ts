import { existsSync, mkdirSync } from "node:fs";
import { FileUtils } from "@webda/utils";
import { useLog } from "@webda/workout";
import { WebdaProject } from "../definition";
import { WebdaCacheData } from "../types";

/**
 * Manages compilation cache for Webda projects
 * Determines if recompilation is needed based on source file changes
 */
export class CacheManager {
  private readonly cacheDir: string;
  private readonly cacheFile: string;

  /** Create a new CacheManager.
   * @param project - the Webda project to manage cache for
   */
  constructor(private project: WebdaProject) {
    this.cacheDir = project.getAppPath(".webda");
    this.cacheFile = project.getAppPath(".webda/cache");
  }

  /**
   * Check if compilation is required based on source digest
   * @returns true if compilation is needed, false otherwise
   */
  requiresCompilation(): boolean {
    this.ensureCacheDirectory();

    if (!existsSync(this.cacheFile)) {
      return true;
    }

    const cache = this.loadCache();
    const currentDigest = this.project.getDigest();

    if (cache.sourceDigest === currentDigest) {
      useLog("DEBUG", "Skipping compilation as nothing changed");
      return false;
    }

    return true;
  }

  /**
   * Update cache with current source digest
   */
  updateCache(): void {
    this.ensureCacheDirectory();

    const cache = this.loadCache();
    cache.sourceDigest = this.project.getDigest();
    FileUtils.save(cache, this.cacheFile, "json");
  }

  /**
   * Load cache data from file
   * @returns Cache data or empty object if file doesn't exist
   */
  private loadCache(): WebdaCacheData {
    if (!existsSync(this.cacheFile)) {
      return {};
    }
    return FileUtils.load(this.cacheFile, "json") as WebdaCacheData;
  }

  /**
   * Ensure cache directory exists
   */
  private ensureCacheDirectory(): void {
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }
  }
}
