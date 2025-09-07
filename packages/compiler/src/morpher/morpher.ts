import { Project, ProjectOptions, SourceFile } from "ts-morph";
import { setLoadParameters } from "./loadparameters";
import { updateImports } from "./imports";
import { deserializer } from "./deserialize";
import { useLog, useWorkerOutput } from "@webda/workout";
import { Diff } from "diff";
import { EventEmitter } from "stream";

// Replace all imports
// Specify after a : the exported name to replace
const replacePackages = {
  // Move to tsc-esm
  "@webda/core:DeepPartial,NotEnumerable,FilterAttributes": "@webda/tsc-esm",
  // Move to @webda/fs
  "@webda/core:FileStore,FileBinary,FileQueue,FileQueueParameters": "@webda/fs",
  // Move to @webda/utils
  "@webda/core:Throttler,NDJSONStream,NDJSonReader,BufferWritableStream,GunzipConditional,StorageFinder,YAMLUtils,TransformCase,TransformCaseType,getCommonJS,JSONUtils,FileUtils,WaitFor,WaitLinearDelay,WaitDelayer,sleep,WaitExponentialDelay,WaitDelayerFactory,WaitDelayerDefinition,WaitDelayerFactories,CancelablePromise,CancelableLoopPromise":
    "@webda/utils",
  // Move to @webda/test
  "@testdeck/mocha": "@webda/test",
  // Rename WebdaQL to WebdaQL in its own module
  "@webda/core:WebdaQL": "@webda/ql:*WebdaQL",
  // Rename CoreModelDefinition to ModelClass
  "@webda/core:CoreModelDefinition": "@webda/core:ModelClass",
  "@webda/core/lib/test:WebdaTest": "@webda/core/lib/test/test:WebdaApplicationTest",
  "@webda/core/lib/test:WebdaSimpleTest": "@webda/core/lib/test/test:WebdaSimpleTest"
};

// TODO Replace getUuid() by getUUID() for Model
// TODO Replace this.metrics to this[WEBDA_METRICS] in Services
// TODO Ensure tsconfig.json does not have experimentalDecorators true

type WebdaMorpherOptions = {
  project?: ProjectOptions;
  pretend?: boolean;
  /**
   * List of modules to check
   */
  modules?: string[];
};

export class WebdaMorpher {
  project: Project;
  modules: { [key: string]: (sourceFile: SourceFile) => void } = {
    unserializer: sourceFile => deserializer(sourceFile, this.project.getTypeChecker()),
    loadParameters: setLoadParameters,
    updateImports: sourceFile => updateImports(sourceFile, replacePackages)
  };

  constructor(protected options: WebdaMorpherOptions = {}) {
    this.project = new Project(options.project);
    this.options.modules ??= Object.keys(this.modules);
  }

  /**
   * Update the source files
   * @returns
   */
  async check() {
    const p: Promise<void>[] = [];
    const sourceFiles = this.project.getSourceFiles();
    useWorkerOutput().startProgress("check", sourceFiles.length, "Updating source files");
    sourceFiles.forEach(sourceFile => {
      const origin = sourceFile.getFullText();
      const update = this.update(sourceFile);
      if (origin !== update) {
        if (this.options.pretend) {
          useLog(
            "INFO",
            sourceFile.getFilePath(),
            "\n",
            Diff.diffLines(origin, update, {
              ignoreWhitespace: true,
              ignoreNewlineAtEof: true,
              newlineIsToken: false
            })
          );
          useWorkerOutput().incrementProgress();
        } else {
          p.push(
            sourceFile
              .save()
              .catch(e => useLog("ERROR", "Error saving", sourceFile.getFilePath(), e))
              .finally(() => {
                useWorkerOutput().incrementProgress();
              })
          );
        }
      }
    });
    return await Promise.all(p);
  }

  /**
   * Parse on file and return the updated content
   * @param input
   * @returns
   */
  update(input: string | SourceFile): string {
    const sourceFile = typeof input === "string" ? this.project.addSourceFileAtPath(input) : input;

    for (const key in this.modules) {
      if (this.options.modules.includes(key)) {
        this.modules[key](sourceFile);
      }
    }

    return sourceFile.getFullText();
  }
}
