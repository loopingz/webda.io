import { DeployerResources, getCommonJS, JSONUtils } from "@webda/core";
import fs from "fs-extra";
import { globSync } from "glob";
import * as path from "path";
import { Packager } from "../index";
import { Deployer } from "./deployer";
const { __dirname } = getCommonJS(import.meta.url);

/**
 * Command mapping for your preferred containerd client
 */
export interface ContainerClientDefinition {
  buildTagFile: string;
  buildTagStdin: string;
  buildStdin: string;
  buildFile: string;
  pushTag: string;
}

/**
 * Current predefined profiles
 */
export type ClientProfiles = "docker" | "buildah";

/**
 * Predefined containerd client commands
 */
export const ClientDefinitions: { [key: string]: ContainerClientDefinition } = {
  docker: {
    buildFile: "docker build --file ${file} .",
    buildTagFile: "docker build --tag ${tag} --file ${file} .",
    buildTagStdin: "docker build --tag ${tag} --file - .",
    buildStdin: "docker build --file - .",
    pushTag: "docker push ${tag}"
  },
  buildah: {
    buildFile: "buildah bud --format=docker -f ${file} .",
    buildTagFile: "buildah bud --format=docker -f ${file} -t ${tag} .",
    buildTagStdin: "cat | buildah bud --format=docker -f - -t ${tag} .",
    buildStdin: "cat | buildah bud --format=docker -f - .",
    pushTag: "buildah push ${tag}"
  }
};

export interface ContainerResources extends DeployerResources {
  // Tag the image
  tag?: string;
  // Push image to the repository
  push?: boolean;
  // If you want to override the Dockerfile
  Dockerfile?: string;
  // command to run on webda
  command?: string;
  // Default image to derivate from
  baseImage?: string;
  // Save the Dockerfile to this location
  debugDockerfilePath?: string;
  // Working directory for Docker daemon
  workDirectory?: string;
  // If workspaces detected it will include the whole workspace
  includeWorkspaces?: boolean;
  // Include linked modules - not recommended for production
  includeLinkModules?: boolean;
  // If you want to redirect the stderr to a file
  errorFile?: string;
  // If you want to redirect the stdout to a file
  logFile?: string;
  // If you want to exclude packages from build when includeWorkspaces is on
  excludePackages?: string[];
  /**
   * Container client profile
   *
   * @default docker
   */
  containerClient?: ClientProfiles | ContainerClientDefinition;
}

/**
 * @WebdaDeployer WebdaDeployer/Container
 */
export class Container<T extends ContainerResources> extends Deployer<T> {
  _copied: boolean = false;
  workspaces: boolean = false;
  private client: ContainerClientDefinition;

  async loadDefaults() {
    await super.loadDefaults();
    this.resources.baseImage = this.resources.baseImage || "docker.io/library/node:lts-alpine";
    this.resources.command = this.resources.command || "serve";
    this.resources.excludePackages = this.resources.excludePackages || [];
    this.resources.containerClient = this.resources.containerClient || "docker";
    if (typeof this.resources.containerClient == "string") {
      if (!ClientDefinitions[this.resources.containerClient]) {
        throw new Error(`Client profile '${this.resources.containerClient}' does not exist for ContainerClient`);
      }
      this.resources.containerClient = ClientDefinitions[this.resources.containerClient];
    }
    this.client = this.resources.containerClient;

    if (
      !this.resources.workDirectory &&
      this.resources.includeWorkspaces &&
      this.getApplication().getPackageWebda().workspaces
    ) {
      const workspacePath = this.getApplication().getPackageWebda().workspaces.path;
      if (workspacePath) {
        this.workspaces = true;
        this.logger.log("INFO", `Workspaces detected using ${workspacePath} as workingDirectory`);
        this.resources.workDirectory = workspacePath;
      }
    }
  }

