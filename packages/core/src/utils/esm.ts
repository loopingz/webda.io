import * as path from "path";
import * as url from "url";

export function getCommonJS(urlInfo: string) {
  const __filename = url.fileURLToPath(urlInfo);
  return {
    __dirname: path.dirname(__filename),
    __filename,
  };
}
