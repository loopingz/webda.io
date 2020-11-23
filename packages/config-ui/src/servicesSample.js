export const services = {
    "CloudWatchLogger": {
        "type": "Webda/CloudWatchLogger",
        "logGroupName": "security",
        "logStreamNamePrefix": "dev-api-"
    },
    "Binaries": {
        "type": "Webda/S3Binary",
        "bucket": "app-bucket"
    },
    "usersStore": {
        "table": "App-users",
        "type": "Webda/DynamoStore"
    }
}