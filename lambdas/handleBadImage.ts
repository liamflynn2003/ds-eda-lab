import { SQSHandler } from "aws-lambda";

export const handler: SQSHandler = async (event) => {
  try {
    console.log("Event: ", JSON.stringify(event));
    for (const record of event.Records) {
      const badImage = JSON.parse(record.body)
      console.log(badImage);
    }
  } catch (error) {
    console.log(JSON.stringify(error));
  }
};