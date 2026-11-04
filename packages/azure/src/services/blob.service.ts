import {
  BlobSASPermissions,
  BlobServiceClient,
  generateBlobSASQueryParameters,
  newPipeline,
  StorageSharedKeyCredential
} from "@azure/storage-blob";
import {
  BinaryFile,
  BinaryFileInfo,
  BinaryMap,
  CloudBinary,
  CloudBinaryParameters,
  CoreModelWithBinary,
  OperationContext,
  SecretString,
  useModelId,
  WebdaError,
  normalizeHashes,
  normalizeHash
} from "@webda/core";
import {
  ContentBody,
  ContentExistsError,
  ContentGetOptions,
  ContentInfo,
  ContentNotFoundError,
  ContentPutOptions,
  parseContentUrl,
  toReadable
} from "@webda/utils";
import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { posix } from "node:path";
import { AzureServiceParameters, getAzureCredential, loadAzureParameters } from "./azure-parameters.js";
import { AzureContributor, AzureDeployerInfo, AzureResourceContribution } from "./contributors.js";

/** Blob storage settings. Shared keys are optional; managed identity is preferred. */
export class AzureBlobBinaryParameters extends CloudBinaryParameters implements AzureServiceParameters {
  account?: string;
  connectionString?: string | SecretString;
  container!: string;
  endpoint?: string;
  tenantId?: string;
  clientId?: string;
  clientSecret?: string | SecretString;
  subscriptionId?: string;
  createContainer = false;
  /** Override the Blob API/SAS version for older Azurite installations. */
  serviceVersion?: string;
  pendingTimeout = 3600;

  /**
   * Perform load.
   * @override
   */
  load(params: any = {}): this {
    super.load(params);
    return loadAzureParameters(this);
  }
}

interface PendingUpload {
  info: BinaryFileInfo;
  stagingKey: string;
  created: number;
}

/** Blob-backed binaries with verified direct uploads and exact ownership markers.
 * @WebdaModda
 */
export class AzureBlobBinary extends CloudBinary<AzureBlobBinaryParameters> implements AzureContributor {
  static Parameters = AzureBlobBinaryParameters;
  readonly schemes = ["azure", "azblob"];
  protected client!: BlobServiceClient;

