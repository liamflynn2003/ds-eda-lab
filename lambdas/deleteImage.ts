/* eslint-disable import/extensions, import/no-absolute-path */
import { SQSHandler } from "aws-lambda";
import {
  DeleteObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { REGION, TABLE_NAME } from 'env';

const s3 = new S3Client({ region: REGION });
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
          // Delete the object from S3
          await s3.send(new DeleteObjectCommand({
            Bucket: srcBucket,
            Key: srcKey
          }));
          console.log(`Deleted ${srcKey} from S3`);

          // Delete the corresponding item from DynamoDB
          const deleteCommand = new DeleteCommand({
            TableName: TABLE_NAME,
            Key: { id: srcKey },
          });
          await ddbDocClient.send(deleteCommand);
          console.log(`Deleted item with id ${srcKey} from DynamoDB`);

        } catch (error) {
          console.log("Error deleting image:", error);
        }
      }
    }
  }
};
