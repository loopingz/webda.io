import { Readable } from "stream";
import * as WebdaError from "../errors/errors.js";
import { Service } from "./service.js";
import { ServiceParameters } from "./serviceparameters.js";
import { Counter } from "../metrics/metrics.js";
import { IOperationContext } from "../contexts/icontext.js";
import { IStore } from "../core/icore.js";
import { MappingService } from "../stores/istore.js";
import { Model, Storable, WEBDA_STORAGE } from "@webda/models";
/**
 * Represent basic EventBinary
 */
export interface EventBinary {
    object: BinaryFileInfo;
    service: BinaryService;
}
export interface EventBinaryUploadSuccess<T extends Storable = Storable> extends EventBinary {
    target: T;
}
/**
 * Sent before metadata are updated to allow alteration of the modification
 */
export interface EventBinaryMetadataUpdate<T extends Storable = Storable> extends EventBinaryUploadSuccess<T> {
    target: T;
    metadata: BinaryMetadata;
}
/**
 * Emitted if binary does not exist
 */
export declare class BinaryNotFoundError extends WebdaError.CodeError {
    constructor(hash: string, storeName: string);
}
export interface BinaryFileInfo<T extends object = {}> {
    /**
     * Hash of the binary
     */
    hash?: string;
    /**
     * Will be computed by the service
     *
     * hash of the content prefixed by 'WEBDA'
     */
    challenge?: string;
    /**
     * Size of the file
     */
    size: number;
    /**
     * Name of the file
     */
    name: string;
    /**
     * Mimetype
     */
    mimetype: string;
    /**
     * Metadatas stored along with the binary
     */
    metadata?: T;
}
/**
 * Represent files attached to a model
 */
export type BinaryFiles<T extends object = {}> = BinaryFileInfo<T>[];
/**
 * Represent a file to store
 * @WebdaSchema
 */
export declare abstract class BinaryFile<T extends object = {}> implements BinaryFileInfo<T> {
    /**
     * Current name
     */
    name: string;
    /**
     * Original name
     */
    originalname?: string;
    /**
     * Size of the binary
     */
    size: number;
    /**
     * Mimetype of the binary
     */
    mimetype: string;
    /**
     * Will be computed by the service
     *
     * hash of the content prefixed by 'WEBDA'
     */
    challenge?: string;
    /**
     * Will be computed by the service
     *
     * hash of the content
     */
    hash?: string;
    /**
     * Metadatas stored along with the binary
     */
    metadata?: T;
    constructor(info: BinaryFileInfo<T>);
    /**
     * Set the information
     * @param info
     */
    set(info: BinaryFileInfo<T>): void;
    /**
     * Retrieve a plain BinaryFileInfo object
     * @returns
     */
    toBinaryFileInfo(): BinaryFileInfo<T>;
    abstract get(): Promise<Readable>;
    /**
     * Create hashes
     * @param buffer
     * @returns
     */
    getHashes(): Promise<{
        hash: string;
        challenge: string;
    }>;
}
export declare class LocalBinaryFile extends BinaryFile {
    /**
     * Path on the hard drive
     */
    path: string;
    constructor(filePath: string);
    /**
     * @override
     */
    get(): Promise<Readable>;
}
export declare class MemoryBinaryFile extends BinaryFile {
    /**
     * Content
     */
    buffer: Buffer;
    constructor(buffer: Buffer | string, info?: Partial<BinaryFileInfo>);
    /**
     * @override
     */
    get(): Promise<Readable>;
}
/**
 * Define the metadata for a Binary
 */
export type BinaryMetadata = any;
/**
 * This is a map used to retrieve binary
 *
 * @class BinaryMap
 */
export declare class BinaryMap<T extends object = {}> extends BinaryFile<T> {
    /**
     * Link to the binary store
     */
    [WEBDA_STORAGE]: {
        service: BinaryService;
    };
    constructor(service: BinaryService, obj: BinaryFileInfo<T>);
    /**
     * Get the binary data
     *
     * @returns
     */
    get(): Promise<Readable>;
    /**
     * Get into a buffer
     */
    getAsBuffer(): Promise<Buffer>;
    /**
     * Download the binary to a path
     *
     * Shortcut to call {@link Binary.downloadTo} with current object
     *
     * @param filename
     */
    downloadTo(filename: string): Promise<void>;
}
/**
 * One Binary instance
 * @readOnly
 * @dtoIn skip
 */