  /**
   * Perform init.
   * @override
   */
  async init(): Promise<this> {
    const p = this.parameters;
    if (p.connectionString !== undefined) {
      this.client = BlobServiceClient.fromConnectionString(SecretString.from(p.connectionString, "connectionString"));
      if (p.endpoint) this.client = new BlobServiceClient(p.endpoint, this.client.credential);
    } else {
      if (!p.account) throw new WebdaError.BadRequest("Azure Blob storage requires account or connectionString");
      this.client = new BlobServiceClient(
        p.endpoint ?? `https://${p.account}.blob.core.windows.net`,
        getAzureCredential(p)
      );
    }
    if (p.serviceVersion) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(p.serviceVersion))
        throw new WebdaError.BadRequest("Invalid Azure Blob serviceVersion");
      const pipeline = newPipeline(this.client.credential);
      pipeline.factories.push({
        create(next) {
          return {
            sendRequest(request) {
              request.headers.set("x-ms-version", p.serviceVersion!);
              return next.sendRequest(request);
            }
          };
        }
      });
      this.client = new BlobServiceClient(this.client.url, pipeline);
    }
    if (p.createContainer) await this.client.getContainerClient(p.container).createIfNotExists();
    await super.init();
    return this;
  }

  /**
   * Perform get content bucket.
   * @override
   */
  getContentBucket(): string {
    return this.parameters.container;
  }

  /**
   * Resolve a content URL to a configured Blob SDK client.
   * @param url - Content URL
   * @returns The blob result
   */
  protected blob(url: string) {
    const target = parseContentUrl(url, this.parameters.container);
    // A content URL cannot redirect this client's credentials to another endpoint.
    if (target.endpoint || target.credential)
      throw new WebdaError.BadRequest("Use configured Azure Blob endpoint and credentials");
    return this.client.getContainerClient(target.bucket ?? this.parameters.container).getBlockBlobClient(target.key);
  }

  /**
   * Perform get content.
   * @override
   */
  async getContent(url: string, options?: ContentGetOptions): Promise<Readable> {
    try {
      const range = options?.range;
      const response = await this.blob(url).download(
        range?.start,
        range?.end === undefined ? undefined : range.end - (range?.start ?? 0) + 1
      );
      return response.readableStreamBody as Readable;
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode === 404) throw new ContentNotFoundError(url);
      throw error;
    }
  }

  /**
   * Perform put content.
   * @override
   */
  async putContent(url: string, body: ContentBody, options?: ContentPutOptions): Promise<ContentInfo> {
    try {
      const result = await this.blob(url).uploadStream(toReadable(body), undefined, undefined, {
        blobHTTPHeaders: { blobContentType: options?.contentType ?? "application/octet-stream" },
        metadata: options?.metadata,
        conditions: options?.ifNotExists ? { ifNoneMatch: "*" } : undefined
      });
      return {
        url,
        size: options?.contentLength,
        etag: result.etag,
        contentType: options?.contentType,
        metadata: options?.metadata,
        lastModified: result.lastModified
      };
    } catch (error) {
      if (options?.ifNotExists && [409, 412].includes((error as { statusCode: number }).statusCode))
        throw new ContentExistsError(url);
      throw error;
    }
  }

  /**
   * Perform head content.
   * @override
   */
  async headContent(url: string): Promise<ContentInfo | undefined> {
    try {
      const info = await this.blob(url).getProperties();
      return {
        url,
        size: info.contentLength,
        contentType: info.contentType,
        etag: info.etag,
        metadata: info.metadata,
        lastModified: info.lastModified
      };
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode === 404) return undefined;
      throw error;
    }
  }

  /**
   * Perform delete content.
   * @override
   */
  async deleteContent(url: string): Promise<void> {
    await this.blob(url).deleteIfExists();
  }

  /**
   * Perform _get.
   * @override
   */
  async _get(info: BinaryMap): Promise<Readable> {
    this.checkHash(info.hash);
    return this.getContent(this.getContentUrl(this._getKey(info.hash)));
  }

  /**
   * Perform get signed url from map.
   * @override
   */
  async getSignedUrlFromMap(map: BinaryMap, expires: number, _context: OperationContext): Promise<string> {
    this.checkHash(map.hash);
    return this.getSignedUrl(this._getKey(map.hash), "r", expires);
  }

  /**
   * Issue narrowly scoped SAS credentials. Direct uploads only create isolated staging blobs.
   * @param key - Object key within the container
   * @param permissions - Permissions granted by the SAS
   * @param expires - SAS lifetime in seconds
   * @returns The signed url result
   */
  async getSignedUrl(key: string, permissions: "r" | "c" = "r", expires = this.parameters.urlExpiry): Promise<string> {
    if (!Number.isFinite(expires) || expires <= 0 || expires > 7 * 86400 - 600)
      throw new WebdaError.BadRequest("SAS expiry must be positive and less than seven days");
    const startsOn = new Date(Date.now() - 300000),
      expiresOn = new Date(Date.now() + expires * 1000);
    const values = {
      containerName: this.parameters.container,
      blobName: key,
      permissions: BlobSASPermissions.parse(permissions),
      startsOn,
      expiresOn,
      version: this.parameters.serviceVersion
    };
    const credential = this.client.credential;
    const sas =
      credential instanceof StorageSharedKeyCredential
        ? generateBlobSASQueryParameters(values, credential)
        : generateBlobSASQueryParameters(
            values,
            await this.client.getUserDelegationKey(startsOn, expiresOn),
            this.client.accountName
          );
    return `${this.client.getContainerClient(this.parameters.container).getBlobClient(key).url}?${sas.toString()}`;
  }

  /**
   * Validate a hash before using it in a storage key.
   * @param hash - Normalized content hash
   * @returns The check hash result
   */
  protected checkHash(hash?: string): asserts hash is string {
    if (!hash || !/^[0-9a-f]{32}$/.test(hash)) throw new WebdaError.BadRequest("Invalid binary hash");
  }

  /**
   * Build an injective ownership marker from the model, attribute and key.
   * @param model - Model class or model identifier
   * @param property - Binary or model attribute
   * @param uuid - Owner primary key
   * @returns The marker result
   */
  protected marker(model: string, property: string, uuid: string): string {
    return (
      "@" +
      [model, property, uuid]
        .map(part =>
          [...Buffer.from(part)]
            .map(byte => {
              const character = String.fromCharCode(byte);
              return /[A-Za-z0-9.:@-]/.test(character)
                ? character
                : `~${byte.toString(16).toUpperCase().padStart(2, "0")}`;
            })
            .join("")
        )
        .join("_")
    );
  }

  /**
   * Build the private pending-upload record key.
   * @param object - Model owning the binary
   * @param property - Binary or model attribute
   * @param hash - Normalized content hash
   * @returns The pending key result
   */
  protected pendingKey(object: CoreModelWithBinary, property: string, hash: string): string {
    return posix.join(
      this.parameters.prefix ?? "",
      "_pending",
      hash,
      this.marker(useModelId(object.constructor)!, property, object.getUUID())
    );
  }

  /**
   * Persist an exact ownership marker and attach the verified file.
   * @param object - Model owning the binary
   * @param property - Binary or model attribute
   * @param info - Binary metadata or increment specification
   */
  protected async attach(object: CoreModelWithBinary, property: string, info: BinaryFileInfo): Promise<void> {
    const model = useModelId(object.constructor)!;
    await this.putContent(
      this.getContentUrl(this._getKey(info.hash!, this.marker(model, property, object.getUUID()))),
      "",
      { metadata: { webdamodel: model } }
    );
    await this.uploadSuccess(object, property, info);
  }

  /**
   * Perform store.
   * @override
   */
  async store(object: CoreModelWithBinary, property: string, file: BinaryFile): Promise<void> {
    this.checkMap(object, property);
    const computed = await this.verifiedHashes(file);
    const url = this.getContentUrl(this._getKey(computed.hash));
    try {
      await this.putContent(url, await file.get(), {
        ifNotExists: true,
        metadata: { ...file.metadata, webdaproof: computed.challenge },
        contentType: file.mimetype,
        contentLength: file.size
      });
    } catch (error) {
      if (!(error instanceof ContentExistsError)) throw error;
    }
    const stored = await this.headContent(url);
    if (stored?.metadata?.webdaproof !== computed.challenge)
      throw new WebdaError.Conflict("Stored binary proof does not match");
    await this.attach(object, property, { ...file.toBinaryFileInfo(), size: stored.size! });
  }

  /**
   * Perform put redirect url.
   * @override
   */
  async putRedirectUrl(
    object: CoreModelWithBinary,
    property: string,
    info?: BinaryFileInfo,
    context?: OperationContext<BinaryFileInfo>
  ) {
    info = normalizeHashes(info ?? (await context?.getInput()));
    this.checkHash(info?.hash);
    if (!info?.challenge || !/^[0-9a-f]{32}$/.test(info.challenge))
      throw new WebdaError.BadRequest("Upload challenge is required");
    this.checkMap(object, property);
    const stored = await this.headContent(this.getContentUrl(this._getKey(info.hash)));
    if (stored?.metadata?.webdaproof === info.challenge) {
      if (this.parameters.maxUploadSize !== undefined && stored.size! > this.parameters.maxUploadSize)
        throw new WebdaError.BadRequest("File too big");
      await this.attach(object, property, { ...info, size: stored.size! });
      return undefined;
    }
    const stagingKey = posix.join(this.parameters.prefix ?? "", "_staging", randomUUID());
    const pending: PendingUpload = { info, stagingKey, created: Date.now() };
    await this.putContent(this.getContentUrl(this.pendingKey(object, property, info.hash)), JSON.stringify(pending), {
      contentType: "application/json"
    });
    return {
      url: await this.getSignedUrl(stagingKey, "c"),
      method: "PUT",
      headers: {
        "x-ms-blob-type": "BlockBlob",
        "Content-Type": "application/octet-stream",
        "Content-MD5": Buffer.from(info.hash, "hex").toString("base64")
      }
    };
  }

  /**
   * Verify the bytes before copying them to the content hash and attaching them to the owner.
   * @override
   */
  async completeUpload(object: CoreModelWithBinary, property: string, hash: string): Promise<void> {
    hash = normalizeHash(hash);
    this.checkHash(hash);
    this.checkMap(object, property);
    if (this.isLinked(object, property, hash, await this.getStoredValue(object, property))) return;
    const pendingUrl = this.getContentUrl(this.pendingKey(object, property, hash));
    const pendingBlob = this.blob(pendingUrl);
    let response;
    try {
      response = await pendingBlob.download();
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode === 404) throw new WebdaError.NotFound("No pending upload");
      throw error;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of response.readableStreamBody as Readable) chunks.push(Buffer.from(chunk));
    const pending: PendingUpload = JSON.parse(Buffer.concat(chunks).toString());
    if (Date.now() - pending.created > this.parameters.pendingTimeout * 1000)
      throw new WebdaError.PreconditionFailed("Pending upload expired");
    const stagingUrl = this.getContentUrl(pending.stagingKey);
    const head = await this.headContent(stagingUrl);
    if (!head) throw new WebdaError.PreconditionFailed("Upload not found");
    const max = this.parameters.maxUploadSize;
    if ((pending.info.size !== undefined && pending.info.size !== head.size) || (max !== undefined && head.size! > max))
      throw new WebdaError.BadRequest("Uploaded size does not match");
    const md5 = createHash("md5"),
      proof = createHash("md5").update("WEBDA");
    const stagingBlob = this.blob(stagingUrl);
    const read = async () =>
      (await stagingBlob.download(0, undefined, { conditions: { ifMatch: head.etag } })).readableStreamBody as Readable;
    for await (const chunk of await read()) {
      md5.update(chunk);
      proof.update(chunk);
    }
    const challenge = proof.digest("hex");
    if (md5.digest("hex") !== hash || challenge !== pending.info.challenge)
      throw new WebdaError.BadRequest("Uploaded content does not match the challenge");
    const url = this.getContentUrl(this._getKey(hash));
    try {
      await this.putContent(url, await read(), {
        ifNotExists: true,
        metadata: { ...pending.info.metadata, webdaproof: challenge },
        contentType: pending.info.mimetype,
        contentLength: head.size
      });
    } catch (error) {
      if (!(error instanceof ContentExistsError)) throw error;
    }
    if ((await this.headContent(url))?.metadata?.webdaproof !== challenge)
      throw new WebdaError.Conflict("Stored binary proof does not match");
    await this.attach(object, property, { ...pending.info, hash, size: head.size! });
    await pendingBlob.delete({ conditions: { ifMatch: response.etag } });
    await this.deleteContent(stagingUrl);
  }

  /**
   * Perform get usage count.
   * @override
   */
  async getUsageCount(hash: string): Promise<number> {
    let count = 0;
    for await (const blob of this.client
      .getContainerClient(this.parameters.container)
      .listBlobsFlat({ prefix: this._getKey(hash, "") + "/" })) {
      if (blob.name !== this._getKey(hash)) count++;
    }
    return count;
  }

  /**
   * Perform _clean usage.
   * @override
   */
  async _cleanUsage(hash: string, uuid: string, attribute: string, model: string): Promise<void> {
    if (!attribute || !model) return;
    await this.deleteContent(this.getContentUrl(this._getKey(hash, this.marker(model, attribute, uuid))));
    if ((await this.getUsageCount(hash)) === 0) await this.deleteContent(this.getContentUrl(this._getKey(hash)));
  }

  /**
   * Describe the Azure resources and identity permissions required by this service.
   * @param deployer - Deployment scope and identity helpers
   * @returns The azure resources result
   */
  getAzureResources(deployer: AzureDeployerInfo): AzureResourceContribution {
    if (!this.parameters.account) return {};
    const name = `${this.parameters.account}/default/${this.parameters.container}`;
    const scope = `/subscriptions/${deployer.resources.subscriptionId}/resourceGroups/${deployer.resources.resourceGroup}/providers/Microsoft.Storage/storageAccounts/${this.parameters.account}/blobServices/default/containers/${this.parameters.container}`;
    return {
      resources: [
        {
          type: "Microsoft.Storage/storageAccounts/blobServices/containers",
          apiVersion: "2023-05-01",
          name,
          properties: { publicAccess: "None" }
        }
      ],
      roleAssignments: [
        {
          scope,
          roleDefinitionId: `/subscriptions/${deployer.resources.subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/ba92f5b4-2d11-453d-a403-e96b0029c9fe`
        },
        {
          scope: scope.split("/blobServices/")[0],
          roleDefinitionId: `/subscriptions/${deployer.resources.subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/db58b8e5-c6ad-4a2a-8342-4190687cbf4a`
        }
      ],
      env: { AZURE_STORAGE_ACCOUNT: this.parameters.account }
    };
  }
}
