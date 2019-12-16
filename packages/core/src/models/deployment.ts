export default interface Deployment {
  parameters: any;
  resources: any;
  services: any;
  units: any[];
  callback: any;
}

export { Deployment };
