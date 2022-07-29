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
import {
  AuthorizationType,
  IdentitySource,
  LambdaIntegration,
  RequestAuthorizer,
  RestApi,
} from 'aws-cdk-lib/aws-apigateway';

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const SECRET_TOKEN = process.env.SECRET_TOKEN || '';

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
        externalModules: ['@sparticuz/chrome-aws-lambda'],
      },
      depsLockFilePath: join(__dirname, '../', 'package-lock.json'),
      environment: {
        PRIMARY_KEY: 'accountId',
        TABLE_NAME: accountsTable.tableName,
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
      memorySize: 128,
      environment: {
        BOT_TOKEN,
      },
    });

    changedBalance.addEventSource(
      new DynamoEventSource(accountsTable, {
        startingPosition: StartingPosition.LATEST,
        retryAttempts: 2,
      }),
    );

    const telegramHandler = new NodejsFunction(this, 'telegram-handler', {
      entry: join(__dirname, '/../src/telegram-handler.ts'),
      ...nodeJsFunctionProps,
      memorySize: 128,
      environment: {
        ...nodeJsFunctionProps.environment,
        BOT_TOKEN,
      },
    });

    const guardRequest = new NodejsFunction(this, 'guard-request', {
      entry: join(__dirname, '/../src/guard-lambda.ts'),
      ...nodeJsFunctionProps,
      memorySize: 128,
      environment: {
        BOT_TOKEN,
        SECRET_TOKEN,
      },
    });

    const api = new RestApi(this, 'telegram-hook-api');
    const authorizer = new RequestAuthorizer(this, 'guard', {
      handler: guardRequest,
      identitySources: [
        IdentitySource.header('X-Telegram-Bot-Api-Secret-Token'),
      ],
    });

    api.root.addMethod('POST', new LambdaIntegration(telegramHandler), {
      authorizationType: AuthorizationType.CUSTOM,
      authorizer: authorizer,
    });

    accountsTable.grantReadWriteData(checkBalance);

    new Rule(this, 'scheduleOfCheckBalance', {
      description: 'Run the lambda to check the balance is changed',
      schedule: Schedule.expression('cron(0 14,19 * * ? *)'), // UTC
      targets: [new LambdaFunction(checkBalance)],
    });
  }
}
