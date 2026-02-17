import { Model, ModelLink, ModelLinksSimpleArray, ModelRelated } from "./webda";

export abstract class TimeLimitedRelation<T extends Model, K extends Model> extends Model {
  PrimaryKey: "nodeA" | "nodeB" | "since";
  nodeA: ModelLink<T>;
  nodeB: ModelLink<K>;
  since: Date;
  until?: Date;

  iterate(interval: "1d", nodeAUuid: string) {}
}
export class CVEForPackage extends TimeLimitedRelation<CVE, Package> {}

export class CVE extends Model {
  declare PrimaryKey: "uuid";
  /**
   * This can be CVE_2024_24156 or GHSA_...
   */
  uuid: string;
  description: string;
  severity: string;
  published: Date;
  updated: Date;
  cvss: string;
}

export class Package extends Model {
  declare PrimaryKey: "name" | "version" | "type";
  version: string;
  name: string;
  type: string;
}

export class Container extends Model {
  declare PrimaryKey: "digest";
  packages: ModelLinksSimpleArray<Package>;
  name: string;
  digest: string;
}

export class ContainerForCluster extends TimeLimitedRelation<Cluster, Container> {}

export class Cluster extends Model {
  declare PrimaryKey: "name";

  containers: ModelRelated<ContainerForCluster>;
  name: string;
  description: string;
}

(async () => {
  const cluster = await Cluster.create({
    name: "test",
    description: "test"
  });

  const container = await Container.create({
    name: "test",
    digest: "test"
  });

  await ContainerForCluster.create({
    nodeA: cluster,
    nodeB: container,
    since: new Date()
  });

  const cve = await CVE.create({
    description: "test",
    severity: "test",
    published: new Date(),
    updated: new Date(),
    cvss: "test"
  });

  const pkg = await Package.create({
    name: "test",
    version: "test",
    type: "test"
  });

  CVE.on("Create", ({ object }) => {
    console.log(object.uuid);
  });
  CVEForPackage.ref({
    nodeA: cve.getUuid(),
    nodeB: pkg.getUuid(),
    since: new Date()
  });
  await CVEForPackage.create({
    nodeA: cve,
    nodeB: pkg,
    since: new Date()
  });
  CVEForPackage.query("nodeA.uuid = 'CVE_2024_24156'");
})();
