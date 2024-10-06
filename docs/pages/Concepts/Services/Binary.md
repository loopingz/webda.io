# Binary

Services to handle binary files.

Available implementations: S3Binary, FileBinary, GoogleStorageBinary

These services are responsible for storing and retrieving binary files attached to CoreModel.

Like Stores they define where your data is stored but should barely be used directly.

The storage is optimized to avoid storing the same file multiple times. And it also includes a challenge system to avoid uploading files that are already stored in the system. Allowing users to prove they have the file without uploading it by providing two hashes of the file.

## Map

Binary services define who is responsible for what fields of your CoreModel. With a map, you can define which fields of which objects can store binaries.

```javascript title="webda.config.json"
"map": {
	"users": ["s3images"]
}
```

The above configuration will allow a user to link a binary to a user on the field s3images.

## S3Binary

To configure just add the parameter bucket

\{@link S3Binary}

## FileBinary

To configure just add the parameter folder