  /**
   * Build a Docker image with webda application
   *
   * @param tag to build
   * @param file path of Dockerfile
   * @param command webda command to run
   */
  async buildContainer(tag, file) {
    const args: any = {};
    let stdin;
    let cmd;
    if (tag) {
      args.tag = tag;
    }
    if (file) {
      args.file = file;
      stdin = null;
      cmd = tag ? this.client.buildTagFile : this.client.buildFile;
    } else {
      if (this.workspaces) {
        stdin = this.getWorkspacesDockerfile();
      } else {
        stdin = this.getDockerfile();
      }
      cmd = tag ? this.client.buildTagStdin : this.client.buildStdin;
    }

    this.logger.log("INFO", `Launching Docker build ${this.replaceArgs(cmd, args)}`);
    return this.execute(this.replaceArgs(cmd, args), stdin, false, "INFO");
  }

  /**
   * Replace ${...} arguments within a string
   *
   * `docker build --tag ${tag} --file ${file}`
   *  will be replace by
   * `docker build --tag mytag:1.2.3` --file /tmp/plop`
   *
   * @param cmd to be executed after
   * @param args map to replace
   * @returns
   */
  replaceArgs(cmd: string, args: any): string {
    for (const i in args) {
      cmd = cmd.replace(new RegExp("\\$\\{" + i + "\\}", "g"), args[i]);
    }
    return cmd;
  }

  /**
   * Create Docker image and push
   */
  async deploy() {
    const { tag, push, Dockerfile } = this.resources;

    const cwd = process.cwd();
    try {
      process.chdir(this.resources.workDirectory || cwd);
      if (this.resources.includeLinkModules) {
        this.logger.log("INFO", `Copy linked modules into link_modules`);
        fs.emptyDirSync("link_modules");
      }
      await this.buildContainer(tag, Dockerfile);
      if (tag && push) {
        this.logger.log("INFO", `Pushing image ${tag}`);
        // Push
        await this.execute(this.replaceArgs(this.client.pushTag, { tag }));
      }
      this.logger.log("INFO", `Docker deployment finished`);
    } finally {
      process.chdir(cwd);
    }
    return { tag };
  }

  copyPackageToLinkModules(pkg: string, includeModules: boolean = false, _subpkg: string = "") {
    if (fs.realpathSync(pkg).startsWith(process.cwd())) {
      // We should not copy package that will be in the Docker context
      return;
    }
    this.logger.log("INFO", "Copying", pkg, "to linked modules");
    const packageInfo = Packager.loadPackageInfo(pkg);
    const includes = packageInfo.files || ["lib"];
    includes.push("package.json");
    if (includeModules) {
      includes.push("node_modules");
    }
    includes.forEach(p => {
      const includeDir = path.join(pkg, p);
      globSync(includeDir).forEach(src => {
        const rel = path.relative(pkg, src);
        this.logger.log("INFO", "Copying", src, `link_modules/${packageInfo.name}/${rel}`);
        fs.copySync(src, `link_modules/${packageInfo.name}/${rel}`, {
          filter: f => {
            // Do not copy symbolic link as they seems to pose problem
            return !fs.lstatSync(f).isSymbolicLink();
          }
        });
      });
    });

    this.scanLinkModules(pkg, src => {
      this.logger.log("INFO", "COPYING LINKED MODULE", src);
      this.copyPackageToLinkModules(src, true, pkg);
    });
  }

  scanLinkModules(absPath: string, onLinkModule: (src, relPath) => void) {
    const nodeModulesDir = path.join(absPath, "node_modules");
    const checkDir = modulesDir => {
      if (fs.existsSync(modulesDir)) {
        fs.readdirSync(modulesDir).forEach(f => {
          const stat = fs.lstatSync(path.join(modulesDir, f));
          if (stat.isSymbolicLink()) {
            onLinkModule(
              fs.realpathSync(path.join(modulesDir, f)),
              path.relative(nodeModulesDir, path.join(modulesDir, f))
            );
          }
          if (f.startsWith("@") && stat.isDirectory()) {
            checkDir(path.join(modulesDir, f));
          }
        });
      }
    };
    checkDir(nodeModulesDir);
  }

