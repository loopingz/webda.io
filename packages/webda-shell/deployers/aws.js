const Deployer = require('./deployer');
const AWSServiceMixin = require('webda/services/aws-mixin');
const mime = require('mime-types');
const path = require('path');
const fs = require('fs');

class AWSDeployer extends AWSServiceMixin(Deployer) {

  _getAWS(params) {
    return super._getAWS(params || this.resources)
  }

  _replaceForAWS(id) {
    return id.replace(/\//g, '_');
  }

  _createCertificate(domain, forceRegion) {
    let config = JSON.parse(JSON.stringify(this.resources));
    // CloudFront only use certificate in us-east-1 region...
    if (forceRegion) {
      config.region = forceRegion;
    }
    this._acm = new(this._getAWS(config)).ACM();

    return this._acm.listCertificates({}).promise().then((res) => {
      for (let i in res.CertificateSummaryList) {
        if (res.CertificateSummaryList[i].DomainName === domain && res.CertificateSummaryList[i] !== 'FAILED') {
          this._certifcate = res.CertificateSummaryList[i];
          return Promise.resolve(this._certifcate);
        }
      }
      if (!this._certifcate) {
        // Create certificate
        let params = {
          DomainName: domain,
          DomainValidationOptions: [{
            DomainName: domain,
            ValidationDomain: domain
          }],
          ValidationMethod: 'DNS',
          IdempotencyToken: 'WebdaSSL_' + domain.replace(/[^\w]/g, '_')
        };
        return this._acm.requestCertificate(params).promise().then((res) => {
          this._certifcate = res;
          return this._waitFor('Waiting for certificate challenge', (resolve, reject) => {
            return this._acm.describeCertificate({
              CertificateArn: this._certifcate.CertificateArn
            }).promise().then((res) => {
              if (res.Certificate.DomainValidationOptions[0].ResourceRecord) {
                resolve(res.Certificate)
                return Promise.resolve(true);
              }
              return Promise.resolve(false);
            });
          }, 10000, 5);
        });
      }
      return Promise.reject();
    }).then((cert) => {
      return this._acm.describeCertificate({
        CertificateArn: cert.CertificateArn
      }).promise();
    }).then((res) => {
      let cert = res.Certificate;
      if (cert.Status === 'FAILED') {
        return Promise.reject('Certificate validation has failed');
      }
      if (cert.Status === 'PENDING_VALIDATION') {
        // On create need to wait
        let record = cert.DomainValidationOptions[0].ResourceRecord;
        console.log('Need to validate certificate', cert.CertificateArn);
        return this._createDNSEntry(record.Name, 'CNAME', record.Value).then(() => {
          // Waiting for certificate validation
          return this._waitFor('Waiting for certificate validation', (resolve, reject) => {
            return this._acm.describeCertificate({
              CertificateArn: cert.CertificateArn
            }).promise().then((res) => {
              if (res.Certificate.Status === 'ISSUED') {
                resolve(res.Certificate);
                return Promise.resolve(true);
              }
              if (res.Certificate.Status !== 'PENDING_VALIDATION') {
                reject(res.Certificate);
                return Promise.resolve(true);
              }
              return Promise.resolve(false);
            });
          }, 60000, 10);
        });
      }
      return Promise.resolve(cert);
    });
  }

  _waitForInternal(timeout, maxRetry, resolve, reject) {
    if (this._waitLabel) {
      console.log('[' + this._try + '/' + this._maxTry + ']', this._waitLabel);
    }
    this._waitCall(resolve, reject).then((val) => {
      if (val) return;
      this._try++;
      if (maxRetry > 0) {
        setTimeout(this._waitForInternal.bind(this, timeout * 2, maxRetry - 1, resolve, reject), timeout);
      } else {
        reject();
      }
    });
  }

  _waitFor(label, call, timeout, maxRetry) {
    this._try = 1;
    this._maxTry = maxRetry;
    this._waitLabel = label;
    this._waitCall = call;
    timeout = timeout || 5000;
    return new Promise((resolve, reject) => {
      this._waitForInternal(timeout, maxRetry, resolve, reject);
    });
  }

  _createDNSEntry(domain, type, value) {
    let params;
    if (!domain.endsWith('.')) {
      domain = domain + '.';
    }
    let targetZone;
    // Find the right zone
    this._r53 = new(this._getAWS(this.resources)).Route53();
    // Identify the right zone first
    return this._r53.listHostedZones().promise().then((res) => {
      for (let i in res.HostedZones) {
        let zone = res.HostedZones[i];
        if (domain.endsWith(zone.Name)) {
          if (targetZone && targetZone.Name.length > zone.Name.length) {
            // The previous target zone is closer to the domain
            continue;
          }
          targetZone = zone;
        }
      }
      if (!targetZone) {
        return Promise.reject('Domain is not handled on AWS');
      }
      params = {
        HostedZoneId: targetZone.Id,
        StartRecordName: domain,
        StartRecordType: type
      }
      return this._r53.listResourceRecordSets(params).promise();
    }).then((res) => {
      let targetRecord;
      for (let i in res.ResourceRecordSets) {
        let record = res.ResourceRecordSets[i];
        if (record.Type === type && record.Name === domain) {
          targetRecord = record;
          break;
        }
      }
      let params = {
        HostedZoneId: targetZone.Id,
        ChangeBatch: {
          Changes: [{
            Action: 'UPSERT',
            ResourceRecordSet: {
              Name: domain,
              ResourceRecords: [{
                Value: value
              }],
              TTL: 360,
              Type: type
            }
          }],
          Comment: 'webda-automated-deploiement'
        }
      };
      if (!targetRecord || targetRecord.ResourceRecords[0].Value !== value) {
        console.log('Creating record', domain, type, value);
      } else if (targetRecord.ResourceRecords[0].Value === value) {
        // Dont do anything the record exist with the right value
        return Promise.resolve();
      } else {
        console.log('Updating record', type, domain, value);
      }
      return this._r53.changeResourceRecordSets(params).promise();
    }).then(() => {
      return Promise.resolve();
    });
  }

  getARNPolicy(accountId, region) {
    return [{
      "Sid": "WebdaLog",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": [
        "arn:aws:logs:" + region + ":" + accountId + ":*"
      ]
    }];
  }

