import * as cdk from "aws-cdk-lib";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as events from "aws-cdk-lib/aws-lambda-event-sources";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as iam from "aws-cdk-lib/aws-iam";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import { Duration } from "aws-cdk-lib";
import { TABLE_NAME } from "../env";

export class EDAAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 bucket
    const imagesBucket = new s3.Bucket(this, 'images', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
    });

    // Image Table
    const imagesTable = new dynamodb.Table(this, "ImagesTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      tableName: TABLE_NAME,
      stream: dynamodb.StreamViewType.NEW_IMAGE
    });

    // Integration infrastructure
    const badImageQueue = new sqs.Queue(this, "bad-image-queue", {
      retentionPeriod: cdk.Duration.minutes(10),
    });

    const imageProcessQueue = new sqs.Queue(this, "ImageProcessQueue", {
      receiveMessageWaitTime: cdk.Duration.seconds(10),
      deadLetterQueue: {
        queue: badImageQueue,
        maxReceiveCount: 5,  // If processing fails 5 times, the message will go to the DLQ
      },
    });

    const newImageTopic = new sns.Topic(this, "NewImageTopic", {
      displayName: "New Image topic",
    });

    // Lambda functions
    const processImageFn = new NodejsFunction(
      this,
      "ProcessImageFn",
      {
        runtime: lambda.Runtime.NODEJS_18_X,
        entry: `${__dirname}/../lambdas/processImage.ts`,
        timeout: cdk.Duration.seconds(15),
        memorySize: 128,
      }
    );

    const confirmationMailerFn = new NodejsFunction(this, "ConfirmationMailerFn", {
      runtime: lambda.Runtime.NODEJS_16_X,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(3),
      entry: `${__dirname}/../lambdas/confirmationMailer.ts`,
    });

    const rejectionMailerFn = new NodejsFunction(this, "RejectionMailerFn", {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_16_X,
      entry: `${__dirname}/../lambdas/rejectionMailer.ts`,
      timeout: Duration.seconds(10),
      memorySize: 128,
    });

    const updateImageMetadataFn = new lambdanode.NodejsFunction(this, "UpdateImageMetadataFn", {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: `${__dirname}/../lambdas/updateImage.ts`,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      environment: {
        TABLE_NAME: TABLE_NAME,
        REGION: "eu-west-1",
      },
    });

    const deleteImageFn = new NodejsFunction(this, "DeleteImageFn", {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: `${__dirname}/../lambdas/deleteImage.ts`,
      timeout: cdk.Duration.seconds(15),
      memorySize: 128,
    });

    // S3 --> SQS
    imagesBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SnsDestination(newImageTopic)
    );
    
    newImageTopic.addSubscription(
      new subs.SqsSubscription(imageProcessQueue)
    );

    newImageTopic.addSubscription(
      new subs.LambdaSubscription(updateImageMetadataFn, {
        filterPolicy: {
          "x-metadata-type": sns.SubscriptionFilter.stringFilter({
            allowlist: ["Caption", "Date", "Photographer"],
          }),
        },
      })
    );

    // Event Sources

    // Event source for bad image queue (failed image processing)
    const rejectionMailerEventSource = new events.SqsEventSource(badImageQueue, {
      batchSize: 5,
      maxBatchingWindow: cdk.Duration.seconds(5),
    });

    // Event source for DynamoDB to trigger confirmation email (image added to the table)
    const dynamoStreamEventSource = new events.DynamoEventSource(imagesTable, {
      startingPosition: lambda.StartingPosition.TRIM_HORIZON,
      batchSize: 5,
    });

    // SQS --> Lambda

    processImageFn.addEventSource(new events.SqsEventSource(imageProcessQueue));

    // Trigger rejection email only if the image is moved to the DLQ
    rejectionMailerFn.addEventSource(rejectionMailerEventSource);

    // Trigger confirmation email only if image is successfully processed
    confirmationMailerFn.addEventSource(dynamoStreamEventSource);

    // Permissions

    imagesBucket.grantRead(processImageFn);

    imagesTable.grantReadWriteData(updateImageMetadataFn)
    imagesTable.grantWriteData(processImageFn);
    imagesTable.grantReadWriteData(deleteImageFn)

    // Role Policies

    confirmationMailerFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ses:SendEmail",
          "ses:SendRawEmail",
          "ses:SendTemplatedEmail",
        ],
        resources: ["*"],
      })
    );
    processImageFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["sqs:SendMessage"],
        resources: [badImageQueue.queueArn],
      })
    );
    deleteImageFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:DeleteObject"],
        resources: [imagesBucket.arnForObjects("*")],
      })
    );

    rejectionMailerFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ses:SendEmail",
          "ses:SendRawEmail",
          "ses:SendTemplatedEmail",
        ],
        resources: ["*"],
      })
    );

    // Output
    new cdk.CfnOutput(this, "bucketName", {
      value: imagesBucket.bucketName,
    });
  }
}
