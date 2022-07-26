import { Construct } from 'constructs';
import { join } from 'path';

import {
  NodejsFunction,
  NodejsFunctionProps,
} from 'aws-cdk-lib/aws-lambda-nodejs';
import {
  LayerVersion,
  Runtime,
  StartingPosition,
} from 'aws-cdk-lib/aws-lambda';
import { Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import {
  AttributeType,
  BillingMode,
  StreamViewType,
  Table,
} from 'aws-cdk-lib/aws-dynamodb';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';

export class PresaldoTelegramBotStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const accountsTable = new Table(this, 'accounts', {
      partitionKey: {
        name: 'accountId',
        type: AttributeType.NUMBER,
      },
      tableName: 'accounts',
      removalPolicy: RemovalPolicy.DESTROY,
      billingMode: BillingMode.PAY_PER_REQUEST,
      stream: StreamViewType.NEW_IMAGE,
    });

    const nodeJsFunctionProps: NodejsFunctionProps = {
      bundling: {
        externalModules: ['aws-sdk', '@sparticuz/chrome-aws-lambda'],
      },
      depsLockFilePath: join(__dirname, '../', 'package-lock.json'),
      environment: {
        PRIMARY_KEY: 'accountId',
        TABLE_NAME: accountsTable.tableName,
        BOT_TOKEN: process.env.BOT_TOKEN || '',
      },
      runtime: Runtime.NODEJS_16_X,
    };

    const puppeteerLayer = LayerVersion.fromLayerVersionArn(
      this,
      'p-layer',
      'arn:aws:lambda:eu-central-1:764866452798:layer:chrome-aws-lambda:31',
    );

    const checkBalance = new NodejsFunction(this, 'check-balance', {
      entry: join(__dirname, '/../src/check-balance.ts'),
      ...nodeJsFunctionProps,
      memorySize: 1024,
      timeout: Duration.minutes(3),
      layers: [puppeteerLayer],
    });

    const changedBalance = new NodejsFunction(this, 'changed-balance', {
      entry: join(__dirname, '/../src/changed-balance.ts'),
      ...nodeJsFunctionProps,
    });

    changedBalance.addEventSource(
      new DynamoEventSource(accountsTable, {
        startingPosition: StartingPosition.LATEST,
        retryAttempts: 2,
      }),
    );

    accountsTable.grantReadWriteData(checkBalance);

    new Rule(this, 'scheduleOfCheckBalance', {
      description: 'Run the lambda to check the balance is changed',
      schedule: Schedule.expression('cron(0 12,22 * * ? *)'),
      targets: [new LambdaFunction(checkBalance)],
    });
  }
}