  generateRoleARN(name, assumeRolePolicy, roleName, policyName) {
    let services = this.getServices();
    roleName = roleName || (name + 'Role');
    roleName = this._replaceForAWS(roleName);
    policyName = policyName || (name + 'Policy');
    policyName = this._replaceForAWS(policyName);
    let sts = new(this._AWS).STS();
    let iam = new(this._AWS).IAM();
    let roleArn = '';

    return sts.getCallerIdentity().promise().then((id) => {
      // arn:aws:logs:us-east-1:123456789012:*
      let statements = [];
      this.resources.AWSAccountId = id.Account;

      if (this.resources.lambdaRole) {
        roleArn = this.resources.lambdaRole;
        return Promise.resolve();
      }

      // Build policy
      for (let i in services) {
        if (services[i].getARNPolicy) {
          // Update to match recuring policy - might need to split if policy too big
          let res = services[i].getARNPolicy(id.Account, this._AWS.config.region);
          if (Array.isArray(res)) {
            Array.prototype.push.apply(statements, res);
          } else {
            statements.push(res);
          }
        }
      }
      Array.prototype.push.apply(statements, this.getARNPolicy(id.Account, this._AWS.config.region));
      let policyDocument = {
        "Version": "2012-10-17",
        "Statement": statements
      }
      let policy;
      return iam.listPolicies({
        PathPrefix: '/webda/'
      }).promise().then((data) => {
        for (let i in data.Policies) {
          if (data.Policies[i].PolicyName === policyName) {
            policy = data.Policies[i];
          }
        }
        if (!policy) {
          console.log('Creating AWS Policy', policyName);
          // Create the policy has it doesnt not exist
          return iam.createPolicy({
            PolicyDocument: JSON.stringify(policyDocument),
            PolicyName: policyName,
            Description: 'webda-generated',
            Path: '/webda/'
          }).promise().then((data) => {
            policy = data.Policy;
          });
        } else {
          // Compare policy with the new one
          return iam.getPolicyVersion({
            PolicyArn: policy.Arn,
            VersionId: policy.DefaultVersionId
          }).promise().then((data) => {
            // If nothing changed just continue
            if (decodeURIComponent(data.PolicyVersion.Document) === JSON.stringify(policyDocument)) {
              return Promise.resolve();
            }
            console.log('Update AWS Policy', policyName);
            // Create new version for the policy
            return iam.createPolicyVersion({
              PolicyArn: policy.Arn,
              PolicyDocument: JSON.stringify(policyDocument),
              SetAsDefault: true
            }).promise().then(() => {
              // Remove old version
              return iam.deletePolicyVersion({
                PolicyArn: policy.Arn,
                VersionId: policy.DefaultVersionId
              }).promise();
            });
          })
        }
      }).then(() => {
        //
        return iam.listRoles({
          PathPrefix: '/webda/'
        }).promise().then((data) => {
          let role;
          for (let i in data.Roles) {
            if (data.Roles[i].RoleName === roleName) {
              role = data.Roles[i];
              roleArn = role.Arn;
            }
          }
          if (!role) {
            console.log('Creating AWS Role', roleName);
            return iam.createRole({
              Description: 'webda-generated',
              Path: '/webda/',
              RoleName: roleName,
              AssumeRolePolicyDocument: assumeRolePolicy
            }).promise().then((res) => {
              return Promise.resolve(res.Role);
            });
          }
          return Promise.resolve(role);
        }).then((role) => {
          roleArn = role.Arn;
          return iam.listAttachedRolePolicies({
            RoleName: roleName
          }).promise();
        }).then((data) => {
          for (let i in data.AttachedPolicies) {
            if (data.AttachedPolicies[i].PolicyName === policyName) {
              return Promise.resolve();
            }
          }
          console.log('Attaching AWS Policy', policyName, 'to', roleName);
          return iam.attachRolePolicy({
            PolicyArn: policy.Arn,
            RoleName: roleName
          }).promise();
        });
      });
    }).then(() => {
      return Promise.resolve(roleArn);
    });
  }

