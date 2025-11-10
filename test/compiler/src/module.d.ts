// Fake module to test compiler behavior on such files (getOutputFileNames return undefined)
export type Window = {
    [key: string]: any;
    location?: {
        href: string;
    };
}

// To trigger error in compiler when generating schema
export class RandomClass {}