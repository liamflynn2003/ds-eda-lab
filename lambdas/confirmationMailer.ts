import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { SES_EMAIL_FROM, SES_EMAIL_TO, REGION } from "../env";

const client = new SESClient({ region: REGION });

export const handler = async (event: any) => {
  console.log("Event: ", JSON.stringify(event, null, 2));

  // Extract the image id from the DynamoDB record
  const record = event.Records[0];
  const imageId = record.dynamodb?.NewImage?.id?.S;

  // Prepare the message with just the image name
  const message = `We received your image '${imageId}' and it was successfully added to our image table! Thank you for using Photo Album!`;

  const params = {
    Destination: { ToAddresses: [SES_EMAIL_TO] },
    Message: {
      Body: { Html: { Charset: "UTF-8", Data: message } },
      Subject: { Charset: "UTF-8", Data: "New Image Upload" },
    },
    Source: SES_EMAIL_FROM,
  };

  try {
    // Send the email
    await client.send(new SendEmailCommand(params));
    console.log("Confirmation email sent.");
  } catch (error) {
    console.error("Error sending confirmation email:", error);
  }
};
