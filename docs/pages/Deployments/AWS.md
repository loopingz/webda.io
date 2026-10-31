# AWS deployment

![image](http://webda.io/images/schemas/aws_deploy.png)

## Deployment Policy

To be able to deploy the deployment user must have at least :

```javascript
{
	"Sid": "Stmt1438583420001",
	"Effect": "Allow",
	"Action": [
		"lambda:*",
		"iam:PassRole",
		"apigateway:*"
	],
	"Resource": [
		"*"
	]
}
```
This can be restrict more and should, need to update the documentation


## Package

The package is a zip of your folder, we dont have advanced cleaning feature nor ignore files, so the package can be big if you forget to clean your folder before.

## Lambda

Once the package done, it will be upload as a Lambda function with the name specified, updating if it already exists.

## API Gateway

It map all the routes from your application, if a **website** parameter is found on the parameters of deployment then it will enable CORS for you for this URL

## CORS

For any request carrying an `Origin` header that the CORS filters accept (the `website` parameter), the Router answers with `Access-Control-Allow-Origin` (the origin is echoed, never `*`), `Access-Control-Allow-Credentials: true` and `Vary: Origin`; a preflight `OPTIONS` also gets `Access-Control-Allow-Methods` and `Access-Control-Allow-Headers`. Other origins receive no `Access-Control-*` header. A service needing more request headers (for example tracing headers) calls `useRouter().addCorsAllowedHeaders("traceparent")`.

It also deploy the API as Stage named with the name of the deployment.
