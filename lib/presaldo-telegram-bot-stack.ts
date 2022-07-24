import { Construct } from 'constructs';
import { join } from 'path';

import {
  NodejsFunction,
  NodejsFunctionProps,
} from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';

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
    });

    const nodeJsFunctionProps: NodejsFunctionProps = {
      bundling: {
        externalModules: ['aws-sdk'],
      },
      depsLockFilePath: join(__dirname, '../lambdas', 'package-lock.json'),
      environment: {
        PRIMARY_KEY: 'accountId',
        TABLE_NAME: accountsTable.tableName,
      },
      runtime: Runtime.NODEJS_16_X,
    };

    const checkBalance = new NodejsFunction(this, 'checkBalance', {
      entry: join(__dirname, '../lambdas', 'check-balance.ts'),
      ...nodeJsFunctionProps,
    });

    accountsTable.grantReadData(checkBalance);

    new Rule(this, 'scheduleOfCheckBalance', {
      description: 'Run the lambda to check the balance is changed',
      schedule: Schedule.expression('cron(0 8-22 * * ? *)'),
      targets: [new LambdaFunction(checkBalance)],
    });
  }
}
