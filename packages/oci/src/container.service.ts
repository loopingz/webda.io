import {
  Command,
  type Deployer,
  getDeploymentVariables,
  packageApplication,
  type PackageOptions,
  resolveDeploymentVariables,
  Service,
  ServiceParameters,
  useApplication
} from "@webda/core";
import { isAbsolute, join } from "node:path";
import type { RegistryCredentials } from "./auth.js";
import { buildImage, type BuiltImage, pushImage, writeLayoutArchive } from "./image.js";
import { formatImageReference, parseImageReference, toTag } from "./reference.js";
import type { TarEntry } from "./tar.js";

/**
 * Parameters of the {@link ContainerDeployer}
 *
 * Every string can use the deployment templates: `${package.version}`, `${git.commit}`,
 * `${deployment}`, `${deployer.name}`, `${env.MY_VAR}`, ...
 */
export class ContainerDeployerParameters extends ServiceParameters {
  /**
   * Base image, `scratch` for none
   *
   * @default "node:22-slim"
   */
  baseImage?: string;
  /**
   * Repository to push to, without tag: `ghcr.io/my-org/my-app`
   *
   * Required to push.
   */
  image?: string;
  /**
   * Tags of the image
   *
   * Invalid characters are replaced by `-`, so the snapshot version `1.2.4+20261004120000`
   * becomes `1.2.4-20261004120000`.
   *
   * @default ["${git.version}"]
   */
  tags?: string[];
  /**
   * Folder of the application in the image
   *
   * @default "/app"
   */
  workdir?: string;
  /**
   * Entrypoint of the image
   *
   * @default ["node", "<workdir>/node_modules/@webda/core/lib/bin/cli.js"]
   */
  entrypoint?: string[];
  /**
   * Command of the image, the arguments of the entrypoint
   *
   * @default ["serve", "--bind", "0.0.0.0"]
   */
  cmd?: string[];
  /**
   * Environment variables
   *
   * @default { "NODE_ENV": "production" }
   */
  env?: Record<string, string>;
  /**
   * Labels, added to the default OCI ones (version, revision, source, title)
   */
  labels?: Record<string, string>;
  /**
   * User the container runs as, the base image one by default
   */
  user?: string;
  /**
   * Exposed ports
   *
   * @default ["18080/tcp"]
   */
  exposedPorts?: string[];
  /**
   * Platforms to build, several platforms produce a multi-platform index
   *
   * @default ["linux/amd64"]
   */
  platforms?: string[];
  /**
   * Output of `container build`: an OCI layout folder, or a tar archive when ending with `.tar`
   *
   * Relative to the application folder. The folder keeps the downloaded base layers between builds.
   *
   * @default ".webda/oci/${deployer.name}"
   */
  output?: string;
  /**
   * Options of the application packaging
   */
  package?: PackageOptions;
  /**
   * Modification time of the files and creation time of the image, in seconds
   *
   * @default the SOURCE_DATE_EPOCH environment variable, or 0
   */
  mtime?: number;
  /**
   * Credentials per registry host, they take precedence over `~/.docker/config.json`
   *
   * Use templates to read them from the environment: `{ "ghcr.io": { "username": "${env.GHCR_USER}", "password": "${env.GHCR_TOKEN}" } }`
   */
  credentials?: Record<string, RegistryCredentials>;
  /**
   * Registries reached over plain http, `localhost` and `127.0.0.1` always are
   */
  insecureRegistries?: string[];

  /**
   * @override
   */
  load(params: any = {}): this {
    super.load(params);
    this.baseImage ??= "node:22-slim";
    this.tags ??= ["${git.version}"];
    this.workdir ??= "/app";
    this.entrypoint ??= ["node", `${this.workdir.replace(/\/+$/, "")}/node_modules/@webda/core/lib/bin/cli.js`];
    this.cmd ??= ["serve", "--bind", "0.0.0.0"];
    this.env ??= { NODE_ENV: "production" };
    this.labels ??= {};
    this.exposedPorts ??= ["18080/tcp"];
    this.platforms ??= ["linux/amd64"];
    this.output ??= ".webda/oci/${deployer.name}";
    this.package ??= {};
    this.package.modules ??= {};
    this.credentials ??= {};
    this.insecureRegistries ??= [];
    return this;
  }
}

/**
 * Build and push OCI images of the application without Docker
 *
 * Declare it as a unit of a deployment:
 * ```json
 * {
 *   "units": [
 *     { "name": "image", "type": "Webda/ContainerDeployer", "image": "ghcr.io/my-org/my-app" }
 *   ]
 * }
 * ```
 * then run `webda -d <deployment> container build`, `container push` or `deploy`.
 *
 * The image is the base image plus one layer with the packaged application (the files of the
 * package, its production dependencies and the packaged configuration). The layer is
 * reproducible: the same application gives the same digest.
 *
 * @WebdaModda
 */
