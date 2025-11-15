export class MyObject {
    public required!: string;
    public optional?: number;
    // Allow undefined values because optional properties may be undefined
    [name: string]: string|number|undefined;
}
