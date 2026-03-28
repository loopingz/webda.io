import { ServiceParameters } from "./serviceparameters.js";
export class CryptoServiceParameters extends ServiceParameters {
    load(params = {}) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        super.load(params);
        this.symetricKeyLength ?? (this.symetricKeyLength = 256);
        this.symetricCipher ?? (this.symetricCipher = "aes-256-ctr");
        this.asymetricType ?? (this.asymetricType = "rsa");
        this.asymetricOptions ?? (this.asymetricOptions = {});
        (_a = this.asymetricOptions).modulusLength ?? (_a.modulusLength = 2048);
        (_b = this.asymetricOptions).privateKeyEncoding ?? (_b.privateKeyEncoding = {});
        (_c = this.asymetricOptions.privateKeyEncoding).format ?? (_c.format = "pem");
        (_d = this.asymetricOptions.privateKeyEncoding).type ?? (_d.type = "pkcs8");
        (_e = this.asymetricOptions).publicKeyEncoding ?? (_e.publicKeyEncoding = {});
        (_f = this.asymetricOptions.publicKeyEncoding).format ?? (_f.format = "pem");
        (_g = this.asymetricOptions.publicKeyEncoding).type ?? (_g.type = "spki");
        this.jwt ?? (this.jwt = {});
        (_h = this.jwt).algorithm ?? (_h.algorithm = "HS256");
        return this;
    }
}
//# sourceMappingURL=icryptoservice.js.map