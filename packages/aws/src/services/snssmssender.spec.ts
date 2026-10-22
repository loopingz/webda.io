import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import { suite, test } from "@webda/test";
import * as assert from "assert";
import { mockClient } from "aws-sdk-client-mock";
import { SnsSmsSender, SnsSmsSenderParameters } from "./snssmssender.service.js";

@suite
class SnsSmsSenderTest {
  @test
  async publishesTransactionalSms() {
    const mock = mockClient(SNSClient);
    try {
      mock.on(PublishCommand).resolves({ MessageId: "msg-1" });
      const sender = new SnsSmsSender("sms", new SnsSmsSenderParameters().load({ region: "eu-west-1" }));
      sender.resolve();
      await sender.send("+15550100089", "123456 is your code");
      const calls = mock.commandCalls(PublishCommand);
      assert.strictEqual(calls.length, 1);
      assert.deepStrictEqual(calls[0].args[0].input, {
        PhoneNumber: "+15550100089",
        Message: "123456 is your code",
        MessageAttributes: {
          "AWS.SNS.SMS.SMSType": { DataType: "String", StringValue: "Transactional" }
        }
      });
      assert.strictEqual(await sender.client.config.region(), "eu-west-1");
      assert.deepStrictEqual(sender.getARNPolicy(), {
        Sid: "SnsSmsSendersms",
        Effect: "Allow",
        Action: ["sns:Publish"],
        Resource: ["*"]
      });

      // Sender ID and origination number are sent when configured
      const branded = new SnsSmsSender(
        "branded",
        new SnsSmsSenderParameters().load({ senderId: "Webda", originationNumber: "+15550000000" })
      );
      branded.resolve();
      await branded.send("+33612345678", "654321 is your code");
      assert.deepStrictEqual(mock.commandCalls(PublishCommand)[1].args[0].input.MessageAttributes, {
        "AWS.SNS.SMS.SMSType": { DataType: "String", StringValue: "Transactional" },
        "AWS.SNS.SMS.SenderID": { DataType: "String", StringValue: "Webda" },
        "AWS.MM.SMS.OriginationNumber": { DataType: "String", StringValue: "+15550000000" }
      });

      // Provider failures are surfaced to the caller
      mock.on(PublishCommand).rejects(new Error("Invalid parameter: PhoneNumber"));
      await assert.rejects(() => sender.send("+1", "x"), /PhoneNumber/);
    } finally {
      mock.restore();
    }
  }
}
