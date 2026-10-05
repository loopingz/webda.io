import { useLog } from "@webda/workout";
import { createWriteStream, readdirSync, rmSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { readDockerConfig, type RegistryCredentials, resolveCredentials } from "./auth.js";
import { ImageLayout } from "./layout.js";
import {
  type Descriptor,
  formatPlatform,
  type ImageConfiguration,
  type ImageIndex,
  type ImageManifest,
  isIndex,
  MediaTypes,
  type Platform,
  parsePlatform,
  platformMatches,
  toOciMediaType
} from "./oci.js";
import { formatImageReference, type ImageReference, parseImageReference } from "./reference.js";
import { RegistryClient } from "./registry.js";
import { generateTar, type TarEntry, withDirectories } from "./tar.js";

/**
 * Base image name meaning no base: the image only contains the application layer
 */
export const SCRATCH = "scratch";

/**
 * Registry access options shared by the build and the push
 */
export interface RegistryOptions {
  /**
   * Credentials per registry host, they take precedence over the Docker configuration
   */
  credentials?: Record<string, RegistryCredentials>;
  /**
   * Docker configuration, read from `~/.docker/config.json` by default
   */
  dockerConfig?: any;
  /**
   * Registries reached over plain http, `localhost` and `127.0.0.1` always are
   */
  insecureRegistries?: string[];
  /**
   * fetch implementation, for tests
   */
  fetch?: typeof fetch;
}

/**
 * Options of {@link buildImage}
 */
export interface BuildImageOptions extends RegistryOptions {
  /**
   * Base image reference, or {@link SCRATCH}
   */
  baseImage: string;
  /**
   * Platforms to build, `linux/amd64` by default: several platforms produce an index
   */
  platforms?: string[];
  /**
   * Working directory of the image
   */
  workdir?: string;
  /**
   * Entrypoint, replaces the base one
   */
  entrypoint?: string[];
  /**
   * Command, replaces the base one
   */
  cmd?: string[];
  /**
   * Environment variables, added to or replacing the base ones
   */
  env?: Record<string, string>;
  /**
   * Labels of the configuration, added to the base ones
   */
  labels?: Record<string, string>;
  /**
   * Annotations of the manifests
   */
  annotations?: Record<string, string>;
  /**
   * User to run as, the base one when undefined
   */
  user?: string;
  /**
   * Exposed ports, `8080/tcp`
   */
  exposedPorts?: string[];
  /**
   * Creation time of the image and modification time of the files, in seconds
   *
   * @default 0
   */
  mtime?: number;
  /**
   * Description of the layer in the history
   */
  createdBy?: string;
  /**
   * Copy the base layers into the layout so it is complete; the push copies them registry
   * to registry otherwise
   *
   * @default true
   */
  includeBaseLayers?: boolean;
  /**
   * Tags recorded in the layout `index.json`
   */
  tags?: string[];
}

/**
 * One image of a build, per platform
 */
export interface BuiltPlatformImage {
  platform: Platform;
  manifest: ImageManifest;
  descriptor: Descriptor;
  config: ImageConfiguration;
}

/**
 * Result of {@link buildImage}
 */
export interface BuiltImage {
  /**
   * The layout holding the blobs
   */
  layout: ImageLayout;
  /**
   * Descriptor of the image to tag: the manifest, or the index for several platforms
   */
  root: Descriptor;
  /**
   * The index document, for several platforms
   */
  index?: ImageIndex;
  /**
   * The images per platform
   */
  images: BuiltPlatformImage[];
  /**
   * The application layer
   */
  layer: Descriptor;
  /**
   * The base image, undefined for scratch
   */
  base?: ImageReference;
}

/**
 * Create a registry client
 *
 * @param registry - registry host
 * @param options - registry options
 * @returns the client
 */
export function createRegistryClient(registry: string, options: RegistryOptions = {}): RegistryClient {
  return new RegistryClient(registry, {
    credentials: resolveCredentials(registry, options.credentials ?? {}, options.dockerConfig ?? readDockerConfig()),
    insecure: options.insecureRegistries?.includes(registry) ? true : undefined,
    fetch: options.fetch
  });
}

/**
 * Format a time in seconds as RFC 3339
 *
 * @param seconds - the time
 * @returns the date
 */
function isoDate(seconds: number): string {
  return new Date(seconds * 1000).toISOString().replace(/\.000Z$/, "Z");
}

/**
 * Merge environment variables into a `KEY=value` list, keeping the base order
 *
 * @param base - the base list
 * @param env - variables to set
 * @returns the merged list
 */
export function mergeEnv(base: string[] = [], env: Record<string, string> = {}): string[] {
  const result = base.map(line => {
    const key = line.split("=")[0];
    return key in env ? `${key}=${env[key]}` : line;
  });
  const existing = new Set(base.map(line => line.split("=")[0]));
  for (const [key, value] of Object.entries(env)) {
    if (!existing.has(key)) {
      result.push(`${key}=${value}`);
    }
  }
  return result;
}

/**
 * Create the configuration of the new image from the base one
 *
 * @param base - the base configuration
 * @param diffId - diff id of the application layer
 * @param options - the build options
 * @returns the new configuration
 */
export function createImageConfiguration(
  base: ImageConfiguration,
  diffId: string,
  options: BuildImageOptions
): ImageConfiguration {
  const created = isoDate(options.mtime ?? 0);
  const config = { ...(base.config ?? {}) };
  config.Env = mergeEnv(config.Env, options.env);
  if (options.workdir) config.WorkingDir = options.workdir;
  if (options.entrypoint) config.Entrypoint = options.entrypoint;
  if (options.cmd) config.Cmd = options.cmd;
  if (options.user) config.User = options.user;
  if (options.exposedPorts?.length) {
    config.ExposedPorts = { ...(config.ExposedPorts ?? {}) };
    for (const port of options.exposedPorts) {
      config.ExposedPorts[port.includes("/") ? port : `${port}/tcp`] = {};
    }
  }
  if (options.labels && Object.keys(options.labels).length) {
    config.Labels = { ...(config.Labels ?? {}), ...options.labels };
  }
  return {
    ...base,
    created,
    config,
    rootfs: { type: "layers", diff_ids: [...(base.rootfs?.diff_ids ?? []), diffId] },
    history: [
      ...(base.history ?? []),
      { created, created_by: options.createdBy ?? "webda container build", comment: "webda" }
    ]
  };
}

/**
 * Base image of one platform
 */
interface PlatformBase {
  platform: Platform;
  config: ImageConfiguration;
  layers: Descriptor[];
  digest?: string;
}

/**
 * Resolve the base image for every requested platform
 *
 * @param base - the base reference, undefined for scratch
 * @param platforms - requested platforms
 * @param options - registry options
 * @returns the base per platform
 */
async function resolveBase(
  base: ImageReference | undefined,
  platforms: Platform[],
  options: BuildImageOptions
): Promise<{ bases: PlatformBase[]; client?: RegistryClient }> {
  if (!base) {
    return {
      bases: platforms.map(platform => ({
        platform,
        config: {
          architecture: platform.architecture,
          os: platform.os,
          ...(platform.variant ? { variant: platform.variant } : {}),
          config: {},
          rootfs: { type: "layers", diff_ids: [] },
          history: []
        },
        layers: []
      }))
    };
  }
  const client = createRegistryClient(base.registry, options);
  const top = await client.getManifest(base.repository, base.digest ?? base.tag);
  const manifests: { platform: Platform; digest: string; json: any }[] = [];
  if (isIndex(top.mediaType)) {
    for (const platform of platforms) {
      const entry = (top.json as ImageIndex).manifests.find(descriptor =>
        platformMatches(descriptor.platform, platform)
      );
      if (!entry) {
        throw new Error(
          `Base image ${formatImageReference(base)} has no ${formatPlatform(platform)} image, available: ${(
            top.json as ImageIndex
          ).manifests
            .map(descriptor => descriptor.platform && formatPlatform(descriptor.platform))
            .filter(Boolean)
            .join(", ")}`
        );
      }
      const manifest = await client.getManifest(base.repository, entry.digest);
      manifests.push({ platform, digest: manifest.digest, json: manifest.json });
    }
  } else {
    if (platforms.length > 1) {
      throw new Error(
        `Base image ${formatImageReference(base)} is a single platform image, cannot build ${platforms.map(formatPlatform).join(", ")}`
      );
    }
    manifests.push({ platform: platforms[0], digest: top.digest, json: top.json });
  }
  const bases: PlatformBase[] = [];
  for (const { platform, digest, json } of manifests) {
    const response = await client.getBlob(base.repository, json.config.digest);
    const config: ImageConfiguration = JSON.parse(Buffer.from(await response.arrayBuffer()).toString());
    if (config.os !== platform.os || config.architecture !== platform.architecture) {
      useLog(
        "WARN",
        `Base image ${formatImageReference(base)} is ${config.os}/${config.architecture}, not ${formatPlatform(platform)}`
      );
    }
    bases.push({
      platform: {
        os: config.os,
        architecture: config.architecture,
        ...(config.variant ? { variant: config.variant } : {})
      },
      config,
      layers: (json as ImageManifest).layers.map(layer => ({ ...layer, mediaType: toOciMediaType(layer.mediaType) })),
      digest
    });
  }
  return { bases, client };
}

/**
 * Build an image from files, without a container engine
 *
 * The files become one layer on top of the base image layers, the base configuration gets the
 * new entrypoint, command, environment, labels and working directory.
 *
 * @param path - folder of the OCI layout to write
 * @param entries - files of the layer, with their absolute path in the image (without leading `/`)
 * @param options - the build options
 * @returns the built image
 */
export async function buildImage(path: string, entries: TarEntry[], options: BuildImageOptions): Promise<BuiltImage> {
  const layout = new ImageLayout(path);
  const platforms = (options.platforms?.length ? options.platforms : ["linux/amd64"]).map(parsePlatform);
  const base = options.baseImage && options.baseImage !== SCRATCH ? parseImageReference(options.baseImage) : undefined;
  const { bases, client } = await resolveBase(base, platforms, options);
  useLog("INFO", `Creating the application layer (${entries.length} entries)`);
  const layer = await layout.writeLayer(withDirectories(entries), { mtime: options.mtime ?? 0 });
  useLog("INFO", `Application layer ${layer.descriptor.digest} (${layer.descriptor.size} bytes)`);
  const images: BuiltPlatformImage[] = [];
  for (const platformBase of bases) {
    if (base && (options.includeBaseLayers ?? true)) {
      for (const baseLayer of platformBase.layers) {
        if (!layout.hasBlob(baseLayer.digest)) {
          useLog("INFO", `Pulling base layer ${baseLayer.digest} (${baseLayer.size} bytes)`);
          const response = await client.getBlob(base.repository, baseLayer.digest);
          await layout.writeStream(response.body, baseLayer.digest);
        }
      }
    }
    const config = createImageConfiguration(platformBase.config, layer.diffId, options);
    const configDescriptor = layout.writeJson(config, MediaTypes.OCI_CONFIG);
    const annotations: Record<string, string> = { ...(options.annotations ?? {}) };
    if (base) {
      annotations["org.opencontainers.image.base.name"] = formatImageReference({ ...base, digest: undefined });
      annotations["org.opencontainers.image.base.digest"] = platformBase.digest;
    }
    const manifest: ImageManifest = {
      schemaVersion: 2,
      mediaType: MediaTypes.OCI_MANIFEST,
      config: configDescriptor,
      layers: [...platformBase.layers, layer.descriptor],
      ...(Object.keys(annotations).length ? { annotations } : {})
    };
    const descriptor = { ...layout.writeJson(manifest, MediaTypes.OCI_MANIFEST), platform: platformBase.platform };
    images.push({ platform: platformBase.platform, manifest, descriptor, config });
  }
  let root: Descriptor = images[0].descriptor;
  let index: ImageIndex;
  if (images.length > 1) {
    index = {
      schemaVersion: 2,
      mediaType: MediaTypes.OCI_INDEX,
      manifests: images.map(image => image.descriptor),
      ...(options.annotations && Object.keys(options.annotations).length ? { annotations: options.annotations } : {})
    };
    root = layout.writeJson(index, MediaTypes.OCI_INDEX);
  }
  const tags = options.tags?.length ? options.tags : ["latest"];
  layout.writeIndex(tags.map(tag => ({ ...root, annotations: { "org.opencontainers.image.ref.name": tag } })));
  return { layout, root, index, images, layer: layer.descriptor, base };
}

/**
 * Push a built image to a repository with its tags
 *
 * Blobs already in the target are skipped. Base layers missing from the layout are mounted
 * from the base repository when it is on the same registry, otherwise copied from the base registry.
 *
 * @param image - the built image
 * @param target - the target repository, its tag is ignored
 * @param tags - tags to push
 * @param options - registry options
 * @returns the digest of the pushed root manifest
 */
export async function pushImage(
  image: BuiltImage,
  target: ImageReference,
  tags: string[],
  options: RegistryOptions = {}
): Promise<string> {
  const client = createRegistryClient(target.registry, options);
  const baseClient = image.base ? createRegistryClient(image.base.registry, options) : undefined;
  const blobs = new Map<string, Descriptor>();
  for (const platformImage of image.images) {
    for (const descriptor of [platformImage.manifest.config, ...platformImage.manifest.layers]) {
      blobs.set(descriptor.digest, descriptor);
    }
  }
  for (const descriptor of blobs.values()) {
    if (
      descriptor.mediaType === MediaTypes.DOCKER_FOREIGN_LAYER ||
      (await client.hasBlob(target.repository, descriptor.digest))
    ) {
      continue;
    }
    if (!image.layout.hasBlob(descriptor.digest)) {
      if (
        image.base.registry === target.registry &&
        (await client.mountBlob(target.repository, descriptor.digest, image.base.repository))
      ) {
        useLog("INFO", `Mounted ${descriptor.digest} from ${image.base.repository}`);
        continue;
      }
      useLog("INFO", `Pulling base layer ${descriptor.digest} (${descriptor.size} bytes)`);
      const response = await baseClient.getBlob(image.base.repository, descriptor.digest);
      await image.layout.writeStream(response.body, descriptor.digest);
    }
    useLog("INFO", `Pushing ${descriptor.digest} (${descriptor.size} bytes)`);
    await client.uploadBlob(target.repository, descriptor.digest, image.layout.blobSize(descriptor.digest), () =>
      image.layout.blobStream(descriptor.digest)
    );
  }
  if (image.index) {
    for (const platformImage of image.images) {
      await client.putManifest(
        target.repository,
        platformImage.descriptor.digest,
        image.layout.readBlob(platformImage.descriptor.digest),
        MediaTypes.OCI_MANIFEST
      );
    }
  }
  let digest = image.root.digest;
  for (const tag of tags) {
    digest = await client.putManifest(
      target.repository,
      tag,
      image.layout.readBlob(image.root.digest),
      image.root.mediaType
    );
    useLog("INFO", `Pushed ${formatImageReference({ ...target, tag, digest: undefined })}@${digest}`);
  }
  return digest;
}

/**
 * List the files of a folder as tar entries, relative to the folder
 *
 * @param folder - the folder
 * @returns the entries
 */
function folderEntries(folder: string): TarEntry[] {
  const entries: TarEntry[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const stats = statSync(path);
      const target = relative(folder, path).split(sep).join("/");
      if (stats.isDirectory()) {
        entries.push({ path: target, type: "directory", mode: 0o755 });
        walk(path);
      } else {
        entries.push({ path: target, type: "file", mode: 0o644, source: path });
      }
    }
  };
  walk(folder);
  return entries;
}

/**
 * Archive a layout folder as a tar file, the format `podman load` and `docker load` accept
 *
 * @param layout - the layout folder
 * @param file - the tar file to write
 * @param removeLayout - delete the folder afterwards
 */
export async function writeLayoutArchive(layout: string, file: string, removeLayout: boolean = false): Promise<void> {
  await pipeline(Readable.from(generateTar(withDirectories(folderEntries(layout)))), createWriteStream(file));
  if (removeLayout) {
    rmSync(layout, { recursive: true, force: true });
  }
}