  /**
   * Return the instruction to add webda-shell in Docker
   *
   * If within development repository it will copy all local files
   * Otherwise just a simple yarn add
   */
  getDockerfileWebdaShell(): string {
    // If version is enforced
    if (process.env.WEBDA_SHELL_DEPLOY_VERSION) {
      return `# Install enforced @webda/shell version\nRUN yarn -W add @webda/shell@${process.env["WEBDA_SHELL_DEPLOY_VERSION"]}\n\n`;
    }

    // If version is set to dev
    if (process.env.WEBDA_SHELL_DEV) {
      let dockerfile = "# Use development Webda Shell version\n";
      this.logger.log("INFO", `Development version of @webda/shell (WEBDA_SHELL_DEV=${process.env.WEBDA_SHELL_DEV})`);
      // Copy webda-shell into build directory
      let sign = "";
      if (fs.existsSync(".webda-shell/hash")) {
        sign = fs.readFileSync(".webda-shell/hash").toString();
      }
      const currentSign = Packager.getPackageLastChanges(path.join(__dirname, "../.."), true);
      if (currentSign !== sign) {
        this.logger.log("INFO", "Updating @webda/shell version as development version is different");
        fs.emptyDirSync(".webda-shell");
        // Prevent to copy if in webda repo - only useful for test
        /* c8 ignore next 3 */
        if (path.relative(path.resolve(path.join(__dirname, "../../../..")), process.cwd()) !== "packages/shell") {
          fs.copySync(path.join(__dirname, "../../../.."), ".webda-shell");
        }
        fs.writeFileSync(".webda-shell/hash", currentSign);
      }
      dockerfile += `ADD .webda-shell /devshell
ADD .webda-shell/node_modules /devshell/node_modules/
ADD .webda-shell/node_modules /webda/node_modules/
ENV PATH=\${PATH}:/devshell/packages/shell/bin\n`;
      return dockerfile + "\n";
    }

    // Normal take the same version as local webda-shell
    const tag = JSONUtils.loadFile(__dirname + "/../../package.json").version;
    return `# Install current @webda/shell version\nRUN yarn -W add @webda/shell@${tag}\n\n`;
  }

  getDockerfileHeader() {
    return `FROM ${this.resources.baseImage}
LABEL webda.io/deployer=${this.name}
LABEL webda.io/deployment=${this.manager.getDeploymentName()}
LABEL webda.io/version=${this.getApplication().getWebdaVersion()}
LABEL webda.io/application=${this.getApplication().getPackageDescription().name}
LABEL webda.io/application/version=${this.getApplication().getPackageDescription().version}
EXPOSE 18080
RUN mkdir -p /webda
WORKDIR /webda
ADD package.json /webda/\n\n`;
  }

  getWorkspacesDockerfile(): string {
    const appPath = this.manager.getApplication().getAppPath();
    const relPath = path.relative(process.cwd(), appPath);

    let dockerfile = this.getDockerfileHeader();
    const packages = Packager.getWorkspacesPackages();
    packages.forEach(pack => {
      dockerfile += `ADD ${pack}/package.json /webda/${pack}/package.json\n`;
    });
    dockerfile += `RUN yarn install --production\n\n`;

    dockerfile += `# Copy all packages content\n`;
    packages.forEach(pack => {
      if (this.resources.excludePackages.indexOf(pack) >= 0) {
        return;
      }
      this.logger.log("INFO", "Include package", pack);
      dockerfile += this.copyPackageFilesTo(
        pack,
        `/webda/${pack}`,
        // Add webda.config.json on target package
        relPath === pack ? ["webda.config.json"] : undefined
      );
    });
    dockerfile += "\n";

    if (this.resources.includeLinkModules) {
      dockerfile += "# Add link modules to node_modules\n";
      this.scanLinkModules(process.cwd(), (src, rel) => {
        if (!src.startsWith(process.cwd())) {
          const root = Packager.getWorkspacesRoot(src);
          if (root) {
            this.logger.log("INFO", "Copying linked package workspace", rel);
            // Copy all workspace packages
            Packager.getWorkspacesPackages(root).forEach(p => {
              const pPath = path.join(root, p);
              if (fs.existsSync(path.join(pPath, "package.json"))) {
                const name = Packager.loadPackageInfo(pPath).name;
                this.logger.log("INFO", "Copying linked package workspace deps", name);
                dockerfile += `RUN rm -rf /webda/node_modules/${name}\n`;
                this.copyPackageToLinkModules(pPath);
              }
            });
          } else {
            this.logger.log("INFO", "Copying linked package", rel);
            // Remove current package
            dockerfile += `RUN rm -rf /webda/node_modules/${rel}\n`;
            this.copyPackageToLinkModules(src);
          }
        }
      });
      dockerfile += `ADD link_modules /webda/node_modules\n\n`;
    }

    // Include webda-shell
    dockerfile += this.getDockerfileWebdaShell();

    // Lerna operation finished
    dockerfile += `# Update WORKDIR to project\nWORKDIR ${path.join("/webda", relPath)}\n\n`;

    // Add deployment
    dockerfile += this.addDeploymentToImage(path.join(relPath, "deployments"), path.join("/webda", relPath));

    // Add commmand
    dockerfile += this.addCommandToImage();

    if (this.resources.debugDockerfilePath) {
      fs.writeFileSync(this.resources.debugDockerfilePath, dockerfile);
    }

    return dockerfile;
  }

