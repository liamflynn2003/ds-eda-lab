import { SQSHandler } from "aws-lambda";
import { SES_EMAIL_FROM, SES_EMAIL_TO, REGION } from "../env";
import {
  SESClient,
  SendEmailCommand,
  SendEmailCommandInput,
} from "@aws-sdk/client-ses";

if (!SES_EMAIL_TO || !SES_EMAIL_FROM || !REGION) {
  throw new Error(
    "Please add the SES_EMAIL_TO, SES_EMAIL_FROM and REGION environment variables in an env.js file located in the root directory"
  );
}

type ContactDetails = {
  name: string;
  email: string;
  message: string;
};

const client = new SESClient({ region: REGION });

export const handler: SQSHandler = async (event: any) => {
  console.log("Event: ", JSON.stringify(event, null, 2));
  for (const record of event.Records) {
    let recordBody;
    try {
      // Try parsing the record body directly
      recordBody = JSON.parse(record.body);
      console.log("Parsed recordBody: ", recordBody); // Log parsed body
    } catch (err) {
      console.error("Failed to parse record.body: ", record.body);
      continue; // Skip processing this record if body parsing fails
    }

    // Process the data directly from the SQS record
    const { name, email, message }: ContactDetails = {
      name: "The Photo Album", 
      email: SES_EMAIL_FROM,  
      message: `Thank you for using The Photo Album! Unfortunately, your image upload was rejected, most likely due to the file being the wrong type. Photo Album only accepts .jpg, .png and .jpeg files.`,
    };
    try {
      const params = sendEmailParams({ name, email, message });
      await client.send(new SendEmailCommand(params));
      console.log("Rejection email sent to: ", SES_EMAIL_TO); // Log successful email sending
    } catch (error: unknown) {
      console.error("ERROR sending email: ", error); // Log email sending errors
    }
  }
};

export function sendEmailParams({ name, email, message }: ContactDetails) {
  const parameters: SendEmailCommandInput = {
    Destination: {
      ToAddresses: [SES_EMAIL_TO],
    },
    Message: {
      Body: {
        Html: {
          Charset: "UTF-8",
          Data: getHtmlContent({ name, email, message }),
        },
      },
      Subject: {
        Charset: "UTF-8",
        Data: `Image Upload Rejected`,
      },
    },
    Source: SES_EMAIL_FROM,
  };
  return parameters;
}

function getHtmlContent({ name, email, message }: ContactDetails) {
  return `
    <html>
      <body>
        <h2>Notice from: </h2>
        <ul>
          <li style="font-size:18px">👤 <b>${name}</b></li>
          <li style="font-size:18px">✉️ <b>${email}</b></li>
        </ul>
        <p style="font-size:18px">${message}</p>
      </body>
    </html> 
  `;
}