export declare class Binary<T extends object = {}> extends BinaryMap<T> {
    [WEBDA_STORAGE]: {
        model: Model;
        attribute: string;
        service: BinaryService;
        empty: boolean;
    };
    constructor(attribute: string, model: Model);
    /**
     * isEmpty
     * @returns
     */
    isEmpty(): boolean;
    /**
     * Ensure empty is set correctly
     * @param info
     */
    set(info: BinaryFileInfo<T>): void;
    /**
     * Replace the binary
     * @param id
     * @param ctx
     * @returns
     */
    upload(file: BinaryFile<T>): Promise<void>;
    /**
     * Delete the binary, if you need to replace just use upload
     */
    delete(): Promise<void>;
    /**
     * Return undefined if no hash
     * @returns
     */
    toJSON(): BinaryFileInfo<T> | undefined;
}
/**
 * Define a Binary map stored in a Binaries collection
 */
export declare class BinariesItem<T extends object = {}> extends BinaryMap<T> {
    [WEBDA_STORAGE]: {
        service: BinaryService;
        parent: BinariesImpl<T>;
    };
    constructor(parent: BinariesImpl<T>, info: BinaryFileInfo<T>);
    /**
     * Replace the binary
     * @param id
     * @param ctx
     * @returns
     */
    upload(file: BinaryFile<T>): Promise<void>;
    /**
     * Delete the binary, if you need to replace just use upload
     */
    delete(): Promise<void>;
}
/**
 * Define a collection of Binary
 * @dtoIn skip
 */
export declare class BinariesImpl<T extends object = {}> extends Array<BinariesItem<T>> {
    protected [WEBDA_STORAGE]: {
        model: Model;
        attribute: string;
        service: BinaryService;
    };
    static fromDto(data: never): void;
    assign(model: Model, attribute: string): this;
    pop(): BinariesItem<T>;
    slice(): BinariesItem<T>[];
    unshift(): number;
    shift(): BinariesItem<T>;
    push(...args: any[]): number;
    /**
     * Upload a file to this model
     * @param file
     */
    upload(file: BinaryFile<T>, replace?: BinariesItem<T>): Promise<void>;
    /**
     * Delete an item
     * @param item
     */
    delete(item: BinariesItem<T>): Promise<void>;
}
/**
 * Define a collection of Binary with a Readonly and the upload method
 */
export type Binaries<T extends object = {}> = Readonly<Array<BinariesItem<T>>> & {
    upload: (file: BinaryFile<T>) => Promise<void>;
};
export declare class BinaryParameters extends ServiceParameters {
    /**
     * max file size
     */
    protected _maxFileSize: number;
    /**
     * Define the map of models
     * * indicates all models
     *
     * key is a Store name
     * the string[] represent all valids attributes to store files in * indicates all attributes
     */
    models: {
        [key: string]: string[];
    };
    /**
     * Define the maximum filesize to accept as direct upload
     *
     * @default 10 MB
     */
    set maxFileSize(value: number | string);
    get maxFileSize(): number;
    load(params?: any): this;
}
export type BinaryEvents = {
    /**
     * Emitted when someone download a binary
     */
    "Binary.Get": EventBinary;
    "Binary.UploadSuccess": EventBinaryUploadSuccess;
    "Binary.MetadataUpdate": EventBinaryMetadataUpdate;
    "Binary.MetadataUpdated": EventBinaryUploadSuccess;
    "Binary.Create": EventBinaryUploadSuccess;
    "Binary.Delete": EventBinary;
};
/**
 * Define a BinaryModel with infinite field for binary map
 */
export type CoreModelWithBinary<T = {
    [key: string]: BinaryMap[] | BinaryMap;
}> = Model & T;
/**
 * This is an abstract service to represent a storage of files
 * The binary allow you to expose this service as HTTP
 *
 * It supports two modes:
 *  - attached to a CoreModel (attach, detach, reattach)
 *  - pure storage with no managed id (read, write, delete)
 *
 * As we have deduplication builtin you can get some stats
 * - getUsageCount(hash)
 * - getUsageCountForRaw()
 * - getUsageCountForMap()
 *
 * The Binary storage should store only once a binary and reference every object that are used by this binary, so it can be cleaned.
 *
 *
 * @see FileBinary
 * @see S3Binary
 *
 * @exports
 * @abstract
 * @WebdaModda Binary
 */
