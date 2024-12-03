import { SNSHandler, SNSEvent } from "aws-lambda"; 
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";

// Create DynamoDB Document Client using your method
const ddbDocClient = createDDbDocClient();

// Handler function for SNS events
export const handler: SNSHandler = async (event: SNSEvent): Promise<void> => {
    try {
      console.log("[EVENT]", JSON.stringify(event));
  
      // Extract the SNS message and parse it
      const snsMessage = event.Records[0].Sns.Message;
      const message = JSON.parse(snsMessage);
  
      const { id, Caption, Date, Photographer } = message;
      const metadataType = event.Records[0].Sns.MessageAttributes["x-metadata-type"].Value;
  
      let updateExpression = "SET ";
      const expressionAttributeValues: Record<string, any> = {};
      const expressionAttributeNames: Record<string, string> = {};
  
      // Add the appropriate fields to the update expression if they exist
      if (Caption) {
        updateExpression += "Caption = :Caption, ";
        expressionAttributeValues[":Caption"] = Caption;
      }
      if (Date) {
        updateExpression += "#Date = :Date, "; // Use a placeholder for reserved keyword
        expressionAttributeValues[":Date"] = Date;
        expressionAttributeNames["#Date"] = "Date"; // Define the actual attribute name
      }
      if (Photographer) {
        updateExpression += "Photographer = :Photographer, ";
        expressionAttributeValues[":Photographer"] = Photographer;
      }
  
      // Remove the trailing comma and space from the update expression
      updateExpression = updateExpression.slice(0, -2); 
  
      console.log("Update Expression:", updateExpression);
      console.log("Expression Attribute Values:", expressionAttributeValues);
      console.log("Expression Attribute Names:", expressionAttributeNames);
  
      // Perform the update operation on DynamoDB
      const result = await ddbDocClient.send(
        new UpdateCommand({
          TableName: process.env.TABLE_NAME,
          Key: { id },
          UpdateExpression: updateExpression,
          ExpressionAttributeValues: expressionAttributeValues,
          ExpressionAttributeNames: expressionAttributeNames, // Pass the attribute names
        })
      );
  
      console.log("DynamoDB update result:", result);
    } catch (error) {
      console.error("Error:", error);
    }
  };
  

function createDDbDocClient() {
  const ddbClient = new DynamoDBClient({ region: process.env.REGION });
  const marshallOptions = {
    convertEmptyValues: true,
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
  };
  const unmarshallOptions = {
    wrapNumbers: false,
  };
  const translateConfig = { marshallOptions, unmarshallOptions };
  return DynamoDBDocumentClient.from(ddbClient, translateConfig);
}