  tagResource(resource, tags) {
    // Should add tags to every resource when possible
    // this.resources.AWSTags;
  }

  createBucket(bucket) {
    return this._s3.headBucket({
      Bucket: bucket
    }).promise().catch((err) => {
      console.log('headBucket fail');
      if (err.code === 'Forbidden') {
        console.log('S3 bucket already exists in another account');
      } else if (err.code === 'NotFound') {
        console.log('\tCreating S3 Bucket', bucket);
        // Setup www permission on it
        return this._s3.createBucket({
          Bucket: bucket
        }).promise();
      }
    });
  }

  putFilesOnBucket(bucket, files) {
    this._s3 = new(this._getAWS(this.resources)).S3();
    // Create the bucket
    return this.createBucket(bucket).then(() => {
      // Should implement multithread here - cleaning too
      let promise = Promise.resolve();
      files.forEach((file) => {
        let info = {};
        if (typeof(file) === 'string') {
          info.src = file;
          info.key = path.relative(process.cwd(), file);
        } else if (file.src === undefined || file.key === undefined) {
          throw Error('Should have src and key defined');
        } else {
          info.src = file.src;
          info.key = file.key;
        }
        // Need to have mimetype to serve the content correctly
        let mimetype = mime.contentType(path.extname(info.src));
        promise = promise.then(() => {
          return this._s3.putObject({
            Bucket: bucket,
            Body: fs.createReadStream(info.src),
            Key: info.key,
            ContentType: mimetype
          }).promise();
        }).then(() => {
          console.log('Uploaded', info.src, 'to', info.key, '(' + mimetype + ')');
        });
      });
      return promise;
    });
  }
}

module.exports = AWSDeployer;