export declare abstract class BinaryService<T extends BinaryParameters = BinaryParameters, E extends BinaryEvents = BinaryEvents> extends Service<T, E> implements MappingService<BinaryMap> {
    _lowercaseMaps: any;
    metrics: {
        upload: Counter;
        download: Counter;
        delete: Counter;
        metadataUpdate: Counter;
    };
    /**
     * @override
     */
    initMetrics(): void;
    /**
     * Get a UrlFromObject
     *
     */
    getRedirectUrlFromObject(binaryMap: BinaryMap, _context: IOperationContext, _expires?: number): Promise<null | string>;
    /**
     * Define if binary is managed by the store
     * @param modelName
     * @param attribute
     * @returns -1 if not managed, 0 if managed but by default, 1 if managed and in the map, 2 if explicit with attribute and model
     */
    handleBinary(modelName: string, attribute: string): -1 | 0 | 1 | 2;
    /**
     * When you store a binary to be able to retrieve it you need to store the information into another object
     *
     * If you have a User object define like this : User = {'name': 'Remi', 'uuid': 'Loopingz'}
     * You will call the `store(userStore, 'Loopingz', 'images', filedata, {'type':'profile'})`
     * After a successful call the object will look like
     * ```
     * User = {
     *  'name': 'Remi',
     *  'uuid': 'Loopingz',
     *  'images': [
     *    {'type':'profile','hash':'a12545...','size':1245,'mime':'application/octet'}
     *   ]
     * }
     * ```
     *
     *
     * @param {CoreModel} object The object uuid to get from the store
     * @param {String} property The object property to add the file to
     * @param {Object} file The file by itself
     * @param {Object} metadata to add to the binary object
     * @emits 'binaryCreate'
     */
    abstract store(object: Storable, property: string, file: BinaryFile, metadata?: BinaryMetadata): Promise<void>;
    /**
     * The store can retrieve how many time a binary has been used
     */
    abstract getUsageCount(hash: string): Promise<number>;
    /**
     * Delete a binary
     *
     * @param {CoreModel} object The object uuid to get from the store
     * @param {String} property The object property to add the file to
     * @param {Number} index The index of the file to change in the property
     * @emits 'binaryDelete'
     */
    abstract delete(object: Storable, property: string, index?: number): Promise<void>;
    /**
     * Get a binary
     *
     * @param {Object} info The reference stored in your target object
     * @emits 'binaryGet'
     */
    get(info: BinaryMap): Promise<Readable>;
    /**
     * Download a binary to a file
     *
     * @param {Object} info The reference stored in your target object
     * @param {String} filepath to save the binary to
     */
    downloadTo(info: BinaryMap, filename: any): Promise<void>;
    abstract _get(info: BinaryMap): Promise<Readable>;
    /**
     * Based on the raw Map init a BinaryMap
     * @param obj
     * @returns
     */
    newModel(obj: any): BinaryMap;
    /**
     * Read a stream to a buffer
     *
     * @param stream
     * @returns
     */
    static streamToBuffer(stream: Readable): Promise<Buffer>;
    /**
     * Check if a map is defined
     *
     * @param name
     * @param property
     */
    protected checkMap(object: Model, property: string): void;
    /**
     * Ensure events are sent correctly after an upload and update the BinaryFileInfo in targetted object
     */
    uploadSuccess(object: CoreModelWithBinary, property: string, fileInfo: BinaryFileInfo | {
        toBinaryFileInfo: () => BinaryFileInfo;
    }): Promise<void>;
    /**
     * Cascade delete the object
     *
     * @param info of the map
     * @param uuid of the object
     */
    abstract cascadeDelete(info: BinaryMap, uuid: string): Promise<void>;
    /**
     *
     * @param targetStore
     * @param object
     * @param property
     * @param index
     * @returns
     */
    deleteSuccess(object: CoreModelWithBinary, property: string, index?: number): Promise<any>;
    /**
     * Get file either from multipart post or raw
     * @param req
     * @returns
     */
    getFile(req: IOperationContext): Promise<BinaryFile>;
    /**
     * Return the name of the service for OpenAPI
     * @returns
     */
    protected getOperationName(): string;
    /**
     * Based on the request parameter verify it match a known mapping
     * @param ctx
     * @returns
     */
    protected verifyMapAndStore(ctx: IOperationContext): IStore;
    /**
     * By default no challenge is managed so throws 404
     *
     */
    putRedirectUrl(...args: any): Promise<{
        url: string;
        method?: string;
        headers?: {
            [key: string]: string;
        };
    }>;
}
//# sourceMappingURL=binary.d.ts.map