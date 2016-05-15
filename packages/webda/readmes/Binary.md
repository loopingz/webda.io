# Binary

The storage of files is handle by those categories, we have two services FileStorage and S3Storage

The API exposed is 

```
GET /binary/{store}/{uuid}/{property}/{index}
PUT /binary/upload/{store}/{uuid}/{property}/{index}
DELETE /binary/{store}/{uuid}/{property}/{index}/{hash}
```

You can reduce the exposition by adding an expose attribute as on Store

As you can only add a binary attached to an object stored on the system, the url reflect this :

 * {store} is the Store of the object you want attached to
 * {uid} is the Object uuid 
 * {property} is the field of the Object
 * {index} is the index of the Binary
 * {hash} the hash of the file to delete to ensure, if someone insert another file you don't delete the wrong file by accident


## Map

To prevent people for adding files everywhere you specify in which object and fields you can post a file.

```javascript
"map": {
	"users": ["s3images"]
}
```

The above configuration will allow a user to link a binary to a user on the field s3images.

So with the previous URL that means to play with binaries for a User ( uuid: user_02 )

```
To add
PUT /binary/upload/users/user_02/s3images/add

To replace
PUT /binary/upload/users/user_02/s3images/0

To get
GET /binary/users/user_02/s3images/0

To delete
DELETE /binary/users/user_02/s3images/0/1928434324...
```

## S3Binary

To configure just add the parameter bucket

## FileBinary

To configure just add the parameter folder

## Polymer

The behavior implementation can be found there : 

Two different UI component exist also :

  * A simple fab button upload : 
  * A paper-input with Browse button : 

