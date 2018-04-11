import { AWSDeployer } from './aws';
import { S3, CloudFront } from 'aws-sdk';
const fs = require('fs');
const path = require('path');
const Finder = require('fs-finder');
const mime = require('mime-types');

/**
 *
 {
  "Id": "EM1G2MQ63F1G7",
  "ARN": "arn:aws:cloudfront::277712386420:distribution/EM1G2MQ63F1G7",
  "Status": "InProgress",
  "LastModifiedTime": "2018-01-07T00:32:04.693Z",
  "DomainName": "dxckve9qhzzpl.cloudfront.net",
  "Aliases": {
   "Quantity": 0,
   "Items": []
  },
  "Origins": {
   "Quantity": 1,
   "Items": [
    {
     "Id": "S3-demo.webda.io",
     "DomainName": "demo.webda.io.s3.amazonaws.com",
     "OriginPath": "",
     "CustomHeaders": {
      "Quantity": 0,
      "Items": []
     },
     "S3OriginConfig": {
      "OriginAccessIdentity": ""
     }
    }
   ]
  },
  "DefaultCacheBehavior": {
   "TargetOriginId": "S3-demo.webda.io",
   "ForwardedValues": {
    "QueryString": false,
    "Cookies": {
     "Forward": "none"
    },
    "Headers": {
     "Quantity": 0,
     "Items": []
    },
    "QueryStringCacheKeys": {
     "Quantity": 0,
     "Items": []
    }
   },
   "TrustedSigners": {
    "Enabled": false,
    "Quantity": 0,
    "Items": []
   },
   "ViewerProtocolPolicy": "allow-all",
   "MinTTL": 0,
   "AllowedMethods": {
    "Quantity": 2,
    "Items": [
     "HEAD",
     "GET"
    ],
    "CachedMethods": {
     "Quantity": 2,
     "Items": [
      "HEAD",
      "GET"
     ]
    }
   },
   "SmoothStreaming": false,
   "DefaultTTL": 86400,
   "MaxTTL": 31536000,
   "Compress": false,
   "LambdaFunctionAssociations": {
    "Quantity": 0,
    "Items": []
   }
  },
  "CacheBehaviors": {
   "Quantity": 0,
   "Items": []
  },
  "CustomErrorResponses": {
   "Quantity": 0,
   "Items": []
  },
  "Comment": "",
  "PriceClass": "PriceClass_100",
  "Enabled": true,
  "ViewerCertificate": {
   "CloudFrontDefaultCertificate": true,
   "MinimumProtocolVersion": "TLSv1",
   "CertificateSource": "cloudfront"
  },
  "Restrictions": {
   "GeoRestriction": {
    "RestrictionType": "none",
    "Quantity": 0,
    "Items": []
   }
  },
  "WebACLId": "",
  "HttpVersion": "HTTP2",
  "IsIPV6Enabled": true
 }

 */
export class S3Deployer extends AWSDeployer {
  bucket: string;
  _s3: S3;
  _cloudfront: CloudFront;
  source: string;

  async _createWebsite() {
    let params : any = {
      Bucket: this.bucket,
      WebsiteConfiguration: {
        ErrorDocument: {
          Key: this.resources.errorDocument || 'error.html'
        },
        IndexDocument: {
          Suffix: this.resources.indexDocument || 'index.html'
        }
      }
    };
    await this._s3.putBucketWebsite(params).promise();
    // Set the bucket policy
    let policy = {
      "Version": "2012-10-17",
      "Statement": [{
        "Sid": "PublicReadGetObject",
        "Effect": "Allow",
        "Principal": "*",
        "Action": ["s3:GetObject"],
        "Resource": ["arn:aws:s3:::" + this.bucket + "/*"]
      }]
    };
    params = {
      Bucket: this.bucket,
      Policy: JSON.stringify(policy)
    };
    await this._s3.putBucketPolicy(params).promise();
    await this._createCloudFront();
    if (!this.resources.cloudfront) {
      // Generate a basic CNAME to s3.
      await this._createDNSEntry(this.bucket, 'CNAME', this.bucket + '.s3-website-' + this._s3.config.region + '.amazonaws.com');
    }
  }

  async _createCertificate(domain) {
    if (this.resources.certificate) {
      // Have to force region to us-east-1 to be able to us it with cloudfront
      this._certificate = await super._createCertificate(domain, 'us-east-1');
    }
  }

  private _needCloudFrontUpdate(distrib) {
    return distrib.DefaultRootObject !== (this.resources.indexDocument || 'index.html') ||
      distrib.PriceClass !== (this.resources.PriceClass || 'PriceClass_100') ||
      (this._certificate && !distrib.ViewerCertificate);
  }

