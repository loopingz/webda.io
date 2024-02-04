# S3Binary

The S3 Binary allows you to upload directly to your S3 bucket and download directly from it by issuing a `302` redirection.

To be able to use it in a webapp application you need to configure S3 CORS

## AWS S3 CORS Configuration

This is an extract from [AWS Documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/ManageCorsUsing.html#cors-example-1)

```js
[
  {
    AllowedHeaders: ["*"],
    AllowedMethods: ["PUT", "GET"],
    AllowedOrigins: ["https://mywebsite"],
    ExposeHeaders: []
  }
];
```
