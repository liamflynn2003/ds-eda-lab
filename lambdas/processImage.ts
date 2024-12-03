/* eslint-disable import/extensions, import/no-absolute-path */
import { SQSHandler } from "aws-lambda";
import {
  GetObjectCommand,
  GetObjectCommandInput,
  S3Client,
} from "@aws-sdk/client-s3";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { REGION, DLQ_URL, TABLE_NAME } from 'env';

const s3 = new S3Client({ region: REGION });
const sqsClient = new SQSClient({ region: REGION });
const dynamoDBClient = new DynamoDBClient({ region: REGION });
const ddbDocClient = DynamoDBDocumentClient.from(dynamoDBClient);

export const handler: SQSHandler = async (event) => {
  console.log("Event ", JSON.stringify(event));

  for (const record of event.Records) {
    const recordBody = JSON.parse(record.body);        // Parse SQS message
    const snsMessage = JSON.parse(recordBody.Message); // Parse SNS message

    if (snsMessage.Records) {
      console.log("Record body ", JSON.stringify(snsMessage));

      for (const messageRecord of snsMessage.Records) {
        const s3 = messageRecord.s3;
        const srcBucket = s3.bucket.name;
        // Object key may have spaces or unicode non-ASCII characters.
        const srcKey = decodeURIComponent(s3.object.key.replace(/\+/g, " "));
        console.log('srcKey: ', srcKey)
        try {
          // Validate file extension (check the file name in S3)
          if (!(srcKey.endsWith('.jpg') || srcKey.endsWith('.jpeg') || srcKey.endsWith('.png'))) {
            // If invalid, reroute to DLQ
            await sendToDLQ(record);
            throw new Error(`Invalid file type. Only .jpg, .jpeg, and .png are allowed.`);
          }

          // If valid, log to DynamoDB
          const putCommand = new PutCommand({
            TableName: TABLE_NAME,
            Item: {
              id: srcKey
            },
          });
          await ddbDocClient.send(putCommand);

          console.log(`Image ${srcKey} processed successfully.`);
        } catch (error) {
          console.log("Error processing image:", error);
          // Send the message to DLQ if error occurs
          await sendToDLQ(record);
        }
      }
    }
  }
};

// Function to send invalid files to DLQ
const sendToDLQ = async (record: any) => {
  const dlqUrl = DLQ_URL;
  const snsMessage = JSON.parse(record.body);
  const fileName = snsMessage.Message;

  const command = new SendMessageCommand({
    QueueUrl: dlqUrl,
    MessageBody: JSON.stringify({ file_name: fileName }),
  });

  try {
    await sqsClient.send(command);
    console.log(`Message sent to DLQ for file: ${fileName}`);
  } catch (error) {
    console.error('Error sending message to DLQ:', error);
  }
};