export class ContainerDeployer<T extends ContainerDeployerParameters = ContainerDeployerParameters>
  extends Service<T>
  implements Deployer
{
  /**
   * Parameters with the deployment templates replaced
   *
   * @returns the resolved parameters
   */
  getResolvedParameters(): ContainerDeployerParameters {
    const variables = getDeploymentVariables(this);
    const resolved: ContainerDeployerParameters = resolveDeploymentVariables({ ...this.parameters }, variables);
    const repository: string | { url?: string } = (variables.package as any)?.repository;
    resolved.labels = {
      "org.opencontainers.image.title": variables.package?.name,
      "org.opencontainers.image.version": variables.git?.version,
      "org.opencontainers.image.revision": variables.git?.commit,
      "org.opencontainers.image.source": typeof repository === "string" ? repository : repository?.url,
      ...resolved.labels
    };
    for (const [key, value] of Object.entries(resolved.labels)) {
      if (value === undefined || value === "") {
        delete resolved.labels[key];
      }
    }
    resolved.tags = resolved.tags.map(tag => toTag(tag));
    resolved.mtime ??= process.env.SOURCE_DATE_EPOCH ? parseInt(process.env.SOURCE_DATE_EPOCH) : 0;
    return resolved;
  }

  /**
   * Files of the application layer: the packaged application under the working directory
   *
   * @param parameters - the resolved parameters
   * @returns the layer entries
   */
  async getLayerEntries(parameters: ContainerDeployerParameters): Promise<TarEntry[]> {
    const { files } = await packageApplication(useApplication(), parameters.package);
    const prefix = parameters.workdir.replace(/^\/+/, "").replace(/\/+$/, "");
    return files.map(file => ({
      path: prefix ? `${prefix}/${file.target}` : file.target,
      type: "file",
      // Only keep the executable bit, so the umask of the build machine does not change the digest
      mode: (file.mode ?? 0o644) & 0o111 ? 0o755 : 0o644,
      ...(file.source ? { source: file.source } : { content: Buffer.from(file.content ?? "") })
    }));
  }

  /**
   * Build the image into an OCI layout
   *
   * @param parameters - the resolved parameters
   * @param output - the layout folder
   * @param includeBaseLayers - download the base layers into the layout
   * @returns the built image
   */
  async buildImage(
    parameters: ContainerDeployerParameters,
    output: string,
    includeBaseLayers: boolean
  ): Promise<BuiltImage> {
    const entries = await this.getLayerEntries(parameters);
    return buildImage(output, entries, {
      baseImage: parameters.baseImage,
      platforms: parameters.platforms,
      workdir: parameters.workdir,
      entrypoint: parameters.entrypoint,
      cmd: parameters.cmd,
      env: parameters.env,
      labels: parameters.labels,
      annotations: Object.fromEntries(
        Object.entries(parameters.labels).filter(([key]) => key.startsWith("org.opencontainers.image."))
      ),
      user: parameters.user,
      exposedPorts: parameters.exposedPorts,
      mtime: parameters.mtime,
      createdBy: `webda container build (${this.getName()})`,
      includeBaseLayers,
      tags: parameters.tags,
      credentials: parameters.credentials,
      insecureRegistries: parameters.insecureRegistries
    });
  }

  /**
   * Resolve the output path against the application folder
   *
   * @param output - the output from the parameters or the command line
   * @returns the absolute path
   */
  protected resolveOutput(output: string): string {
    return isAbsolute(output) ? output : join(useApplication().applicationPath ?? process.cwd(), output);
  }

  /**
   * Build the image into an OCI layout folder or tar archive
   *
   * Load the archive with `podman load -i <file>` or copy it with `skopeo copy oci-archive:<file> ...`.
   *
   * @param output - Output folder, or tar archive when ending with `.tar`
   * @returns the output path
   */
  @Command("container build", { description: "Build the OCI image of the application into a layout or archive" })
  async build(output?: string): Promise<string> {
    const parameters = this.getResolvedParameters();
    const path = this.resolveOutput(output ?? parameters.output);
    const archive = path.endsWith(".tar");
    const layout = archive ? `${path}.layout` : path;
    const image = await this.buildImage(parameters, layout, true);
    if (archive) {
      await writeLayoutArchive(layout, path, true);
    }
    this.log("INFO", `Built ${image.root.digest} in ${path} with tags ${parameters.tags.join(", ")}`);
    return path;
  }

  /**
   * Build the image and push it with its tags
   *
   * Base layers are mounted or copied registry to registry, they are not stored locally.
   *
   * @returns the pushed digest
   */
  @Command("container push", { description: "Build the OCI image of the application and push it" })
  async push(): Promise<string> {
    const parameters = this.getResolvedParameters();
    if (!parameters.image) {
      throw new Error(`The '${this.getName()}' unit needs an 'image' to push to, like ghcr.io/my-org/my-app`);
    }
    const target = parseImageReference(parameters.image);
    const image = await this.buildImage(parameters, this.resolveOutput(parameters.output), false);
    const digest = await pushImage(image, target, parameters.tags, {
      credentials: parameters.credentials,
      insecureRegistries: parameters.insecureRegistries
    });
    this.log("INFO", `Pushed ${formatImageReference({ ...target, tag: undefined, digest })}`);
    return digest;
  }

  /**
   * Deploy the image: build and push it, so `webda -d <deployment> deploy` publishes it with the other units
   *
   * @returns the pushed digest
   */
  @Command("deploy", { description: "Build and push the OCI image of the application" })
  async deploy(): Promise<string> {
    return this.push();
  }
}

export default ContainerDeployer;
