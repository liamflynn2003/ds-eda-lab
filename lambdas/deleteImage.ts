import { S3Event, S3Handler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { REGION, TABLE_NAME } from "env";

const dynamoDBClient = new DynamoDBClient({ region: REGION });
const ddbDocClient = DynamoDBDocumentClient.from(dynamoDBClient);

export const handler: S3Handler = async (event: S3Event) => {
  console.log("Event received: ", JSON.stringify(event));

  try {
    for (const record of event.Records) {
      // Check for the S3 event details
      if (record.s3 && record.s3.object) {
        const srcBucket = record.s3.bucket.name;
        const srcKey = record.s3.object.key;

        console.log(`S3 event - Bucket: ${srcBucket}, Key: ${srcKey}`);

        // Delete the corresponding item from DynamoDB
        const deleteCommand = new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { id: srcKey },
        });
        await ddbDocClient.send(deleteCommand);
        console.log(`Successfully deleted item with id ${srcKey} from DynamoDB.`);
      } else {
        console.log("No S3 event data found.");
      }
    }
  } catch (error) {
    console.error("Error processing event:", error);
  }
};
