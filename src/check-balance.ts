import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
const chromium = require('@sparticuz/chrome-aws-lambda');
import { fromPairs, compose, propOr, head } from 'ramda';
import { PutItemCommandInput } from '@aws-sdk/client-dynamodb';
import { EventBridgeHandler } from 'aws-lambda';

const TABLE_NAME = process.env.TABLE_NAME || '';

const client = new DynamoDB({ region: process.env.AWS_REGION || '' });

type User = {
  secureCode: string;
  accountId: string;
  accountNumber: string;
  balance: number;
};

export const handler: EventBridgeHandler<any, any, any> = async (
  event,
): Promise<any> => {
  try {
    console.log('EventBridgeHandler', event);
    const user = (await client
      .scan({
        TableName: TABLE_NAME,
      })
      .then(compose(unmarshall, head, propOr([], 'Items')))) as
      | User
      | undefined;
    console.info('User: ', user);
    if (!user) {
      return { statusCode: 500, body: JSON.stringify('User is empty') };
    }

    const browser = await chromium.puppeteer.launch({
      args: chromium.args,
      defaultViewport: {
        width: 1024,
        height: 800,
      },
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });
    const page = await browser.newPage();
    await page.goto('https://www.prepaidsaldo.com');

    const fillField = async ([selector, value]: string[]): Promise<void> => {
      const field = await page.$(selector);
      return field.type(value);
    };
    for (const item of [
      ['#mainform\\:cardnumber', user.accountNumber],
      ['#mainform\\:password', user.secureCode],
    ]) {
      await fillField(item);
    }

    const nextBtn = await page.$('a.last');
    await nextBtn.click();
    await page.waitForSelector('#scrollable-content');

    const table = await page.$('table.data');

    const takeSecond = ([, second]: any) => second;

    const currentBalance = await table
      .$$eval('tr', (node: Array<any>) =>
        node.map((n) => n.innerText).map((text) => text.split('\t')),
      )
      .then(compose(takeSecond, Object.values, fromPairs));
    await browser.close();
    console.info('Current balance: ', currentBalance);

    // const { balance } = user;
    // if (balance === currentBalance) {
    //   return { statusCode: 204, body: 'Nothing changes' };
    // }
    const params: PutItemCommandInput = {
      TableName: TABLE_NAME,
      Item: marshall(Object.assign({}, user, { balance: currentBalance })),
    };
    console.info('Before put item. Item:', params.Item);
    await client.putItem(params);
    return { statusCode: 204, body: 'The balance was updated' };
  } catch (error) {
    console.error('Error: ', error);
    return { statusCode: 500, body: JSON.stringify('Something went wrong') };
  }
};
