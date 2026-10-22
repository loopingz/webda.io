# SnsSmsSender

`Webda/SnsSmsSender` implements the `SmsSender` interface of `@webda/core` with Amazon SNS: each message is published
directly to the phone number as a **transactional** SMS. It is the transport of the SMS second factor
(`Webda/SmsMfaService`, see [Authentication](../../Security/Authentication.md#sms-second-factor)).

```jsonc
{
  "services": {
    "SmsSender": {
      "type": "Webda/SnsSmsSender",
      "region": "us-east-1", // default: AWS_DEFAULT_REGION or "us-east-1"
      "senderId": "MyApp", // optional alphanumeric sender ID, where supported
      "originationNumber": "+15550000000" // optional origination number registered in AWS End User Messaging
      // "endpoint" and "credentials" as every @webda/aws service
    },
    "sms": { "type": "Webda/SmsMfaService", "sender": "SmsSender" }
  }
}
```

The service publishes with `PublishCommand({ PhoneNumber, Message, MessageAttributes })` and the attributes
`AWS.SNS.SMS.SMSType = Transactional`, plus `AWS.SNS.SMS.SenderID` and `AWS.MM.SMS.OriginationNumber` when configured.
Errors from SNS (invalid number, spend limit, sandbox destination not verified...) are thrown to the caller.

The role needs `sns:Publish` (contributed to the deployers IAM policy by `getARNPolicy()`). New AWS accounts start in the SMS sandbox: only verified destination numbers receive
messages until production access is requested.