  private _getCloudFrontConfig() {
    let viewerPolicy = this.resources.certificate ? 'redirect-to-https' : 'allow-all';
    let params : any = {
      DistributionConfig: {
        CallerReference: this.bucket,
        Comment: 'Webda_' + this.bucket,
        DefaultRootObject: this.resources.indexDocument || 'index.html',
        DefaultCacheBehavior: {
          TargetOriginId: "S3-" + this.bucket,
          ForwardedValues: {
            Cookies: {
              Forward: 'none'
            },
            QueryString: false
          },
          MinTTL: 0,
          TrustedSigners: {
            Enabled: false,
            Quantity: 0,
            Items: []
          },
          ViewerProtocolPolicy: viewerPolicy,
          "AllowedMethods": {
            "Quantity": 2,
            "Items": [
              "HEAD",
              "GET"
            ],
            "CachedMethods": {
              "Quantity": 2,
              "Items": [
                "HEAD",
                "GET"
              ]
            }
          }
        },
        Enabled: true,
        Restrictions: {
          GeoRestriction: {
            RestrictionType: 'none',
            Quantity: 0,
            Items: []
          }
        },
        PriceClass: this.resources.PriceClass || 'PriceClass_100',
        WebACLId: '',
        Origins: {
          Quantity: 1,
          Items: [{
            "Id": "S3-" + this.bucket,
            "DomainName": this.bucket + ".s3.amazonaws.com",
            "OriginPath": "",
            "CustomHeaders": {
              "Quantity": 0,
              "Items": []
            },
            "S3OriginConfig": {
              "OriginAccessIdentity": ""
            }
          }]
        },
        HttpVersion: 'http2',
        IsIPV6Enabled: true,
        "Aliases": {
          "Quantity": 1,
          "Items": [
            this.bucket
          ]
        }
      }
    };
    // Need to add the
    if (this.resources.certificate) {
      params.DistributionConfig.ViewerCertificate = {
        ACMCertificateArn: this._certificate.CertificateArn,
        Certificate: this._certificate.CertificateArn,
        CertificateSource: 'acm',
        CloudFrontDefaultCertificate: false,
        SSLSupportMethod: 'sni-only',
        MinimumProtocolVersion: 'TLSv1.1_2016'
      }
    }
    return params;
  }

  private async _createCloudFront() {
    if (!this.resources.cloudfront) {
      return;
    }
    let cloudfront;
    let params : any = {
      MaxItems: '1000'
    };
    this._cloudfront = new(this._getAWS(this.resources)).CloudFront();
    await this._createCertificate(this.bucket);
    // TODO Handle paginations  
    let res : CloudFront.ListDistributionsResult = await this._cloudfront.listDistributions(params).promise();
    for (let i in res.DistributionList.Items) {
      cloudfront = res.DistributionList.Items[i];
      // Search for current cloudfront
      if (cloudfront.DefaultCacheBehavior.TargetOriginId === ("S3-" + this.bucket)) {
        if (cloudfront.Status === 'InProgress') {
          console.log('CloudFront distribution', cloudfront.Id, 'is in progress, skipping');
          return Promise.resolve();
        }
        if (!cloudfront.Enabled) {
          console.log('CloudFront distribution', cloudfront.Id, 'is in disabled, skipping');
          return Promise.resolve();
        }
        if (this._needCloudFrontUpdate(cloudfront.DistributionConfig)) {
          console.log('Update CloudFront distribution', cloudfront.Id);
          return this._cloudfront.updateDistribution(this._getCloudFrontConfig()).promise();
        }
        console.log('Invalidate CloudFront distribution', cloudfront.Id);
        params = {
          DistributionId: cloudfront.Id,
          InvalidationBatch: {
            CallerReference: 'Webda-deployment',
            Paths: {
              Quantity: 1,
              Items: [
                '/*'
              ]
            }
          }
        };
        await this._cloudfront.createInvalidation(params).promise();
      }
    }
    if (!cloudfront) {
      return this._cloudfront.createDistribution(this._getCloudFrontConfig()).promise().then((res) => {
        cloudfront = res;
        console.log('Create Cloudfront distribution', res.Distribution.Id, ': this take some times on the AWS side before being effective');
        // Waiting with the waitFor api ?
        return Promise.resolve();
      });
    }
    // Ensure Route53 record set
    await this._createDNSEntry(this.bucket, 'CNAME', cloudfront.DomainName);
  }

  async _createDNSEntry(domain, type, value) : Promise<void> {
    if (!this.resources.route53) {
      return;
    }
    await super._createDNSEntry(domain, type, value);
  }

  async undeploy(args) {
    // Delete S3
    // Delete Cloudfront
    // Delete certificate
    // Delete Route53
  }

  async deploy(args) {
    this._s3 = new(this._getAWS(this.resources)).S3();
    let bucket = this.resources.target;
    let source = path.resolve(this.resources.source);
    this.bucket = bucket;
    this.source = source;
    console.log('Deploy', source, 'on S3 Bucket', bucket);
    await this.createBucket(bucket);
    let files = Finder.from(source).findFiles();
    // Should implement multithread here - cleaning too
    for (let i in files) {
      let file = files[i];
      let key = path.relative(source, file);
      // Need to have mimetype to serve the content correctly
      let mimetype = mime.contentType(path.extname(file));
      await this._s3.putObject({
        Bucket: bucket,
        Body: fs.createReadStream(file),
        Key: key,
        ContentType: mimetype
      }).promise();
      console.log('Uploaded', file, 'to', key, '(' + mimetype + ')');
    };
    if (!this.resources.staticWebsite) {
      return;
    }
    await this._createWebsite();
  }

  static getModda() {
    return {
      "uuid": "WebdaDeployer/S3",
      "label": "S3",
      "description": "Deploy a S3 public website",
      "logo": "images/icons/s3.png",
      "configuration": {
        "widget": {
          "tag": "webda-s3-deployer",
          "url": "elements/deployers/webda-s3-deployer.html"
        },
        "default": {},
        "schema": {
          type: "object"
        }
      }
    }
  }
}

