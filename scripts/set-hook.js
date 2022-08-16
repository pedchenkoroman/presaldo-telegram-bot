#!/usr/bin/env node
require('dotenv').config();
const {
  CloudFormationClient,
  DescribeStacksCommand,
} = require('@aws-sdk/client-cloudformation');
const { createSpinner } = require('nanospinner');
const https = require('https');

const { BOT_TOKEN, SECRET_TOKEN } = process.env;
const TELEGRAM_API_URL = 'https://api.telegram.org/bot';

const validation = (data) => {
  const spinner = createSpinner('Check environment variables').start();
  for (const key in data) {
    if (!data[key]) {
      spinner.error({
        text: `Please add ${key} variable to .env file`,
      });
      process.exit(1);
    }
  }
  spinner.success({ text: 'All variables are existed' });
};

(async () => {
  validation({ BOT_TOKEN, SECRET_TOKEN });
  const spinner = createSpinner(
    'Get url from aws api gateway service...',
  ).start();
  const client = new CloudFormationClient({
    region: process.env.AWS_REGION || 'eu-central-1',
  });
  const command = new DescribeStacksCommand({
    StackName: 'PresaldoTelegramBotStack',
  });

  try {
    const {
      Stacks: [Stack],
    } = await client.send(command);
    spinner.success({
      text: 'Url is received',
    });

    spinner.start({ text: 'Setting webhook...' });
    const { description } = await new Promise((resolve, reject) => {
      return https.get(
        `${TELEGRAM_API_URL}${BOT_TOKEN}/setWebHook?url=${Stack.Outputs[0].OutputValue}&secret_token=${SECRET_TOKEN}`,
        (res) => {
          if (res.statusCode !== 200) {
            const { statusCode, statusMessage } = res;
            reject(new Error(`Status code: ${statusCode} ${statusMessage}`));
          }
          res.setEncoding('utf8');
          const buffer = [];
          res.on('data', (chunk) => buffer.push(chunk));
          res.on('end', () => resolve(JSON.parse(buffer.join())));
        },
      );
    });
    spinner.success({ text: description });
  } catch (text) {
    spinner.error({ text });
    process.exit(1);
  }
})();
