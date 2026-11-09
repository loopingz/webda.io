import { createHash } from "node:crypto";

/**
 * Media types of the OCI image specification
 */
export const MediaTypes = {
  OCI_INDEX: "application/vnd.oci.image.index.v1+json",
  OCI_MANIFEST: "application/vnd.oci.image.manifest.v1+json",
  OCI_CONFIG: "application/vnd.oci.image.config.v1+json",
  OCI_LAYER_GZIP: "application/vnd.oci.image.layer.v1.tar+gzip",
  OCI_LAYER: "application/vnd.oci.image.layer.v1.tar",
  OCI_LAYER_ZSTD: "application/vnd.oci.image.layer.v1.tar+zstd",
  DOCKER_LIST: "application/vnd.docker.distribution.manifest.list.v2+json",
  DOCKER_MANIFEST: "application/vnd.docker.distribution.manifest.v2+json",
  DOCKER_CONFIG: "application/vnd.docker.container.image.v1+json",
  DOCKER_LAYER_GZIP: "application/vnd.docker.image.rootfs.diff.tar.gzip",
  DOCKER_FOREIGN_LAYER: "application/vnd.docker.image.rootfs.foreign.diff.tar.gzip"
} as const;

/**
 * Accept header for manifests: images and indexes, OCI and Docker
 */
export const MANIFEST_ACCEPT = [
  MediaTypes.OCI_INDEX,
  MediaTypes.OCI_MANIFEST,
  MediaTypes.DOCKER_LIST,
  MediaTypes.DOCKER_MANIFEST
].join(", ");

/**
 * Docker media types of a single image converted to their OCI equivalent, the content is identical
 */
const TO_OCI: Record<string, string> = {
  [MediaTypes.DOCKER_MANIFEST]: MediaTypes.OCI_MANIFEST,
  [MediaTypes.DOCKER_LIST]: MediaTypes.OCI_INDEX,
  [MediaTypes.DOCKER_CONFIG]: MediaTypes.OCI_CONFIG,
  [MediaTypes.DOCKER_LAYER_GZIP]: MediaTypes.OCI_LAYER_GZIP
};

/**
 * Convert a Docker media type to the OCI one
 *
 * @param mediaType - the media type
 * @returns the OCI media type, unchanged if not a Docker one
 */
export function toOciMediaType(mediaType: string): string {
  return TO_OCI[mediaType] ?? mediaType;
}

/**
 * A platform of an image
 */
export interface Platform {
  /**
   * OS
   */
  os: string;
  /**
   * Architecture
   */
  architecture: string;
  /**
   * Variant
   */
  variant?: string;
  /**
   * Os.version
   */
  "os.version"?: string;
}

/**
 * Content descriptor
 */
export interface Descriptor {
  /**
   * Media type
   */
  mediaType: string;
  /**
   * Digest
   */
  digest: string;
  /**
   * Size
   */
  size: number;
  /**
   * URLS
   */
  urls?: string[];
  /**
   * Annotations
   */
  annotations?: Record<string, string>;
  /**
   * Platform
   */
  platform?: Platform;
}

/**
 * Image manifest
 */
export interface ImageManifest {
  /**
   * Schema version
   */
  schemaVersion: 2;
  /**
   * Media type
   */
  mediaType?: string;
  /**
   * Configuration
   */
  config: Descriptor;
  /**
   * Layers
   */
  layers: Descriptor[];
  /**
   * Annotations
   */
  annotations?: Record<string, string>;
}

/**
 * Image index, also Docker manifest list
 */
export interface ImageIndex {
  /**
   * Schema version
   */
  schemaVersion: 2;
  /**
   * Media type
   */
  mediaType?: string;
  /**
   * Manifests
   */
  manifests: Descriptor[];
  /**
   * Annotations
   */
  annotations?: Record<string, string>;
}

/**
 * History entry of an image configuration
 */
export interface HistoryEntry {
  /**
   * Created
   */
  created?: string;
  /**
   * Created by
   */
  created_by?: string;
  /**
   * Author
   */
  author?: string;
  /**
   * Comment
   */
  comment?: string;
  /**
   * Whether empty layer is enabled
   */
  empty_layer?: boolean;
}

/**
 * Image configuration
 */
export interface ImageConfiguration {
  /**
   * Created
   */
  created?: string;
  /**
   * Author
   */
  author?: string;
  /**
   * Architecture
   */
  architecture: string;
  /**
   * OS
   */
  os: string;
  /**
   * Variant
   */
  variant?: string;
  /**
   * Os.version
   */
  "os.version"?: string;
  /**
   * Configuration
   */
  config?: {
    User?: string;
    ExposedPorts?: Record<string, object>;
    Env?: string[];
    Entrypoint?: string[] | null;
    Cmd?: string[] | null;
    Volumes?: Record<string, object>;
    WorkingDir?: string;
    Labels?: Record<string, string>;
    StopSignal?: string;
    [key: string]: any;
  };
  /**
   * Rootfs
   */
  rootfs: {
    type: "layers";
    diff_ids: string[];
  };
  /**
   * History
   */
  history?: HistoryEntry[];
  [key: string]: any;
}

/**
 * Compute the sha256 digest of a content
 *
 * @param data - the content
 * @returns `sha256:<hex>`
 */
export function sha256(data: Buffer | string): string {
  return `sha256:${createHash("sha256").update(data).digest("hex")}`;
}

/**
 * Serialize a JSON document the same way every time
 *
 * Keys are kept in insertion order: the builders create the objects in a fixed order.
 *
 * @param value - the document
 * @returns the bytes
 */
export function toJsonBytes(value: any): Buffer {
  return Buffer.from(JSON.stringify(value));
}

/**
 * Parse a platform string
 *
 * @param platform - `linux/amd64`, `linux/arm64/v8`
 * @returns the platform
 */
export function parsePlatform(platform: string): Platform {
  const [os, architecture, variant] = platform.split("/");
  if (!os || !architecture) {
    throw new Error(`Invalid platform '${platform}', expected os/architecture[/variant]`);
  }
  return variant ? { os, architecture, variant } : { os, architecture };
}

/**
 * Format a platform
 *
 * @param platform - the platform
 * @returns `os/architecture[/variant]`
 */
export function formatPlatform(platform: Platform): string {
  return [platform.os, platform.architecture, platform.variant].filter(Boolean).join("/");
}

/**
 * Check whether a platform of an index matches the requested one
 *
 * A requested platform without variant matches any variant, except for arm64 where an
 * index entry without variant or with `v8` both match.
 *
 * @param candidate - platform of the index entry
 * @param wanted - requested platform
 * @returns true when matching
 */
export function platformMatches(candidate: Platform | undefined, wanted: Platform): boolean {
  if (!candidate || candidate.os !== wanted.os || candidate.architecture !== wanted.architecture) {
    return false;
  }
  if (!wanted.variant) {
    return true;
  }
  if (wanted.architecture === "arm64" && wanted.variant === "v8") {
    return !candidate.variant || candidate.variant === "v8";
  }
  return candidate.variant === wanted.variant;
}

/**
 * Check whether a manifest media type is an index
 *
 * @param mediaType - the media type
 * @returns true for OCI indexes and Docker manifest lists
 */
export function isIndex(mediaType: string): boolean {
  return mediaType === MediaTypes.OCI_INDEX || mediaType === MediaTypes.DOCKER_LIST;
}