  /**
   * Add the deployment export
   * @param localPath
   * @param appPath
   * @returns
   */
  addDeploymentToImage(localPath: string = "deployments", appPath: string = "/webda/") {
    const deployment = this.manager.getDeploymentName();
    const gitInfo = Buffer.from(JSON.stringify(this.app.getGitInformation())).toString("base64");
    if (deployment) {
      // Export deployment
      return `# Add deployment
COPY ${localPath} ${path.join(appPath, "deployments")}
RUN GIT_INFO=${gitInfo} /webda/node_modules/.bin/webda -d ${deployment} config --noCompile webda.config.json${
        fs.existsSync(this.getApplication().getAppPath("webda.config.jsonc")) ? "c" : ""
      }
RUN rm -rf deployments\n\n`;
    }
    return "";
  }

  copyPackageFilesTo(pkg: string, dst: string, addFiles: string[] = []) {
    const absPath = path.resolve(pkg);
    const packageInfo = Packager.loadPackageInfo(absPath);
    const includes = packageInfo.files || ["lib"];
    addFiles.forEach(f => {
      if (includes.indexOf(f) < 0) {
        includes.push(f);
      }
    });
    let dockerfile = `# Package ${pkg}\n`;
    includes.forEach(p => {
      if (fs.existsSync(path.join(pkg, p))) {
        dockerfile += `ADD ${path.join(pkg, p)} ${path.join(dst, p)}\n`;
      }
    });
    // Link modules
    if (this.resources.includeLinkModules) {
      let links = "";
      // Check for level1 and 2 symlink
      this.scanLinkModules(absPath, (src, rel) => {
        if (!src.startsWith(process.cwd())) {
          // Remove current package
          links += `RUN rm -rf ${dst}/node_modules/${rel} && rm -rf /webda/node_modules/${rel}\n`;
          this.copyPackageToLinkModules(src);
        }
      });
      if (links.length) {
        dockerfile += `# Linked packages to ${pkg}\n${links}`;
      }
    }
    return dockerfile;
  }

  addCommandToImage(): string {
    const { command } = this.resources;
    let { logFile, errorFile } = this.resources;
    if (logFile) {
      logFile = " > " + logFile;
    } else {
      logFile = "";
    }
    if (errorFile) {
      errorFile = " 2> " + errorFile;
    } else {
      errorFile = "";
    }
    return `# Change user
USER 1000
# Launch webda\nENV WEBDA_COMMAND='${command}'
CMD /webda/node_modules/.bin/webda --noCompile $WEBDA_COMMAND ${logFile} ${errorFile}\n\n`;
  }

  /**
   * Generate a dynamic Dockerfile with webda application
   */
  getDockerfile(): string {
    let dockerfile = this.getDockerfileHeader() + "RUN yarn install --production\n\n";

    dockerfile += `ENV PATH "$PATH:./node_modules/.bin/"`;
    dockerfile += this.copyPackageFilesTo(".", "/webda", ["webda.config.json", "webda.config.jsonc"]);
    // Import webda-shell
    dockerfile += this.getDockerfileWebdaShell();

    // Add deployment
    dockerfile += this.addDeploymentToImage("deployments", "/webda");
    // Add the packager date
    dockerfile += "RUN date > .webda.packaged\n";
    dockerfile += this.addCommandToImage();
    if (this.resources.debugDockerfilePath) {
      fs.writeFileSync(this.resources.debugDockerfilePath, dockerfile);
    }
    return dockerfile;
  }
}
